import { handleAuth } from "@workos-inc/authkit-nextjs";

/**
 * WorkOS AuthKit callback — exchanges the auth code and seals the session
 * into an encrypted httpOnly cookie (BFF decision #7).
 *
 * Must match NEXT_PUBLIC_WORKOS_REDIRECT_URI (default: /callback).
 * returnPathname: /account — minimal surface to verify the session.
 *
 * Never log the code, tokens, or user payload here.
 */
export const GET = handleAuth({
  returnPathname: "/account",
});
