"use client";

import { useEffect, useState } from "react";
import type { PublicGitHubConnection } from "@/lib/github-app/types";
import { GitHubConnectionCard, GitHubConnectionCardPending } from "./GitHubConnectionCard";

export interface AccountGitHubConnectionRehydrateProps {
  /** `?github=` flash from connect / callback / disconnect. */
  status?: string;
}

/**
 * The status endpoint checks durable bindings and current GitHub authorization.
 * Provider outages remain distinct from a disconnected account.
 */
export function AccountGitHubConnectionRehydrate({
  status,
}: AccountGitHubConnectionRehydrateProps) {
  const [connection, setConnection] = useState<PublicGitHubConnection | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/github/status", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        });
        const body = (await res.json()) as PublicGitHubConnection;
        if (typeof body.configured !== "boolean" || typeof body.connected !== "boolean") throw new Error("Invalid connection status");
        if (!cancelled) setConnection(body);
      } catch {
        if (!cancelled) {
          setConnection({
            connected: false,
            login: null,
            permissions: null,
            connectedAt: null,
            configured: true,
            state: "unavailable",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, attempt]);

  if (!connection) {
    return <GitHubConnectionCardPending />;
  }

  return <GitHubConnectionCard connection={connection} status={status} onRetry={() => {
    setConnection(null); setAttempt((value) => value + 1);
  }} />;
}
