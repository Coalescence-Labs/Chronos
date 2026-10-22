import { AccountGitHubConnectionRehydrate } from "./AccountGitHubConnectionRehydrate";

export interface AccountGitHubConnectionProps {
  workosUserId: string;
  status?: string;
}

/** Validate live access before showing a connected status. The account route checks sign-in. */
export function AccountGitHubConnection({ status }: AccountGitHubConnectionProps) {
  return <AccountGitHubConnectionRehydrate key={status} status={status} />;
}
