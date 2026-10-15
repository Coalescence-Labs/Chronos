"use client";

import { useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { IngestError } from "@/lib/ingest/errors";
import { parseRepoInput } from "@/lib/ingest/github/parse";
import styles from "./url-form.module.css";

/**
 * The v1 entry point (decision #3): paste a public GitHub URL. Validation is
 * parseRepoInput — the same parser the BFF route trusts — so bad input fails
 * inline before repo navigation or ingestion.
 */

export function RepoUrlForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prefetched = useRef<{ path: string; expiresAt: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repoCode = useRef<Promise<unknown> | null>(null);

  const warmRepoCode = useCallback(() => {
    if (repoCode.current) return;
    repoCode.current = import("./RepoScreen");
    repoCode.current.catch(() => { repoCode.current = null; });
  }, []);

  const cancelHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  useEffect(() => {
    router.prefetch("/demo", { kind: PrefetchKind.FULL });
    warmRepoCode();
    return () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    };
  }, [router, warmRepoCode]);

  const prefetchRepo = (input: string) => {
    try {
      const { owner, repo } = parseRepoInput(input);
      warmRepoCode();
      const path = `/repo/${owner}/${repo}`;
      if (prefetched.current?.path === path && prefetched.current.expiresAt > Date.now()) return;
      router.prefetch(path, { kind: PrefetchKind.FULL });
      prefetched.current = { path, expiresAt: Date.now() + 30_000 };
    } catch {
      // Validation errors remain a submit-time affordance.
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    cancelHover();
    try {
      const { owner, repo } = parseRepoInput(value);
      setError(null);
      // Source enum only — never the owner/repo the user typed (PRIVACY.md).
      track({ name: "repo_submitted", props: { source: "url" } });
      router.push(`/repo/${owner}/${repo}`);
    } catch (cause) {
      setError(
        cause instanceof IngestError
          ? cause.message
          : "That doesn't look like a GitHub repository.",
      );
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.label} htmlFor="repo-url">
        Public GitHub repository
      </label>
      <div className={styles.controls}>
        <input
          id="repo-url"
          className={styles.input}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="github.com/owner/repo"
          onFocus={warmRepoCode}
          value={value}
          onChange={(event) => {
            cancelHover();
            setValue(event.target.value);
            setError(null);
          }}
          onPaste={(event) => {
            cancelHover();
            const input = event.currentTarget;
            const pasted = event.clipboardData.getData("text");
            prefetchRepo(value.slice(0, input.selectionStart ?? 0) + pasted + value.slice(input.selectionEnd ?? value.length));
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? "repo-url-error" : undefined}
        />
        <Button
          type="submit"
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) prefetchRepo(value);
          }}
          onPointerEnter={() => {
            cancelHover();
            hoverTimer.current = setTimeout(() => prefetchRepo(value), 150);
          }}
          onPointerLeave={cancelHover}
          onPointerDown={cancelHover}
        >
          Visualize
        </Button>
      </div>
      {error && (
        <p id="repo-url-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
