import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  auditGeneratedFrenchSurface,
  collectGeneratedFrenchSurface,
  GENERATED_FR_EXACT_ALLOWLIST,
  GENERATED_FR_SCENARIO_CONTRACTS,
  GENERATED_FR_SOLUTION_SLUGS,
  GENERATED_FR_SURFACE_COLLECTOR_EXPRESSION,
  GeneratedFrenchSurfaceAuditError,
} from './solution-generated-fr-surface-audit.js';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

describe.sequential('generated French Webview surface audit', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { height: 720, width: 1024 } });
  });

  async function setFrenchContent(content: string) {
    await page.setContent(content);
    await page.locator('html').evaluate((element) => element.setAttribute('lang', 'fr'));
  }

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('keeps its browser expression autonomous from the TSX __name helper', async () => {
    expect(GENERATED_FR_SURFACE_COLLECTOR_EXPRESSION).not.toContain('__name');
    expect(GENERATED_FR_SURFACE_COLLECTOR_EXPRESSION).toMatch(/^\(root\) => \{/u);

    await setFrenchContent('<main><h1>PeopleOps</h1></main>');

    const collection = await collectGeneratedFrenchSurface(page);

    expect(collection.entries).toContainEqual({ selector: 'body > main > h1', source: 'text', value: 'PeopleOps' });
  });

  it('accepts a Page, Frame, FrameLocator, or existing body Locator as its root', async () => {
    await setFrenchContent(`
      <main><h1>PeopleOps</h1></main>
      <iframe title="Aperçu"></iframe>
    `);

    const iframe = page.locator('iframe');
    await iframe.evaluate((element) => {
      const frameDocument = (
        element as unknown as {
          contentDocument: {
            body?: { innerHTML: string };
            documentElement: { lang: string };
          } | null;
        }
      ).contentDocument;

      if (frameDocument?.body) {
        frameDocument.documentElement.lang = 'fr';
        frameDocument.body.innerHTML = '<main><h1>PeopleOps</h1></main>';
      }
    });

    const frameHandle = await iframe.elementHandle();
    const frame = await frameHandle?.contentFrame();

    expect(frame).not.toBeNull();

    const fromPage = await collectGeneratedFrenchSurface(page);
    const fromBody = await collectGeneratedFrenchSurface(page.locator('body'));
    const fromFrame = await collectGeneratedFrenchSurface(page.frameLocator('iframe'));
    const fromFrameObject = await collectGeneratedFrenchSurface(frame!);

    expect(fromPage.entries.some(({ value }) => value === 'PeopleOps')).toBe(true);
    expect(fromBody.entries.some(({ value }) => value === 'PeopleOps')).toBe(true);
    expect(fromFrame.entries.some(({ value }) => value === 'PeopleOps')).toBe(true);
    expect(fromFrameObject.entries.some(({ value }) => value === 'PeopleOps')).toBe(true);
    await expect(auditGeneratedFrenchSurface(frame!, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      documentLanguageMatched: true,
      passed: true,
    });
  });

  it('rejects an absent or non-French document language and accepts fr plus fr-* tags', async () => {
    await page.setContent('<main><h1>PeopleOps</h1></main>');

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).rejects.toThrow(
      /language=missing/u,
    );

    await page.locator('html').evaluate((element) => element.setAttribute('lang', 'en'));
    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).rejects.toThrow(/language=en/u);

    await page.locator('html').evaluate((element) => element.setAttribute('lang', 'fr'));
    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      documentLanguageMatched: true,
      passed: true,
    });

    await page.locator('html').evaluate((element) => element.setAttribute('lang', 'fr-CA'));
    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      collection: { documentLanguage: 'fr-CA' },
      documentLanguageMatched: true,
      passed: true,
    });

    await page.locator('html').evaluate((element) => element.setAttribute('lang', 'fr_CA'));
    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).rejects.toThrow(
      /expected fr or fr-\*/u,
    );
  });

  it('fails closed when a supplied root resolves to zero or multiple elements', async () => {
    await setFrenchContent('<main><h1>PeopleOps</h1></main><main><h2>Procédures</h2></main>');

    await expect(collectGeneratedFrenchSurface(page.locator('main'))).rejects.toThrow(/received 2/u);
    await expect(collectGeneratedFrenchSurface(page.locator('[data-missing-root]'))).rejects.toThrow(/received 0/u);
  });

  it('collects visible text plus every user-facing metadata surface', async () => {
    await setFrenchContent(`
      <!doctype html>
      <html lang="fr">
        <head><title>PeopleOps — Procédures</title></head>
        <body>
          <main>
            <h1>PeopleOps</h1>
            <p id="label" hidden>Ouvrir la bibliothèque</p>
            <p id="description" hidden>Bibliothèque locale</p>
            <button
              aria-label="Ouvrir les procédures"
              aria-labelledby="label"
              aria-description="Consultation locale"
              aria-describedby="description"
              aria-valuetext="Trois résultats"
              title="Afficher les détails"
            >Consulter</button>
            <input placeholder="Rechercher une procédure" value="Congés annuels" />
            <img alt="Aperçu des procédures" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" />
          </main>
        </body>
      </html>
    `);

    const collection = await collectGeneratedFrenchSurface(page);
    const sources = new Map(collection.entries.map((entry) => [`${entry.source}:${entry.value}`, entry]));

    expect(collection.documentLanguage).toBe('fr');
    expect(sources.has('text:PeopleOps')).toBe(true);
    expect(sources.has('aria-label:Ouvrir les procédures')).toBe(true);
    expect(sources.has('aria-labelledby:Ouvrir la bibliothèque')).toBe(true);
    expect(sources.has('aria-description:Consultation locale')).toBe(true);
    expect(sources.has('aria-describedby:Bibliothèque locale')).toBe(true);
    expect(sources.has('aria-valuetext:Trois résultats')).toBe(true);
    expect(sources.has('title:Afficher les détails')).toBe(true);
    expect(sources.has('placeholder:Rechercher une procédure')).toBe(true);
    expect(sources.has('alt:Aperçu des procédures')).toBe(true);
    expect(sources.has('input-value:Congés annuels')).toBe(true);
    expect(sources.has('document-title:PeopleOps — Procédures')).toBe(true);

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      passed: true,
    });
  });

  it('reports English from text, ARIA, titles, placeholders, alt text, and input values', async () => {
    await setFrenchContent(`
      <!doctype html>
      <html lang="fr">
        <head><title>Welcome home</title></head>
        <body>
          <main>
            <h1>PeopleOps</h1>
            <p>Save changes</p>
            <span id="english-label" hidden>Open account</span>
            <span id="english-description" hidden>Review delivery</span>
            <button
              aria-label="Open settings"
              aria-labelledby="english-label"
              aria-description="Account settings"
              aria-describedby="english-description"
              aria-valuetext="Loading results"
              title="Delete project"
            >Procédures</button>
            <input placeholder="Search projects" value="Submit form" />
            <img alt="Dashboard preview" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" />
          </main>
        </body>
      </html>
    `);

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).rejects.toBeInstanceOf(
      GeneratedFrenchSurfaceAuditError,
    );

    try {
      await auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' });
      throw new Error('Expected the English surface audit to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedFrenchSurfaceAuditError);

      const auditError = error as GeneratedFrenchSurfaceAuditError;
      const failedSources = new Set(auditError.audit.residuals.map(({ source }) => source));

      expect(failedSources).toEqual(
        new Set([
          'alt',
          'aria-description',
          'aria-describedby',
          'aria-label',
          'aria-labelledby',
          'aria-valuetext',
          'document-title',
          'input-value',
          'placeholder',
          'text',
          'title',
        ]),
      );
    }
  });

  it('ignores hidden English but audits rendered content below the viewport', async () => {
    await setFrenchContent(`
      <main>
        <h1>PeopleOps</h1>
        <p hidden>Save changes</p>
        <p style="display:none">Account settings</p>
        <p style="opacity:0">Delete project</p>
        <p aria-hidden="true">Loading results</p>
        <div style="height:1100px">Bibliothèque locale</div>
        <p>Review delivery</p>
      </main>
    `);

    try {
      await auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' });
      throw new Error('Expected the below-fold English residue to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedFrenchSurfaceAuditError);

      const matches = (error as GeneratedFrenchSurfaceAuditError).audit.residuals.map(({ match }) => match);

      expect(matches).toContain('review');
      expect(matches).toContain('delivery');
      expect(matches).not.toContain('save');
      expect(matches).not.toContain('account');
      expect(matches).not.toContain('delete');
      expect(matches).not.toContain('loading');
    }
  });

  it('exempts code and preformatted implementation text', async () => {
    await setFrenchContent(`
      <main>
        <h1>PeopleOps</h1>
        <p>Interface construite avec React et TypeScript.</p>
        <code>const buttonLabel = 'Save changes';</code>
        <pre>function openSettings() { return 'Account settings'; }</pre>
      </main>
    `);

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      passed: true,
      residuals: [],
    });
  });

  it('allows only exact brands and technical terms without masking surrounding English', async () => {
    await setFrenchContent(`
      <main>
        <h1>PeopleOps</h1>
        <p>E-Code utilise React, TypeScript, Git, Webview, WebSocket, RAG, SSO, SCIM, LLM, API et JSON.</p>
        <p>Le backend lance le runtime via pnpm après chaque commit.</p>
      </main>
    `);

    expect(GENERATED_FR_EXACT_ALLOWLIST).toContain('PeopleOps');
    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      passed: true,
    });

    await page.locator('main').evaluate((element) => {
      element.insertAdjacentHTML('beforeend', '<p>React and TypeScript</p>');
    });

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).rejects.toThrow(/and/u);
  });

  it('does not hide English navigation as a generic slash-delimited file path', async () => {
    await setFrenchContent(`
      <main>
        <h1>PeopleOps</h1>
        <nav>Settings/Profile</nav>
      </main>
    `);

    try {
      await auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' });
      throw new Error('Expected slash-delimited English navigation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedFrenchSurfaceAuditError);

      const matches = new Set((error as GeneratedFrenchSurfaceAuditError).audit.residuals.map(({ match }) => match));

      expect(matches).toContain('settings');
      expect(matches).toContain('profile');
    }
  });

  it('rejects forbidden phrases split across multiple rendered elements', async () => {
    await setFrenchContent(`
      <main>
        <h1>Northwind Control</h1>
        <button><span>Export</span> <span>audit</span> <span>log</span></button>
        <button><span>Switch</span> <span>to dark</span> <span>mode</span></button>
      </main>
    `);

    try {
      await auditGeneratedFrenchSurface(page, { slug: 'enterprise' });
      throw new Error('Expected the split English enterprise action to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedFrenchSurfaceAuditError);

      const aggregateResidual = (error as GeneratedFrenchSurfaceAuditError).audit.residuals.find(
        ({ match }) => match === 'Export audit log',
      );

      expect(aggregateResidual).toMatchObject({
        match: 'Export audit log',
        rule: 'scenario-forbidden',
        selector: 'surface',
        source: 'text',
      });
      expect(
        (error as GeneratedFrenchSurfaceAuditError).audit.residuals.find(
          ({ match }) => match === 'Switch to dark mode',
        ),
      ).toMatchObject({
        match: 'Switch to dark mode',
        rule: 'global-forbidden',
        selector: 'surface',
        source: 'text',
      });
    }
  });

  it('rejects HR-04 while accepting the contracted French RH-04 result', async () => {
    await setFrenchContent('<main><h1>PeopleOps</h1><p>Réponse fondée sur la procédure RH-04.</p></main>');

    await expect(
      auditGeneratedFrenchSurface(page, { phase: 'interaction', slug: 'internal-ai-builder' }),
    ).resolves.toMatchObject({ passed: true });

    await page.locator('p').evaluate((element) => {
      element.textContent = 'Réponse fondée sur la procédure HR-04.';
    });

    await expect(
      auditGeneratedFrenchSurface(page, { phase: 'interaction', slug: 'internal-ai-builder' }),
    ).rejects.toThrow(/HR-04/u);
  });

  it('rejects Export audit log while accepting the contracted French enterprise action', async () => {
    await setFrenchContent(`
      <main>
        <h1>Northwind Control</h1>
        <button>Exporter le journal</button>
      </main>
    `);

    await expect(auditGeneratedFrenchSurface(page, { phase: 'overview', slug: 'enterprise' })).resolves.toMatchObject({
      passed: true,
    });

    await page.locator('button').evaluate((element) => {
      element.textContent = 'Export audit log';
    });

    await expect(auditGeneratedFrenchSurface(page, { phase: 'overview', slug: 'enterprise' })).rejects.toThrow(
      /Export audit log/u,
    );
  });

  it('rejects a visible EN language toggle on any generated French surface', async () => {
    await setFrenchContent(`
      <main>
        <h1>PeopleOps</h1>
        <button aria-label="Choisir EN">EN</button>
      </main>
    `);

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).rejects.toThrow(/EN/u);

    await page.locator('button').evaluate((element) => {
      element.textContent = 'FR';
      element.setAttribute('aria-label', 'Langue française');
    });

    await expect(auditGeneratedFrenchSurface(page, { slug: 'internal-ai-builder' })).resolves.toMatchObject({
      passed: true,
    });
  });

  it('enforces the translated overview and interaction contracts for all nine scenarios', async () => {
    expect(Object.keys(GENERATED_FR_SCENARIO_CONTRACTS)).toEqual([...GENERATED_FR_SOLUTION_SLUGS]);

    for (const slug of GENERATED_FR_SOLUTION_SLUGS) {
      const contract = GENERATED_FR_SCENARIO_CONTRACTS[slug];

      for (const phase of ['overview', 'interaction'] as const) {
        const required = [...contract.required, ...contract.requiredByPhase[phase]];
        await setFrenchContent(`<main>${required.map((term) => `<p>${escapeHtml(term)}</p>`).join('')}</main>`);

        await expect(auditGeneratedFrenchSurface(page, { phase, slug })).resolves.toMatchObject({
          missingRequired: [],
          passed: true,
        });

        await setFrenchContent(`
          <main>
            ${contract.required.map((term) => `<p>${escapeHtml(term)}</p>`).join('')}
            <p>${escapeHtml(contract.forbidden[0])}</p>
          </main>
        `);

        await expect(auditGeneratedFrenchSurface(page, { phase, slug })).rejects.toBeInstanceOf(
          GeneratedFrenchSurfaceAuditError,
        );
      }
    }
  });
});
