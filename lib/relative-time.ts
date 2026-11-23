const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** Compact "2 hours ago" style label; falls back to a short date after a month. */
export function formatRelative(then: number, now: number): string {
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return formatter.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return formatter.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return formatter.format(-Math.floor(elapsed / DAY), "day");
  if (elapsed < 30 * DAY) return formatter.format(-Math.floor(elapsed / (7 * DAY)), "week");
  return dateFormatter.format(then);
}
