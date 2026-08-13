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

  it('accepts generic English and French visible control labels', () => {
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Toggle colour theme')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Light mode')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Changer de thème')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Passer en mode sombre')).toBe(true);
    expect(OFFICIAL_RUNTIME_THEME_CONTROL_LABEL.test('Search')).toBe(false);
  });

  it('uses the real visible control when the runtime owns explicit theme state', async () => {
    await page.setContent(`
      <style>
        :root[data-theme='dark'] { color-scheme: dark; background: rgb(10, 20, 30); }
        :root[data-theme='light'] { color-scheme: light; background: rgb(240, 245, 250); }
      </style>
      <button aria-label="Toggle colour theme">Light mode</button>
      <script>
        window.themeClickCount = 0;
        document.documentElement.dataset.theme = 'dark';
        document.querySelector('button').addEventListener('click', (event) => {
          window.themeClickCount += 1;
          const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
          document.documentElement.dataset.theme = next;
          event.currentTarget.textContent = next === 'dark' ? 'Light mode' : 'Dark mode';
        });
      </script>
    `);

    await expect(applyOfficialRuntimeCaptureTheme(page, 'light', { timeoutMs: 2_000 })).resolves.toEqual({
      activeTheme: 'light',
      strategy: 'visible-runtime-control',
    });
    expect(await page.locator('html').getAttribute('data-theme')).toBe('light');
    expect(await page.evaluate(`window.themeClickCount`)).toBe(1);

    await applyOfficialRuntimeCaptureTheme(page, 'dark', { timeoutMs: 2_000 });
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
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

  it('emulates the containing page and clicks the real data-testid control inside a native iframe', async () => {
    await page.setContent('<iframe title="Preview"></iframe>');

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());

    if (!frame) {
      throw new Error('Expected the native Preview iframe');
    }

    await frame.setContent(`
      <style>
        :root[data-theme='dark'] { color-scheme: dark; background: rgb(10, 20, 30); }
        :root[data-theme='light'] { color-scheme: light; background: rgb(240, 245, 250); }
      </style>
      <button data-testid="app-theme-toggle" aria-label="Palette">Theme</button>
      <script>
        window.themeClickCount = 0;
        document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
        document.querySelector('button').addEventListener('click', () => {
          window.themeClickCount += 1;
          document.documentElement.dataset.theme =
            document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        });
      </script>
    `);

    await expect(
      applyOfficialRuntimeCaptureTheme(frame, 'light', { requireVisibleControl: true, timeoutMs: 2_000 }),
    ).resolves.toEqual({
      activeTheme: 'light',
      strategy: 'visible-runtime-control',
    });
    expect(await frame.locator('html').getAttribute('data-theme')).toBe('light');
    expect(await frame.evaluate(`window.matchMedia('(prefers-color-scheme: light)').matches`)).toBe(true);
    expect(await frame.evaluate(`window.themeClickCount`)).toBe(1);

    await applyOfficialRuntimeCaptureTheme(frame, 'dark', { requireVisibleControl: true, timeoutMs: 2_000 });
    expect(await frame.locator('html').getAttribute('data-theme')).toBe('dark');
    expect(await frame.evaluate(`window.themeClickCount`)).toBe(2);
  });

  it('fails closed when a generated app exposes no real theme control', async () => {
    await page.setContent('<html data-theme="dark"><body><main>No theme control</main></body></html>');

    await expect(
      applyOfficialRuntimeCaptureTheme(page, 'light', { requireVisibleControl: true, timeoutMs: 250 }),
    ).rejects.toThrow(/no visible data-testid=app-theme-toggle or EN\/FR theme control/);
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
        <body><button aria-label="Changer de thème">Mode clair</button></body>
      </html>
    `);

    await expect(applyOfficialRuntimeCaptureTheme(page, 'light', { timeoutMs: 250 })).rejects.toThrow(
      /visible official runtime theme control "Changer de thème" did not reach light.*Before:.*After:/,
    );
  });
});
