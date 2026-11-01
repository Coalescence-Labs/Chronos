const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char);
}

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, "https://example.invalid");
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return null;
  }
  return null;
}

/**
 * Render a small subset of markdown to safe HTML for Agent replies.
 * Untrusted model output — no raw HTML, no javascript/data URLs.
 */
export function renderSafeAgentMarkdown(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n").slice(0, 12_000);
  const escaped = escapeHtml(normalized);
  const withCode = escaped.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  const withBold = withCode.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  const withLinks = withBold.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_match, label: string, href: string) => {
    const safe = sanitizeHref(href);
    return safe ? `<a href="${safe}" rel="noopener noreferrer">${label}</a>` : label;
  });
  return withLinks
    .split("\n\n")
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}
