import { Marked, type Tokens } from "marked";

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

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

function safeLang(lang?: string): string | null {
  if (!lang) return null;
  const cleaned = lang.trim().split(/\s+/)[0] ?? "";
  return /^[a-z0-9_+.-]+$/i.test(cleaned) ? cleaned : null;
}

/**
 * Organic LLM chat path: `marked` lexer blocks + ReactMarkdown/GFM on the client.
 * Chronos keeps the existing server HTML contract (`payload.html` +
 * `dangerouslySetInnerHTML`) but uses the same `marked` engine with a
 * renderer that never emits raw HTML, plus an allowlist scrubber.
 */
const agentMarked = new Marked();

agentMarked.use({
  gfm: true,
  breaks: false,
  renderer: {
    html() {
      return "";
    },
    image() {
      return "";
    },
    checkbox() {
      return "";
    },
    code({ text, lang }: Tokens.Code) {
      const language = safeLang(lang);
      const cls = language ? ` class="language-${language}"` : "";
      return `<pre><code${cls}>${escapeHtml(text)}\n</code></pre>\n`;
    },
    codespan({ text }: Tokens.Codespan) {
      return `<code>${escapeHtml(text)}</code>`;
    },
    heading({ tokens, depth }: Tokens.Heading) {
      const level = Math.min(Math.max(depth, 1), 3);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    link({ href, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      const safe = sanitizeHref(href ?? "");
      if (!safe) return label;
      return `<a href="${escapeHtml(safe)}" rel="noopener noreferrer" target="_blank">${label}</a>`;
    },
    tablecell(token: Tokens.TableCell) {
      const tag = token.header ? "th" : "td";
      return `<${tag}>${this.parser.parseInline(token.tokens)}</${tag}>`;
    },
  },
});

/**
 * Defense-in-depth: strip any tag/attr that slipped past the renderer.
 * Model output is untrusted (PRIVACY.md Agent §8).
 */
export function sanitizeAgentHtml(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  return withoutComments.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag} />`;
    if (tag === "a") {
      const hrefMatch =
        /\bhref\s*=\s*"([^"]*)"/i.exec(attrs) ?? /\bhref\s*=\s*'([^']*)'/i.exec(attrs);
      const safe = hrefMatch ? sanitizeHref(hrefMatch[1] ?? "") : null;
      if (!safe) return "";
      return `<a href="${escapeHtml(safe)}" rel="noopener noreferrer" target="_blank">`;
    }
    if (tag === "code") {
      const langMatch = /\bclass\s*=\s*"language-([a-z0-9_+.-]+)"/i.exec(attrs);
      return langMatch ? `<code class="language-${langMatch[1]}">` : "<code>";
    }
    return `<${tag}>`;
  });
}

/**
 * Render markdown to safe HTML for Agent replies (and user bubbles).
 * Untrusted model/user text — no raw HTML, no javascript/data URLs, no images.
 */
export function renderSafeAgentMarkdown(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n").slice(0, 12_000);
  const parsed = agentMarked.parse(normalized, { async: false });
  const html = typeof parsed === "string" ? parsed : "";
  return sanitizeAgentHtml(html);
}
