"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useEffect, useRef, useState } from "react";
import { useRepoLibrary } from "@/components/repo/useRepoLibrary";
import { track } from "@/lib/analytics";
import {
  browserRepoStorage,
  clearRecents,
  repoKey,
  togglePin,
  type RepoLibrary,
  type SavedRepo,
} from "@/lib/recent-repos";
import { formatRelative } from "@/lib/relative-time";
import styles from "./home.module.css";

/**
 * Pinned + recent repos for the signed-in home (COA-151). Device-local: the
 * list never leaves this browser and no owner/repo reaches analytics.
 * Renders nothing until the signed-in user is adopted, so the form above never
 * moves and an empty state never flashes for returning users.
 */

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    </svg>
  );
}

interface GroupProps {
  title: string;
  source: "recent" | "pinned";
  items: SavedRepo[];
  now: number;
  onOpen: (path: string) => void;
  onPin: (item: SavedRepo) => void;
  action?: React.ReactNode;
}

function RepoGroup({ title, source, items, now, onOpen, onPin, action }: GroupProps) {
  const headingId = `repos-${source}`;
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <div className={styles.groupHeader}>
        <h2 id={headingId} className={styles.groupTitle}>{title}</h2>
        {action}
      </div>
      <ul className={styles.list}>
        {items.map((item) => {
          const key = repoKey(item.owner, item.repo);
          const path = `/repo/${item.owner}/${item.repo}`;
          const name = `${item.owner}/${item.repo}`;
          return (
            <li key={key} className={styles.row}>
              <Link
                className={styles.rowLink}
                href={path}
                prefetch={false}
                onPointerEnter={() => onOpen(path)}
                onFocus={() => onOpen(path)}
                onClick={() => track({ name: "repo_submitted", props: { source } })}
              >
                <span className={styles.repoName}>
                  <span className={styles.owner}>{item.owner}/</span>
                  <span className={styles.repo}>{item.repo}</span>
                </span>
                <time className={styles.when} dateTime={new Date(item.lastViewedAt).toISOString()}>
                  {formatRelative(item.lastViewedAt, now)}
                </time>
              </Link>
              <button
                type="button"
                className={styles.pin}
                data-pin-key={key}
                aria-pressed={item.pinned}
                aria-label={`Pin ${name}`}
                onClick={() => onPin(item)}
              >
                <PinIcon filled={item.pinned} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface RepoLibraryViewProps {
  library: RepoLibrary;
  now: number;
  onOpen: (path: string) => void;
  onPin: (item: SavedRepo) => void;
  onClear: () => void;
}

export function RepoLibraryView({ library, now, onOpen, onPin, onClear }: RepoLibraryViewProps) {
  if (library.pinned.length === 0 && library.recent.length === 0) {
    return (
      <p className={styles.empty}>
        Repos you open will show up here, or <Link href="/demo">explore the demo repo</Link>.
      </p>
    );
  }

  return (
    <div className={styles.library}>
      {library.pinned.length > 0 && (
        <RepoGroup title="Pinned" source="pinned" items={library.pinned} now={now} onOpen={onOpen} onPin={onPin} />
      )}
      {library.recent.length > 0 && (
        <RepoGroup
          title="Recent"
          source="recent"
          items={library.recent}
          now={now}
          onOpen={onOpen}
          onPin={onPin}
          action={
            <button type="button" className={styles.clear} onClick={onClear}>
              Clear recents
            </button>
          }
        />
      )}
    </div>
  );
}

export function RepoLibraryContainer() {
  const router = useRouter();
  const library = useRepoLibrary();
  const prefetched = useRef(new Set<string>());
  const focusKey = useRef<string | null>(null);
  const [now] = useState(() => Date.now());

  // A toggled repo moves between groups (a remount); hand focus back to its pin.
  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    document.querySelector<HTMLElement>(`[data-pin-key="${CSS.escape(key)}"]`)?.focus();
  }, [library]);

  if (!library) return null;

  return (
    <RepoLibraryView
      library={library}
      now={now}
      onOpen={(path) => {
        if (prefetched.current.has(path)) return;
        prefetched.current.add(path);
        router.prefetch(path, { kind: PrefetchKind.FULL });
        void import("@/components/repo/RepoScreen").catch(() => {});
      }}
      onPin={(item) => {
        const storage = browserRepoStorage();
        if (!storage) return;
        focusKey.current = repoKey(item.owner, item.repo);
        togglePin(storage, item.owner, item.repo);
      }}
      onClear={() => {
        const storage = browserRepoStorage();
        if (storage) clearRecents(storage);
      }}
    />
  );
}
