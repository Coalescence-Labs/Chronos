import styles from "./profile-menu.module.css";

/**
 * Stable header chrome while AuthKit / the AccountControls island resolve.
 * Matches ProfileMenu trigger footprint so signed-in users never flash "Sign in".
 */
export function AccountControlsSkeleton() {
  return (
    <span
      className={styles.skeleton}
      role="status"
      aria-busy="true"
      aria-label="Loading account"
    />
  );
}
