import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applyOfficialRuntimeCaptureTheme,
  explicitRuntimeTheme,
  OFFICIAL_RUNTIME_THEME_CONTROL_LABEL,
  pressIdeCommandPaletteShortcut,
} from './solution-runtime-theme-control.js';

const readSource = (relativePath: string): string => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

type FixtureLocale = 'en' | 'fr';

const fixtureLabels = {
  en: {
    dark: 'Switch to light mode',
    light: 'Switch to dark mode',
  },
  fr: {
    dark: 'Passer en mode clair',
    light: 'Passer en mode sombre',
  },
} as const;

function interactiveThemeFixture(locale: FixtureLocale, { updateAfterClick = true } = {}) {
  return `
    <style>
      :root[data-theme='dark'] { color-scheme: dark; background: rgb(10, 20, 30); }
      :root[data-theme='light'] { color-scheme: light; background: rgb(240, 245, 250); }
    </style>
    <button type="button" data-testid="app-theme-toggle"></button>
    <script>
      window.themeClickCount = 0;
      const labels = ${JSON.stringify(fixtureLabels[locale])};
      const themeToggle = document.querySelector('[data-testid="app-theme-toggle"]');
      const renderThemeToggle = () => {
        const activeTheme = document.documentElement.dataset.theme;
        const label = labels[activeTheme];
        themeToggle.textContent = label;
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('title', label);
        themeToggle.setAttribute('aria-pressed', activeTheme === 'dark' ? 'true' : 'false');
      };

      document.documentElement.dataset.theme = 'dark';
      renderThemeToggle();
      themeToggle.addEventListener('click', () => {
        window.themeClickCount += 1;
        document.documentElement.dataset.theme =
          document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        ${updateAfterClick ? 'renderThemeToggle();' : ''}
      });
    </script>
  `;
}

function staticThemeControl({
  ariaLabel = fixtureLabels.en.dark,
  ariaPressed = 'true',
  text = fixtureLabels.en.dark,
  title = fixtureLabels.en.dark,
}: {
  ariaLabel?: string | null;
  ariaPressed?: string | null;
  text?: string;
  title?: string | null;
} = {}) {
  const attribute = (name: string, value: string | null) => (value === null ? '' : ` ${name}=${JSON.stringify(value)}`);

  return `<button type="button" data-testid="app-theme-toggle"${attribute('aria-label', ariaLabel)}${attribute(
    'title',
    title,
  )}${attribute('aria-pressed', ariaPressed)}>${text}</button>`;
}

describe('Solutions proof capture theme control', () => {
  const captureSource = readSource('scripts/capture-app-builder-ide-proof.ts');

  const applyCaptureThemeSource = captureSource.slice(
    captureSource.indexOf('async function applyCaptureTheme'),
    captureSource.indexOf('\ntype IdeShellAudit'),
  );

  const runtimeThemeControlSource = readSource('scripts/solution-runtime-theme-control.ts');

  const scenarioAppearanceSource = captureSource.slice(
    captureSource.indexOf('async function verifyScenarioAppearance'),
    captureSource.indexOf('\ntype ResumedPromptProvenance'),
  );

  const baseChatSource = readSource('app/components/chat/BaseChat.tsx');

  it('uses the real localized command-palette control instead of compact Agent header actions', () => {
    expect(captureSource).toContain('pressIdeCommandPaletteShortcut(page)');
    expect(runtimeThemeControlSource).toContain("page.keyboard.press('ControlOrMeta+Shift+P')");
    expect(runtimeThemeControlSource).toContain('.bolt-project-statusbar:visible button:visible:not([disabled])');
    expect(captureSource).toContain("getByTestId('project-command-palette-search')");
    expect(captureSource).toContain('Command palette|Palette de commandes');
    expect(captureSource).toContain('Toggle theme|Changer de thème');
    expect(applyCaptureThemeSource).not.toContain('More agent actions');
    expect(applyCaptureThemeSource).not.toContain("getByTestId('ide-agent-panel')");
  });

  it('keeps the capture contract aligned with the production IDE command', () => {
    expect(baseChatSource).toContain('data-testid="project-command-palette-search"');
    expect(baseChatSource).toContain("['theme', t('baseChatAst.command.theme')");
    expect(baseChatSource).toContain("entry.command === 'theme'");
    expect(baseChatSource).toContain('toggleTheme();');
  });

  it('never forges a theme by writing document or storage state', () => {
    expect(applyCaptureThemeSource).not.toMatch(/localStorage\.setItem|document\.cookie|dispatchEvent/u);
    expect(applyCaptureThemeSource).not.toMatch(/setAttribute\(['"]data-theme|classList\.toggle/u);
    expect(runtimeThemeControlSource).not.toMatch(/localStorage\.setItem|document\.cookie|dispatchEvent/u);
    expect(runtimeThemeControlSource).not.toMatch(
      /setAttribute\(['"]data-theme|classList\.(?:add|remove|replace|toggle)/u,
    );
    expect(runtimeThemeControlSource).toContain('page.emulateMedia({ colorScheme: theme })');
    expect(runtimeThemeControlSource).toContain("surface.getByTestId('app-theme-toggle')");
    expect(runtimeThemeControlSource).toContain('await control.click()');
  });

  it('applies and records the generated app theme for native Webview captures', () => {
    expect(applyCaptureThemeSource).toContain('iframe[data-testid="preview-iframe"]:visible');
    expect(applyCaptureThemeSource).toContain('iframeHandle?.contentFrame()');
    expect(applyCaptureThemeSource).toContain('applyOfficialRuntimeCaptureTheme(nativePreviewFrame, theme');
    expect(applyCaptureThemeSource).toContain('requireVisibleControl: true');
    expect(captureSource).toContain('const applicationTheme = await applyCaptureTheme(page, theme)');
    expect(captureSource).toContain('applicationTheme,');
  });

  it('audits the Game full-canvas palette against the captured application theme', () => {
    expect(captureSource).toContain('verifyScenarioAppearance(page, options.scenario, theme)');
    expect(scenarioAppearanceSource).toContain("theme === 'dark' && surfaceAudit.darkSurfaceCount === 0");
    expect(scenarioAppearanceSource).toContain(
      "theme === 'light' && (surfaceAudit.lightSurfaceCount === 0 || surfaceAudit.darkSurfaceCount > 0)",
    );
    expect(scenarioAppearanceSource).toContain('does not render a genuine light full-canvas theme');
  });
});

describe.sequential('official runtime direct theme control', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ colorScheme: 'dark' });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('recognizes explicit data-theme and common class contracts', () => {
    expect(explicitRuntimeTheme({ dataTheme: 'dark', rootClasses: [] })).toBe('dark');
    expect(explicitRuntimeTheme({ dataTheme: null, rootClasses: ['theme-light'] })).toBe('light');
    expect(explicitRuntimeTheme({ dataTheme: null, rootClasses: ['mode_dark'] })).toBe('dark');
    expect(explicitRuntimeTheme({ dataTheme: null, rootClasses: ['unrelated'] })).toBeUndefined();
  });

  it('accepts only the exact English and French action labels', () => {
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Switch to light mode')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Switch to dark mode')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Passer en mode clair')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Passer en mode sombre')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Toggle colour theme')).toBe(false);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Dark')).toBe(false);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Search')).toBe(false);
  });

  it('validates the exact English contract before and after each direct Page toggle', async () => {
    await page.setContent(interactiveThemeFixture('en'));

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'light', { requireVisibleControl: true, timeoutMs: 2_000 }),
    ).resolves.toEqual({ activeTheme: 'light', strategy: 'visible-runtime-control' });
    expect(await page.locator('html').getAttribute('data-theme')).toBe('light');
    expect(await page.getByTestId('app-theme-toggle').textContent()).toBe(fixtureLabels.en.light);
    expect(await page.getByTestId('app-theme-toggle').getAttribute('aria-label')).toBe(fixtureLabels.en.light);
    expect(await page.getByTestId('app-theme-toggle').getAttribute('title')).toBe(fixtureLabels.en.light);
    expect(await page.getByTestId('app-theme-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(await page.evaluate(`window.themeClickCount`)).toBe(1);

    await applyOfficialRuntimeCaptureTheme(page, 'dark', { requireVisibleControl: true, timeoutMs: 2_000 });
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
    expect(await page.getByTestId('app-theme-toggle').textContent()).toBe(fixtureLabels.en.dark);
    expect(await page.getByTestId('app-theme-toggle').getAttribute('aria-label')).toBe(fixtureLabels.en.dark);
    expect(await page.getByTestId('app-theme-toggle').getAttribute('title')).toBe(fixtureLabels.en.dark);
    expect(await page.getByTestId('app-theme-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(await page.evaluate(`window.themeClickCount`)).toBe(2);
  });

  it('returns focus from a native Preview iframe before opening the real IDE command palette', async () => {
    await page.setContent(`
      <main class="bolt-responsive-ide-desktop">
        <footer class="bolt-project-statusbar">
          <button type="button" aria-label="Open Git panel">main</button>
        </footer>
        <iframe data-testid="preview-iframe" title="Preview"></iframe>
      </main>
      <script>
        window.commandPaletteShortcutCount = 0;
        window.addEventListener('keydown', (event) => {
          if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'p') {
            return;
          }

          window.commandPaletteShortcutCount += 1;
          const dialog = document.createElement('div');
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-label', 'Command palette');
          const search = document.createElement('input');
          search.setAttribute('data-testid', 'project-command-palette-search');
          dialog.append(search);
          document.body.append(dialog);
          search.focus();
        }, { capture: true });
      </script>
    `);

    const previewFrame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!previewFrame) {
      throw new Error('Expected the native Preview iframe');
    }

    await previewFrame.setContent('<button type="button">Generated app theme</button>');
    await previewFrame.getByRole('button', { name: 'Generated app theme' }).focus();
    expect(await page.evaluate(`document.activeElement?.matches('iframe[data-testid="preview-iframe"]')`)).toBe(true);

    await page.keyboard.press('ControlOrMeta+Shift+P');
    expect(await page.evaluate(`window.commandPaletteShortcutCount`)).toBe(0);
    expect(await page.getByTestId('project-command-palette-search').count()).toBe(0);

    await pressIdeCommandPaletteShortcut(page, 2_000);

    expect(await page.getByRole('dialog', { name: 'Command palette' }).isVisible()).toBe(true);
    expect(
      await page.evaluate(
        `document.activeElement === document.querySelector('[data-testid="project-command-palette-search"]')`,
      ),
    ).toBe(true);
    expect(await page.evaluate(`window.commandPaletteShortcutCount`)).toBe(1);
  });

  it('fails closed when the production IDE is using its compact layout', async () => {
    await page.setContent(`
      <main class="bolt-responsive-ide-mobile">
        <footer class="bolt-project-statusbar bolt-project-statusbar-mobile">
          <button type="button" aria-label="Open tools">Tools</button>
        </footer>
      </main>
    `);

    await expect(pressIdeCommandPaletteShortcut(page, 250)).rejects.toThrow(
      'The keyboard command-palette path is available only in the hydrated desktop IDE shell',
    );
  });

  it('validates the exact French contract before and after each native Frame toggle', async () => {
    await page.setContent('<iframe title="Preview"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected the native Preview iframe');
    }

    await frame.setContent(interactiveThemeFixture('fr'));

    await expect(
      applyOfficialRuntimeCaptureTheme(frame, 'light', { requireVisibleControl: true, timeoutMs: 2_000 }),
    ).resolves.toEqual({
      activeTheme: 'light',
      strategy: 'visible-runtime-control',
    });
    expect(await frame.locator('html').getAttribute('data-theme')).toBe('light');
    expect(await frame.getByTestId('app-theme-toggle').textContent()).toBe(fixtureLabels.fr.light);
    expect(await frame.getByTestId('app-theme-toggle').getAttribute('aria-label')).toBe(fixtureLabels.fr.light);
    expect(await frame.getByTestId('app-theme-toggle').getAttribute('title')).toBe(fixtureLabels.fr.light);
    expect(await frame.getByTestId('app-theme-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(await frame.evaluate(`window.matchMedia('(prefers-color-scheme: light)').matches`)).toBe(true);
    expect(await frame.evaluate(`window.themeClickCount`)).toBe(1);

    await applyOfficialRuntimeCaptureTheme(frame, 'dark', { requireVisibleControl: true, timeoutMs: 2_000 });
    expect(await frame.locator('html').getAttribute('data-theme')).toBe('dark');
    expect(await frame.getByTestId('app-theme-toggle').textContent()).toBe(fixtureLabels.fr.dark);
    expect(await frame.getByTestId('app-theme-toggle').getAttribute('aria-label')).toBe(fixtureLabels.fr.dark);
    expect(await frame.getByTestId('app-theme-toggle').getAttribute('title')).toBe(fixtureLabels.fr.dark);
    expect(await frame.getByTestId('app-theme-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(await frame.evaluate(`window.themeClickCount`)).toBe(2);
  });

  it('rejects a testid control whose visible text is only "Dark"', async () => {
    await page.setContent(`<html data-theme="dark"><body>${staticThemeControl({ text: 'Dark' })}</body></html>`);

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'dark', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow(
      'visible text must equal exactly EN "Switch to light mode" or FR "Passer en mode clair", received "Dark"',
    );
  });

  it('rejects a missing localized title even when the testid and visible text are valid', async () => {
    await page.setContent(`<html data-theme="dark"><body>${staticThemeControl({ title: null })}</body></html>`);

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'dark', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow('title must equal exactly "Switch to light mode", received null');
  });

  it('rejects a missing localized aria-label even when the testid and visible text are valid', async () => {
    await page.setContent(`<html data-theme="dark"><body>${staticThemeControl({ ariaLabel: null })}</body></html>`);

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'dark', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow('aria-label must equal exactly "Switch to light mode", received null');
  });

  it('rejects aria-pressed when it is incoherent with the active dark theme', async () => {
    await page.setContent(
      `<html data-theme="dark"><body>${staticThemeControl({ ariaPressed: 'false' })}</body></html>`,
    );

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'dark', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow('aria-pressed must equal "true" while dark theme is active, received "false"');
  });

  it('rejects duplicate visible app theme controls', async () => {
    const control = staticThemeControl();

    await page.setContent(`<html data-theme="dark"><body>${control}${control}</body></html>`);

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'dark', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow(
      'Generated theme control contract violation for dark: expected exactly one visible [data-testid="app-theme-toggle"], found 2',
    );
  });

  it('rejects stale label and pressed state after a real theme click', async () => {
    await page.setContent(interactiveThemeFixture('en', { updateAfterClick: false }));

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'light', { requireVisibleControl: true, timeoutMs: 2_000 }),
    ).rejects.toThrow(
      'visible text must equal exactly EN "Switch to dark mode" or FR "Passer en mode sombre", received "Switch to light mode"',
    );
    expect(await page.locator('html').getAttribute('data-theme')).toBe('light');
    expect(await page.evaluate(`window.themeClickCount`)).toBe(1);
  });

  it('fails closed when a generated app exposes no real theme control', async () => {
    await page.setContent('<html data-theme="dark"><body><main>No theme control</main></body></html>');

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'light', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow(
      'Generated theme control contract violation for dark: expected exactly one visible [data-testid="app-theme-toggle"], found 0',
    );
  });

  it('keeps prefers-color-scheme support when the runtime has no explicit theme state', async () => {
    await page.setContent(`
      <style>
        :root { background: rgb(10, 20, 30); }
        @media (prefers-color-scheme: light) { :root { background: rgb(240, 245, 250); } }
      </style>
      <main>Media-owned theme</main>
    `);

    await expect(applyOfficialRuntimeCaptureTheme(page, 'light')).resolves.toEqual({
      activeTheme: 'light',
      strategy: 'prefers-color-scheme',
    });
    expect(await page.evaluate(`window.matchMedia('(prefers-color-scheme: light)').matches`)).toBe(true);
    expect(await page.evaluate(`window.getComputedStyle(document.documentElement).backgroundColor`)).toBe(
      'rgb(240, 245, 250)',
    );
  });

  it('reports exact before/after diagnostics when the visible control misses the target', async () => {
    await page.setContent(`
      <html data-theme="dark">
        <body>${staticThemeControl()}</body>
      </html>
    `);

    await expect(applyOfficialRuntimeCaptureTheme(page, 'light', { timeoutMs: 250 })).rejects.toThrow(
      /visible official runtime theme control "Switch to light mode" did not reach light.*Before:.*After:/,
    );
  });
});
