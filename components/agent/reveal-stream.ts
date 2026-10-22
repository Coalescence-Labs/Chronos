/** Progressive text reveal for Agent replies (respects reduced motion). */
export function revealAgentText(
  full: string,
  onSlice: (partial: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!full) {
    onSlice("");
    return Promise.resolve();
  }
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    onSlice(full);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let index = 0;
    const step = () => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      index = Math.min(full.length, index + Math.max(2, Math.ceil(full.length / 36)));
      onSlice(full.slice(0, index));
      if (index >= full.length) {
        resolve();
        return;
      }
      window.setTimeout(step, 24);
    };
    step();
  });
}
