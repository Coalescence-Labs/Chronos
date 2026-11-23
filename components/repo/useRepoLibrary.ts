"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  browserRepoStorage,
  getAdoptedUser,
  REPOS_CHANGE_EVENT,
  REPOS_STORAGE_KEY,
  selectLibrary,
  type RepoLibrary,
} from "@/lib/recent-repos";

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === REPOS_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(REPOS_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(REPOS_CHANGE_EVENT, onChange);
  };
}

/** Raw stored string: a primitive, so React sees a stable snapshot between writes. */
function getRaw(): string | null {
  try {
    return browserRepoStorage()?.getItem(REPOS_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user's library. `null` until this page load has adopted the
 * current user (server render and first client render included), so a previous
 * user's leftovers and the empty state never flash.
 */
export function useRepoLibrary(): RepoLibrary | null {
  const raw = useSyncExternalStore(subscribe, getRaw, () => null);
  const adopted = useSyncExternalStore(subscribe, getAdoptedUser, () => null);
  return useMemo(() => (adopted ? selectLibrary(raw, adopted) : null), [raw, adopted]);
}
