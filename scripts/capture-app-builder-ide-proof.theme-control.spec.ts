import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Solutions proof capture theme control', () => {
  const captureSource = readSource('scripts/capture-app-builder-ide-proof.ts');

  const applyCaptureThemeSource = captureSource.slice(
    captureSource.indexOf('async function applyCaptureTheme'),
    captureSource.indexOf('\ntype IdeShellAudit'),
  );

  const baseChatSource = readSource('app/components/chat/BaseChat.tsx');

  it('uses the real localized command-palette control instead of compact Agent header actions', () => {
    expect(captureSource).toContain("page.keyboard.press('ControlOrMeta+Shift+P')");
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
    expect(applyCaptureThemeSource).toContain('emulateMedia({ colorScheme: theme })');
  });
});
