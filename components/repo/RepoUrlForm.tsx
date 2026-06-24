"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui";
import { track } from "@/lib/analytics";
import { IngestError, parseRepoInput } from "@/lib/ingest";
import styles from "./url-form.module.css";

/**
 * The v1 entry point (decision #3): paste a public GitHub URL. Validation is
 * parseRepoInput — the same parser the BFF route trusts — so bad input fails
 * inline before any navigation or network.
 */

export function RepoUrlForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
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
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? "repo-url-error" : undefined}
        />
        <Button type="submit">Visualize</Button>
      </div>
      {error && (
        <p id="repo-url-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
