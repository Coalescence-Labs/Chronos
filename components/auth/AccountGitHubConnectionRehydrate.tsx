"use client";

import { useEffect, useState } from "react";
import type { PublicGitHubConnection } from "@/lib/github-app/types";
import { GitHubConnectionCard, GitHubConnectionCardPending } from "./GitHubConnectionCard";

export interface AccountGitHubConnectionRehydrateProps {
  /** `?github=` flash from connect / callback / disconnect. */
  status?: string;
}

/**
 * Cold path after sign-in when WorkOS metadata has an install but gh-session
 * was cleared — GET /api/github/status re-seals the cookie (Route Handler).
 */
export function AccountGitHubConnectionRehydrate({
  status,
}: AccountGitHubConnectionRehydrateProps) {
  const [connection, setConnection] = useState<PublicGitHubConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/github/status", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as PublicGitHubConnection;
        if (!cancelled) setConnection(body);
      } catch {
        if (!cancelled) {
          setConnection({
            connected: false,
            login: null,
            permissions: null,
            connectedAt: null,
            configured: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!connection) {
    return <GitHubConnectionCardPending />;
  }

  return <GitHubConnectionCard connection={connection} status={status} />;
}
