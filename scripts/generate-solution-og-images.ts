import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

const OUTPUT_DIRECTORY = path.resolve('public/assets/og/solutions');

type BilingualLanguage = 'en' | 'fr';

type OgPageCopy = Readonly<{
  seo: Readonly<{ description: string }>;
  hero: Readonly<{ title: string }>;
  build: Readonly<{ promptText: string; outputs: ReadonlyArray<Readonly<{ title: string }>> }>;
  demo: Readonly<{
    alt: string;
    badge: string;
    brand: string;
    brandType: string;
    title: string;
    primaryRows: ReadonlyArray<Readonly<{ label: string; meta: string }>>;
  }>;
}>;

type OgCopyByLanguage = Readonly<Record<BilingualLanguage, OgPageCopy>>;

const solutionModules = [
  {
    slug: 'website-builder',
    modulePath: '../app/components/marketing/solutions/website-builder.copy.ts',
    exportName: 'WEBSITE_BUILDER_COPY',
  },
  {
    slug: 'game-builder',
    modulePath: '../app/components/marketing/solutions/game-builder.copy.ts',
    exportName: 'GAME_BUILDER_COPY',
  },
  {
    slug: 'dashboard-builder',
    modulePath: '../app/components/marketing/solutions/dashboard-builder.copy.ts',
    exportName: 'DASHBOARD_BUILDER_COPY',
  },
  {
    slug: 'chatbot-builder',
    modulePath: '../app/components/marketing/solutions/chatbot-builder.copy.ts',
    exportName: 'CHATBOT_BUILDER_COPY',
  },
  {
    slug: 'internal-ai-builder',
    modulePath: '../app/components/marketing/solutions/internal-ai-builder.copy.ts',
    exportName: 'INTERNAL_AI_BUILDER_COPY',
  },
  {
    slug: 'enterprise',
    modulePath: '../app/components/marketing/solutions/enterprise.copy.ts',
    exportName: 'ENTERPRISE_COPY',
  },
  {
    slug: 'startups',
    modulePath: '../app/components/marketing/solutions/startups.copy.ts',
    exportName: 'STARTUPS_COPY',
  },
  {
    slug: 'freelancers',
    modulePath: '../app/components/marketing/solutions/freelancers.copy.ts',
    exportName: 'FREELANCERS_COPY',
  },
];

const labels = {
  en: {
    solution: 'E-CODE / SOLUTIONS',
    prompt: 'YOUR PROMPT',
    agent: 'AGENT',
    preview: 'PREVIEW',
    source: 'SOURCE FILES',
    flow: 'Illustrated product flow',
  },
  fr: {
    solution: 'E-CODE / SOLUTIONS',
    prompt: 'VOTRE PROMPT',
    agent: 'AGENT',
    preview: 'APERÇU',
    source: 'FICHIERS SOURCE',
    flow: 'Flux produit illustré',
  },
} as const satisfies Record<BilingualLanguage, Record<string, string>>;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadSolutions(): Promise<ReadonlyArray<{ slug: string; copy: OgCopyByLanguage }>> {
  return Promise.all(
    solutionModules.map(async ({ slug, modulePath, exportName }) => {
      const copyModule = (await import(modulePath)) as Record<string, unknown>;

      const copy = copyModule[exportName];

      if (!copy) {
        throw new Error(`Missing ${exportName} in ${modulePath}`);
      }

      return { slug, copy: copy as OgCopyByLanguage };
    }),
  );
}

function renderOgHtml(slug: string, language: BilingualLanguage, copy: OgCopyByLanguage): string {
  const pageCopy = copy[language];

  const languageLabels = labels[language];

  const titleSize = pageCopy.hero.title.length > 82 ? 41 : pageCopy.hero.title.length > 62 ? 47 : 53;

  const prompt =
    pageCopy.build.promptText.length > 168 ? `${pageCopy.build.promptText.slice(0, 165)}…` : pageCopy.build.promptText;

  const rows = pageCopy.demo.primaryRows
    .map(
      (row, index) => `
        <div class="preview-row">
          <span class="row-index">0${index + 1}</span>
          <span class="row-copy"><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.meta)}</small></span>
          <i></i>
        </div>`,
    )
    .join('');

  return `<!doctype html>
    <html lang="${language}">
      <head>
        <meta charset="utf-8" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
          * { box-sizing: border-box; }
          html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
          body {
            position: relative;
            display: grid;
            grid-template-columns: minmax(0, 1.2fr) minmax(430px, .8fr);
            gap: 44px;
            padding: 48px 50px 46px;
            background: #0c111b;
            color: #f7f9fc;
            font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          body::before {
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(120, 139, 166, .07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(120, 139, 166, .07) 1px, transparent 1px);
            background-size: 40px 40px;
            mask-image: linear-gradient(90deg, #000, transparent 72%);
            content: '';
          }
          .copy, .ide { position: relative; z-index: 1; }
          .copy { display: flex; min-width: 0; flex-direction: column; }
          .brand { display: flex; align-items: center; gap: 13px; color: #b5c0d0; font-size: 16px; font-weight: 700; letter-spacing: .09em; }
          .brand-mark { display: inline-grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; background: #ff6a1a; color: #11151e; font-size: 20px; letter-spacing: 0; }
          .language { margin-left: 4px; border: 1px solid #3b4658; border-radius: 999px; padding: 6px 10px; color: #e8edf5; font: 600 12px/1 'IBM Plex Mono', monospace; letter-spacing: .08em; text-transform: uppercase; }
          h1 { max-width: 665px; margin: 70px 0 0; font-size: ${titleSize}px; font-weight: 700; letter-spacing: -.035em; line-height: 1.06; text-wrap: balance; }
          .description { max-width: 620px; margin: 22px 0 0; color: #aeb9c9; font-size: 19px; line-height: 1.48; }
          .prompt { display: grid; max-width: 635px; gap: 8px; margin-top: auto; border-left: 3px solid #ff6a1a; padding: 4px 0 4px 17px; }
          .prompt span { color: #ff9253; font: 600 11px/1.2 'IBM Plex Mono', monospace; letter-spacing: .11em; }
          .prompt p { margin: 0; color: #e9eef6; font: 500 14px/1.5 'IBM Plex Mono', monospace; }
          .ide { align-self: center; overflow: hidden; border: 1px solid #39465a; border-radius: 15px; background: #111827; box-shadow: 0 30px 80px rgba(0,0,0,.45); }
          .ide-bar { display: flex; height: 46px; align-items: center; gap: 7px; border-bottom: 1px solid #2c3748; padding: 0 14px; background: #161e2c; }
          .dot { width: 8px; height: 8px; border-radius: 999px; background: #48556a; }
          .dot:first-child { background: #ff6a1a; }
          .project { min-width: 0; margin-left: 8px; overflow: hidden; color: #c7d0dd; font: 500 11px/1 'IBM Plex Mono', monospace; text-overflow: ellipsis; white-space: nowrap; }
          .ide-tabs { display: grid; grid-template-columns: 104px minmax(0, 1fr); height: 394px; }
          .agent { display: flex; flex-direction: column; gap: 13px; border-right: 1px solid #2c3748; padding: 15px 12px; background: #0e1522; }
          .panel-label { color: #8997aa; font: 600 9px/1 'IBM Plex Mono', monospace; letter-spacing: .1em; }
          .agent-bubble { border: 1px solid #3c4b60; border-radius: 8px; padding: 10px; background: #172236; color: #d9e0ea; font-size: 9px; line-height: 1.45; }
          .agent-step { display: grid; grid-template-columns: 15px minmax(0, 1fr); gap: 6px; color: #aab5c5; font-size: 8px; line-height: 1.35; }
          .agent-step b { display: grid; width: 15px; height: 15px; place-items: center; border: 1px solid #405069; border-radius: 999px; color: #ff9253; font: 600 7px/1 'IBM Plex Mono', monospace; }
          .canvas { display: flex; min-width: 0; flex-direction: column; background: #0b1220; }
          .canvas-tabs { display: flex; height: 38px; align-items: end; gap: 3px; border-bottom: 1px solid #2c3748; padding: 0 11px; }
          .canvas-tabs span { padding: 10px 11px 9px; color: #8592a5; font: 600 9px/1 'IBM Plex Mono', monospace; }
          .canvas-tabs .active { border-bottom: 2px solid #ff6a1a; color: #f3f6fa; }
          .preview { display: grid; min-height: 0; gap: 12px; margin: 13px; border: 1px solid #354257; border-radius: 10px; padding: 16px; background: #151d2a; }
          .preview-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .preview-head div { display: grid; gap: 3px; }
          .preview-head strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
          .preview-head small { color: #8795a8; font-size: 9px; }
          .live { border: 1px solid rgba(255,106,26,.45); border-radius: 999px; padding: 6px 8px; background: rgba(255,106,26,.1); color: #ff9a5e; font: 600 8px/1 'IBM Plex Mono', monospace; }
          .preview-row { display: grid; min-width: 0; grid-template-columns: 21px minmax(0, 1fr) 7px; align-items: center; gap: 8px; border: 1px solid #303c50; border-radius: 8px; padding: 9px; background: #101825; }
          .row-index { color: #ff9253; font: 600 8px/1 'IBM Plex Mono', monospace; }
          .row-copy { display: grid; min-width: 0; gap: 2px; }
          .row-copy strong, .row-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .row-copy strong { font-size: 10px; }
          .row-copy small { color: #8190a4; font-size: 8px; }
          .preview-row i { width: 7px; height: 7px; border-radius: 999px; background: #ff6a1a; }
          .source { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #2c3748; padding-top: 10px; color: #8c9aae; font: 500 8px/1 'IBM Plex Mono', monospace; }
          .source b { color: #d7dee8; font-weight: 600; }
          .flow { position: absolute; right: 54px; bottom: 20px; z-index: 2; color: #718095; font: 500 10px/1 'IBM Plex Mono', monospace; letter-spacing: .04em; }
        </style>
      </head>
      <body data-solution="${escapeHtml(slug)}">
        <section class="copy">
          <div class="brand"><span class="brand-mark">E</span><span>${languageLabels.solution}</span><span class="language">${language}</span></div>
          <h1>${escapeHtml(pageCopy.hero.title)}</h1>
          <p class="description">${escapeHtml(pageCopy.seo.description)}</p>
          <div class="prompt"><span>${languageLabels.prompt}</span><p>${escapeHtml(prompt)}</p></div>
        </section>
        <section class="ide" aria-label="${escapeHtml(pageCopy.demo.alt)}">
          <div class="ide-bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="project">${escapeHtml(pageCopy.demo.brand)} / ${escapeHtml(pageCopy.demo.brandType)}</span></div>
          <div class="ide-tabs">
            <aside class="agent">
              <span class="panel-label">${languageLabels.agent}</span>
              <div class="agent-bubble">${escapeHtml(prompt)}</div>
              ${pageCopy.build.outputs
                .slice(0, 3)
                .map(
                  (item, index) =>
                    `<div class="agent-step"><b>${index + 1}</b><span>${escapeHtml(item.title)}</span></div>`,
                )
                .join('')}
            </aside>
            <div class="canvas">
              <div class="canvas-tabs"><span>Code</span><span class="active">${languageLabels.preview}</span></div>
              <div class="preview">
                <div class="preview-head"><div><strong>${escapeHtml(pageCopy.demo.brand)}</strong><small>${escapeHtml(pageCopy.demo.title)}</small></div><span class="live">${escapeHtml(pageCopy.demo.badge)}</span></div>
                ${rows}
                <div class="source"><span>${languageLabels.source}</span><b>TypeScript · CSS · data</b></div>
              </div>
            </div>
          </div>
        </section>
        <span class="flow">${languageLabels.flow}</span>
      </body>
    </html>`;
}

async function main() {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });

  const solutions = await loadSolutions();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  try {
    for (const { slug, copy } of solutions) {
      for (const language of ['en', 'fr'] as const) {
        await page.setContent(renderOgHtml(slug, language, copy), { waitUntil: 'domcontentloaded' });
        await page
          .waitForFunction('document.fonts.status === "loaded"', undefined, { timeout: 2500 })
          .catch(() => undefined);

        const clippedSelectors: string[] = [];

        for (const selector of ['.brand', 'h1', '.description', '.prompt', '.ide', '.flow']) {
          const bounds = await page.locator(selector).boundingBox();

          if (
            !bounds ||
            bounds.x < 0 ||
            bounds.y < 0 ||
            bounds.x + bounds.width > 1200 ||
            bounds.y + bounds.height > 630
          ) {
            clippedSelectors.push(selector);
          }
        }

        if (clippedSelectors.length > 0) {
          throw new Error(`${slug}-${language} clips ${clippedSelectors.join(', ')}`);
        }

        await page.screenshot({
          path: path.join(OUTPUT_DIRECTORY, `${slug}-${language}.png`),
          type: 'png',
          animations: 'disabled',
        });
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
