"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signInHrefForReturn } from "@/lib/auth/return-to";
import buttonStyles from "@/components/ui/button.module.css";
import styles from "./profile-menu.module.css";

/**
 * Ghost Sign in control — signed-out AccountControls only. While AuthKit or
 * the lazy island resolve, AccountControlsSkeleton holds the header slot so
 * signed-in users never flash this CTA.
 */
export function SignInLink() {
  const pathname = usePathname() || "/";

  return (
    <Link
      className={`${buttonStyles.button} ${buttonStyles.ghost} ${styles.signIn}`}
      href={signInHrefForReturn(pathname)}
      prefetch={false}
    >
      Sign in
    </Link>
  );
}
