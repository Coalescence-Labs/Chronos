import { branchPriority } from "./lines";

/**
 * Staple branches (COA-784): the long-lived branches every repo shares wear
 * one fixed color everywhere, so they're recognizable before any label is
 * read. Pure — the color tokens live with the renderer.
 *
 * - "trunk": main / master / trunk, or the repo's default branch whatever
 *   it's called (e.g. `production`).
 * - "develop": develop / dev / development.
 *
 * Names win over default-ness: a repo whose default is `develop` still shows
 * develop in the develop color and main in the trunk color, so the two never
 * swap meaning between repos.
 */
export type StapleRole = "trunk" | "develop";

export function stapleRole(name: string, defaultBranch?: string): StapleRole | undefined {
  const priority = branchPriority(name);
  if (priority === 0) return "trunk";
  if (priority === 1) return "develop";
  if (defaultBranch !== undefined && name === defaultBranch) return "trunk";
  return undefined;
}
