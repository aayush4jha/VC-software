// Pins src/lib/email-html.ts — see package.json's test:emailhtml.
//
// Two jobs: keep the layout a sender built, and remove everything that could
// act on its own. The sandboxed frame is the second line of defence, so these
// cases assume it might one day be misconfigured.

import { sanitizeEmailHtml, looksLikeHtml, textToDocument }
    from '../.emailhtml-test/email-html.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = got === want;
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)?.slice(0, 160)}\n     want: ${JSON.stringify(want)?.slice(0, 160)}`); }
}
const has = (html, needle) => html.includes(needle);
const sanitize = (s) => sanitizeEmailHtml(s).html;

console.log('— the layout is the mail, so it is kept —');
const marketing = '<table width="600" cellpadding="0"><tr><td style="padding:20px;background:#fff">'
    + '<img src="https://cdn.sbi/banner.png" width="600"><p style="font-size:16px">Dear Aayush,</p>'
    + '</td></tr></table>';
check('tables survive', has(sanitize(marketing), '<table width="600" cellpadding="0">'), true);
check('inline styles survive', has(sanitize(marketing), 'style="padding:20px;background:#fff"'), true);
check('images survive', has(sanitize(marketing), 'src="https://cdn.sbi/banner.png"'), true);
check('nothing was removed from a clean mail', sanitizeEmailHtml(marketing).changed, false);
check('a style block survives, since it positions things', has(sanitize('<style>.a{color:red}</style><p>x</p>'), '.a{color:red}'), true);

console.log('— anything that could act is removed —');
check('scripts go', has(sanitize('<p>hi</p><script>alert(1)</script>'), 'alert'), false);
check('an unclosed script tag goes', has(sanitize('<script src="https://evil/x.js">'), 'script'), false);
check('iframes go', has(sanitize('<iframe src="https://evil"></iframe>'), 'iframe'), false);
check('forms go', has(sanitize('<form action="https://evil"><input></form>'), '<form'), false);
check('onerror goes', has(sanitize('<img src="x" onerror="alert(1)">'), 'onerror'), false);
check('onclick in single quotes goes', has(sanitize("<div onclick='steal()'>x</div>"), 'onclick'), false);
check('an unquoted handler goes', has(sanitize('<div onmouseover=steal()>x</div>'), 'onmouseover'), false);
check('the element itself survives its handler', has(sanitize('<img src="https://ok/x.png" onerror="x()">'), 'src="https://ok/x.png"'), true);
check('javascript: urls go', has(sanitize('<a href="javascript:alert(1)">x</a>'), 'javascript:'), false);
check('a data: url goes', has(sanitize('<a href="data:text/html,<script>x</script>">x</a>'), 'data:text/html'), false);
check('meta refresh goes', has(sanitize('<meta http-equiv="refresh" content="0;url=https://evil">'), 'refresh'), false);
check('a remote stylesheet goes', has(sanitize('<link rel="stylesheet" href="https://evil/x.css">'), '<link'), false);
check('removal is reported', sanitizeEmailHtml('<p>x</p><script>y</script>').changed, true);

console.log('— links leave the frame —');
check('a link opens in a new tab', has(sanitize('<a href="https://bigbasket.com">Shop</a>'), 'target="_blank"'), true);
check('and does not leak the opener', has(sanitize('<a href="https://bigbasket.com">Shop</a>'), 'rel="noopener noreferrer nofollow"'), true);
check('its own href is untouched', has(sanitize('<a href="https://bigbasket.com/x?a=1">Shop</a>'), 'href="https://bigbasket.com/x?a=1"'), true);

console.log('— the document around it —');
const doc = sanitize('<p>x</p>');
check('it is a whole document', doc.startsWith('<!doctype html>'), true);
check('it declares its charset', has(doc, '<meta charset="utf-8">'), true);
check('it forbids everything but images and inline style', has(doc, "default-src 'none'"), true);
check('images may still load', has(doc, 'img-src http: https: data: cid:'), true);
check('no referrer goes back to the sender', has(doc, 'content="no-referrer"'), true);
check('images cannot overflow the column', has(doc, 'img { max-width: 100%'), true);
check('an empty mail produces nothing', sanitizeEmailHtml('').html, '');
check('whitespace counts as empty', sanitizeEmailHtml('   \n  ').html, '');

console.log('— is it HTML at all? —');
check('a table layout is', looksLikeHtml('<table><tr><td>x</td></tr></table>'), true);
check('a single break is', looksLikeHtml('Hi<br>there'), true);
check('plain text is not', looksLikeHtml('Hi Ravi,\n\nThanks for sending this.'), false);
check('a comparison is not', looksLikeHtml('revenue < 10 Cr and growth > 20%'), false);
check('an empty string is not', looksLikeHtml(''), false);

console.log('— plain text goes through the same frame —');
const textDoc = textToDocument('Hi Ravi,\n\nSee https://acme.com/deck.pdf');
check('it is a whole document', textDoc.startsWith('<!doctype html>'), true);
check('line breaks are preserved', has(textDoc, 'white-space:pre-wrap'), true);
check('a bare url becomes a link', has(textDoc, 'href="https://acme.com/deck.pdf"'), true);
check('angle brackets are escaped, not rendered', has(textToDocument('a <script>x</script> b'), '&lt;script&gt;'), true);
check('and cannot become a tag', has(textToDocument('a <script>x</script> b'), '<script>'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
