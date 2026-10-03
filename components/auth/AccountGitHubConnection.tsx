import {
  peekGitHubInstallBinding,
  readGitHubAppSessionForUser,
  toPublicGitHubConnection,
} from "@/lib/github-app";
import { AccountGitHubConnectionRehydrate } from "./AccountGitHubConnectionRehydrate";
import { GitHubConnectionCard } from "./GitHubConnectionCard";

export interface AccountGitHubConnectionProps {
  workosUserId: string;
  /** `?github=` flash from connect / callback / disconnect. */
  status?: string;
}

/**
 * Account GitHub card — warm gh-session renders immediately; metadata-only
 * binding uses GET /api/github/status to persist the cookie (not RSC).
 */
export async function AccountGitHubConnection({
  workosUserId,
  status,
}: AccountGitHubConnectionProps) {
  const fromCookie = await readGitHubAppSessionForUser(workosUserId);
  if (fromCookie) {
    return (
      <GitHubConnectionCard
        connection={toPublicGitHubConnection(fromCookie)}
        status={status}
      />
    );
  }

  const binding = await peekGitHubInstallBinding(workosUserId);
  if (binding) {
    return <AccountGitHubConnectionRehydrate status={status} />;
  }

  return (
    <GitHubConnectionCard
      connection={toPublicGitHubConnection(undefined)}
      status={status}
    />
  );
}
