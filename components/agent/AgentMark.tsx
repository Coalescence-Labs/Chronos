export function AgentMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8.2 15.4 15.8 8.6M8.2 15.4l8.5 1.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
