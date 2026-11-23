import "server-only";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "./config";

/**
 * Whether `/` should render the signed-in home. Only the variant is decided
 * here — no identity reaches the page HTML. Any failure resolves to the public
 * home, so a WorkOS outage can never break the front door.
 */
export async function isSignedIn(
  getAuth: () => Promise<{ user: unknown }> = () => withAuth({ ensureSignedIn: false }),
): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  try {
    const { user } = await getAuth();
    return Boolean(user);
  } catch {
    return false;
  }
}
