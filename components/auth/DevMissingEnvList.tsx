import styles from "./github-connection.module.css";

export function DevMissingEnvList({ names }: { names: string[] | undefined }) {
  if (!names?.length) return null;
  return (
    <ul className={styles.devEnvList} aria-label="Missing environment variables">
      {names.map((name) => (
        <li key={name}>
          <code>{name}</code> still needs to be set
        </li>
      ))}
    </ul>
  );
}
