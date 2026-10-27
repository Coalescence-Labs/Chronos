/**
 * Progressive Agent reply reveal.
 *
 * Markdown chunking mirrors Organic LLM / Arcadia `CHAT_STREAM_CHUNKING`
 * (organic-llm `lib/llm/chat-stream-chunking.ts`): complete fences, headings,
 * lines, and blank newlines — so the visible prefix never lands mid-structure
 * and reflows when markdown later renders.
 *
 * Timing targets ~10ms per character (owner: Nebulae ripple stream settings).
 * Honors `prefers-reduced-motion`.
 */

/** Arcadia / Organic LLM chat stream chunking — do not reinvent. */
export const AGENT_MARKDOWN_CHUNKING =
  /(```[\s\S]*?```|^#{1,6}\s.*$|[^\n]+(?:\n|$)|\n)/gm;

export const AGENT_REVEAL_MS_PER_CHAR = 10;

export function chunkAgentMarkdown(text: string): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  const re = new RegExp(AGENT_MARKDOWN_CHUNKING.source, AGENT_MARKDOWN_CHUNKING.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].length > 0) chunks.push(match[0]);
  }
  return chunks;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(id);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function revealAgentText(
  full: string,
  onSlice: (partial: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!full) {
    onSlice("");
    return Promise.resolve();
  }
  if (prefersReducedMotion()) {
    onSlice(full);
    return Promise.resolve();
  }

  const chunks = chunkAgentMarkdown(full);
  if (chunks.length === 0) {
    onSlice(full);
    return Promise.resolve();
  }

  return (async () => {
    let shown = "";
    for (const chunk of chunks) {
      if (signal?.aborted) return;
      shown += chunk;
      onSlice(shown);
      await wait(chunk.length * AGENT_REVEAL_MS_PER_CHAR, signal);
    }
  })();
}
