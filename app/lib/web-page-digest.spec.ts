import { describe, expect, it } from 'vitest';
import {
  appendWebReferenceToMessages,
  detectWebReferenceRequest,
  extractCssPalette,
  extractWebPageDigest,
  formatWebReferenceBlock,
  isSameSitePageLink,
} from './web-page-digest';

/*
 * BUG-AGENT-WEBCLONE-001 — pins the pure half of « cloner un site depuis une
 * URL ». Each block below is a guard against a regression that was observed
 * or is one careless edit away.
 */

const SITE_HTML = `<!doctype html>
<html lang="fr">
<head>
  <title>Volt-Watt &amp; Cie — Énergie solaire</title>
  <meta name="description" content="Installateur photovolta&iuml;que en France">
  <meta name="theme-color" content="#0f9d58">
  <meta property="og:image" content="/img/og.jpg">
  <link rel="stylesheet" href="/assets/app.css">
  <link rel="preload" href="/assets/font.woff2" as="font">
  <style>
    :root { --brand: #0F9D58; }
    body { font-family: "Inter", system-ui, sans-serif; color: #222222; background: #ffffff; }
    .cta { background: #0f9d58; color: #fff; }
    h1 { font-family: 'Poppins', sans-serif; color: rgb(15, 157, 88); }
  </style>
  <script>window.__x = "<h1>not a heading</h1>";</script>
</head>
<body>
  <nav>
    <a href="/">Accueil</a>
    <a href="/solutions">Solutions</a>
    <a href="https://www.volt-watt.com/simulateur/">Simulateur</a>
    <a href="/contact#form">Contact</a>
    <a href="/login">Connexion</a>
    <a href="/brochure.pdf">Brochure</a>
    <a href="mailto:hello@volt-watt.com">Mail</a>
    <a href="https://facebook.com/voltwatt">Facebook</a>
  </nav>
  <main>
    <h1>Passez au solaire</h1>
    <p style="color:#123456">Économisez jusqu&#39;à 70&nbsp;% sur votre facture.</p>
    <img src="/img/toiture.jpg" alt="toiture">
    <img src="data:image/png;base64,AAAA">
    <h2>Nos solutions</h2>
  </main>
  <footer>© Volt-Watt</footer>
</body>
</html>`;

describe('detectWebReferenceRequest', () => {
  it('finds absolute URLs, strips trailing punctuation and de-duplicates', () => {
    const request = detectWebReferenceRequest(
      'Regarde https://volt-watt.com/, puis https://volt-watt.com et https://volt-watt.com/tarifs).',
    );

    expect(request.urls).toEqual(['https://volt-watt.com/', 'https://volt-watt.com/tarifs']);
    expect(request.cloneIntent).toBe(false);
  });

  it('detects the clone intent in French and English', () => {
    expect(detectWebReferenceRequest('Clone le site https://volt-watt.com').cloneIntent).toBe(true);
    expect(detectWebReferenceRequest('reproduis exactement https://a.fr').cloneIntent).toBe(true);
    expect(detectWebReferenceRequest('Make a copy of https://a.io').cloneIntent).toBe(true);
    expect(detectWebReferenceRequest('fais un site comme ce site https://a.io').cloneIntent).toBe(true);
    expect(detectWebReferenceRequest('Lis https://a.io et dis-moi ce que fait cette page').cloneIntent).toBe(false);
  });

  it('accepts a bare domain ONLY together with a clone intent (« socket.io » stays a package)', () => {
    expect(detectWebReferenceRequest('clone volt-watt.com avec toutes ses pages').urls).toEqual([
      'https://volt-watt.com/',
    ]);
    expect(detectWebReferenceRequest('clone volt-watt.com/tarifs').urls).toEqual(['https://volt-watt.com/tarifs']);
    expect(detectWebReferenceRequest('je veux un site volt-watt.com').urls).toEqual([]);
    expect(detectWebReferenceRequest('clone un chat temps réel avec socket.io').urls).toEqual([]);
  });

  it('ignores model/provider tags and non-http schemes', () => {
    const request = detectWebReferenceRequest('[Model: gpt-4.1]\n[Provider: OpenAI]\n\nftp://x.com clone ceci');

    expect(request.urls).toEqual([]);
  });

  it('handles empty input', () => {
    expect(detectWebReferenceRequest('')).toEqual({ urls: [], cloneIntent: false });
    expect(detectWebReferenceRequest(undefined)).toEqual({ urls: [], cloneIntent: false });
  });
});

describe('extractWebPageDigest', () => {
  const digest = extractWebPageDigest(SITE_HTML, { url: 'https://volt-watt.com/', status: 200 });

  it('reads title, description, lang, theme colour and og:image (entities decoded, URLs absolute)', () => {
    expect(digest.title).toBe('Volt-Watt & Cie — Énergie solaire');
    expect(digest.description).toBe('Installateur photovoltaïque en France');
    expect(digest.lang).toBe('fr');
    expect(digest.themeColor).toBe('#0f9d58');
    expect(digest.ogImage).toBe('https://volt-watt.com/img/og.jpg');
  });

  it('collects headings from the body only — never from scripts', () => {
    expect(digest.headings).toEqual([
      { level: 1, text: 'Passez au solaire' },
      { level: 2, text: 'Nos solutions' },
    ]);
  });

  it('keeps same-site page links as the crawl frontier: no auth, no files, no external, no mailto, hash dropped', () => {
    expect(digest.links).toEqual([
      'https://volt-watt.com/',
      'https://volt-watt.com/solutions',
      'https://www.volt-watt.com/simulateur/',
      'https://volt-watt.com/contact',
    ]);
  });

  it('lists images (og:image first, data: URIs skipped) and stylesheets (rel=stylesheet only)', () => {
    expect(digest.images).toEqual(['https://volt-watt.com/img/og.jpg', 'https://volt-watt.com/img/toiture.jpg']);
    expect(digest.stylesheets).toEqual(['https://volt-watt.com/assets/app.css']);
  });

  it('extracts the visible copy with entities decoded and scripts/styles stripped', () => {
    expect(digest.text).toContain("Économisez jusqu'à 70 % sur votre facture.");
    expect(digest.text).not.toContain('not a heading');
    expect(digest.text).not.toContain('font-family');
  });

  it('ranks colours by frequency (hex normalised, short hex expanded) and lists real font families', () => {
    expect(digest.colors[0]).toBe('#0f9d58');
    expect(digest.colors).toContain('#ffffff');
    expect(digest.colors).toContain('#123456');
    expect(digest.colors).toContain('rgb(15,157,88)');
    expect(digest.fonts).toEqual(['Inter', 'Poppins']);
  });

  it('caps the text', () => {
    const long = `<html><body><p>${'mot '.repeat(5000)}</p></body></html>`;
    const capped = extractWebPageDigest(long, { url: 'https://a.io/' }, { maxTextChars: 100 });

    expect(capped.text.length).toBeLessThanOrEqual(101);
    expect(capped.text.endsWith('…')).toBe(true);
  });
});

describe('extractCssPalette', () => {
  it('skips generic families, var() and !important noise', () => {
    const palette = extractCssPalette(
      '.a{font-family:var(--font),sans-serif;color:#abc}.b{font-family:"Space Grotesk",serif !important;color:#AABBCC}',
    );

    expect(palette.colors).toEqual(['#aabbcc']);
    expect(palette.fonts).toEqual(['Space Grotesk']);
  });
});

describe('isSameSitePageLink', () => {
  it('treats www and apex as the same site, rejects assets and auth routes', () => {
    expect(isSameSitePageLink('https://a.com/', 'https://www.a.com/tarifs')).toBe(true);
    expect(isSameSitePageLink('https://a.com/', 'https://b.com/tarifs')).toBe(false);
    expect(isSameSitePageLink('https://a.com/', 'https://a.com/logo.svg')).toBe(false);
    expect(isSameSitePageLink('https://a.com/', 'https://a.com/account/')).toBe(false);
  });
});

describe('formatWebReferenceBlock', () => {
  const page = extractWebPageDigest(SITE_HTML, { url: 'https://volt-watt.com/', status: 200 });

  it('is empty when nothing was fetched and nothing failed', () => {
    expect(formatWebReferenceBlock([], [])).toBe('');
  });

  it('carries every observed dimension the prompt relies on, and the errors', () => {
    const block = formatWebReferenceBlock([page], [{ url: 'https://volt-watt.com/404', code: 'HTTP_404' }], {
      fetchedAt: new Date('2026-09-08T08:39:00Z'),
      cloneIntent: true,
    });

    expect(block).toContain('<web_reference fetched_at="2026-09-08T08:39:00.000Z" pages="1" intent="clone">');
    expect(block).toContain(
      '<page url="https://volt-watt.com/" status="200" title="Volt-Watt &amp; Cie — Énergie solaire">',
    );
    expect(block).toContain('<design colors="#0f9d58');
    expect(block).toContain('fonts="Inter, Poppins"');
    expect(block).toContain('h1: Passez au solaire');
    expect(block).toContain('<navigation>');
    expect(block).toContain('https://volt-watt.com/solutions');
    expect(block).toContain('<images>');
    expect(block).toContain('https://volt-watt.com/img/toiture.jpg');
    expect(block).toContain('<inline_css>');
    expect(block).toContain('<errors>');
    expect(block).toContain('https://volt-watt.com/404 — HTTP_404');
    expect(block).toContain('Only the pages listed were visited');
    expect(block.trim().endsWith('</web_reference>')).toBe(true);
  });

  it('halves the text cap for pages after the first and omits their inline css', () => {
    const block = formatWebReferenceBlock([page, { ...page, url: 'https://volt-watt.com/solutions' }], [], {
      maxTextChars: 40,
    });

    const sections = block.split('<page ');

    expect(sections).toHaveLength(3);
    expect(sections[1]).toContain('<inline_css>');
    expect(sections[2]).not.toContain('<inline_css>');
  });
});

describe('appendWebReferenceToMessages', () => {
  const block = '<web_reference pages="1"></web_reference>';

  it('appends to the LAST user message only, leaving assistant messages and earlier turns untouched', () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'ok' },
      { role: 'user' as const, content: 'clone https://a.io' },
      { role: 'assistant' as const, content: 'later' },
    ];

    const out = appendWebReferenceToMessages(messages, block);

    expect(out[0].content).toBe('first');
    expect(out[1].content).toBe('ok');
    expect(out[2].content).toBe(`clone https://a.io\n\n${block}`);
    expect(out[3].content).toBe('later');
    expect(messages[2].content).toBe('clone https://a.io'); // input not mutated
  });

  it('handles array content and parts (the AI SDK message shape) — first text part only', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: 'clone https://a.io' },
          { type: 'image', image: 'data:' },
        ] as never,
        parts: [{ type: 'text', text: 'clone https://a.io' }] as never,
      },
    ];

    const out = appendWebReferenceToMessages(messages, block);
    const content = out[0].content as unknown as Array<{ type: string; text?: string }>;
    const parts = (out[0] as unknown as { parts: Array<{ type: string; text?: string }> }).parts;

    expect(content[0].text).toBe(`clone https://a.io\n\n${block}`);
    expect(content[1]).toEqual({ type: 'image', image: 'data:' });
    expect(parts[0].text).toBe(`clone https://a.io\n\n${block}`);
  });

  it('returns the same array when the block is blank or there is no user message', () => {
    const noUser = [{ role: 'assistant' as const, content: 'x' }];

    expect(appendWebReferenceToMessages(noUser, block)).toBe(noUser);

    const some = [{ role: 'user' as const, content: 'x' }];

    expect(appendWebReferenceToMessages(some, '')).toBe(some);
    expect(appendWebReferenceToMessages(some, undefined)).toBe(some);
  });
});
