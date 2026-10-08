// Showing a mail the way its sender built it.
//
// A marketing email is a nested table layout held together by images and cell
// widths. Flattening it to text — which is what the reading pane used to do —
// keeps the words and throws away everything that positioned them, so the
// result is a column of stray fragments separated by the blank runs where the
// images used to be. That is not a rendering of the mail; it is its debris.
//
// So the HTML is rendered. It arrives from strangers, so it is cleaned first
// and then displayed inside a sandboxed frame that cannot run scripts — two
// independent defences, because either one alone is a single point of failure.
//
// Pure, and pinned by scripts/verify-email-html.mjs.

/** Tags that are never content, whatever is inside them. */
const DROP_WHOLE = /<(script|noscript|iframe|object|embed|applet|form|base|meta|link|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** The same tags when they are left unclosed, plus the void ones. */
const DROP_OPEN = /<\/?(script|noscript|iframe|object|embed|applet|form|base|meta|link|title)\b[^>]*>/gi;
/** onclick, onerror, onload… in any quoting, or none. */
const EVENT_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/** javascript:, vbscript: and data: URLs in href/src/action/background. */
const DANGEROUS_URL = /\s(href|src|action|background|formaction)\s*=\s*(?:"\s*(?:javascript|vbscript|data)\s*:[^"]*"|'\s*(?:javascript|vbscript|data)\s*:[^']*'|(?:javascript|vbscript|data)\s*:[^\s>]*)/gi;

export interface SanitizedEmail {
    /** A complete document, ready for an iframe's srcdoc. */
    html: string;
    /** True when anything was removed — shown to the reader as a note. */
    changed: boolean;
}

/**
 * The document that goes into the frame.
 *
 * Inline styles and table attributes are kept, because they ARE the layout.
 * What goes is anything that executes, navigates or phones home on its own.
 */
export function sanitizeEmailHtml(raw: string): SanitizedEmail {
    if (!raw || !raw.trim()) return { html: '', changed: false };

    const cleaned = raw
        .replace(DROP_WHOLE, '')
        .replace(DROP_OPEN, '')
        .replace(EVENT_ATTR, '')
        .replace(DANGEROUS_URL, ' ')
        // A link opening inside the frame would navigate the reading pane.
        .replace(/<a\b/gi, '<a target="_blank" rel="noopener noreferrer nofollow"');

    return { html: wrapDocument(cleaned), changed: cleaned !== raw };
}

/**
 * The frame's own stylesheet.
 *
 * Senders build for a 600px column and Outlook, so two things have to be
 * imposed: a readable base font for the mail that sets none, and a hard stop
 * on horizontal overflow, since a fixed-width table in a narrow pane would
 * otherwise push a scrollbar across the whole reading column.
 */
const FRAME_CSS = `
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px; line-height: 1.6; color: #0f172a;
    background: #ffffff;
    overflow-x: auto; word-break: break-word;
  }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; }
  a { color: #4f46e5; }
  /* A sender's own spacing is kept; only runaway empty cells are reined in. */
  td:empty, p:empty, div:empty { line-height: 0; }
  blockquote { margin: 8px 0 8px 12px; padding-left: 10px; border-left: 2px solid #e2e8f0; color: #475569; }
`;

function wrapDocument(body: string): string {
    return `<!doctype html><html><head><meta charset="utf-8">`
        // No remote CSS, no plugins, and images may not carry a referrer back.
        + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data: cid:; style-src 'unsafe-inline'; font-src http: https: data:">`
        + `<meta name="referrer" content="no-referrer">`
        + `<style>${FRAME_CSS}</style></head><body>${body}</body></html>`;
}

/**
 * Is this worth rendering as HTML at all?
 *
 * A plain-text mail that happens to contain an angle bracket is not, and
 * putting it through the frame would cost a round trip for nothing.
 */
export function looksLikeHtml(raw: string): boolean {
    if (!raw) return false;
    return /<(?:html|body|table|div|p|br|img|a|span|td|tr|h[1-6])\b[^>]*>/i.test(raw);
}

/**
 * A plain-text mail as a document, so one frame renders both kinds.
 * Escaped, wrapped, and with bare URLs made clickable.
 */
export function textToDocument(text: string): string {
    const escaped = (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const linked = escaped.replace(
        /(https?:\/\/[^\s<>"')\]]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
    );
    return wrapDocument(`<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${linked}</pre>`);
}
