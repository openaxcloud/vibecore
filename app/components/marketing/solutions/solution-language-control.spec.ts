import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Solutions language control ownership', () => {
  const pageComponents = [
    'app/components/marketing/solutions/AppBuilderSolutionPage.tsx',
    'app/components/marketing/solutions/SolutionSalesPage.tsx',
  ] as const;

  it('keeps the public header as the single visible language control', () => {
    const shellSource = readSource('app/components/marketing/ecode-exact/EcodeExactShell.tsx');

    expect(shellSource).toContain("import { LanguageSwitch } from '~/components/i18n/LanguageSwitch'");
    expect(shellSource).toContain('<LanguageSwitch />');

    for (const componentPath of pageComponents) {
      const componentSource = readSource(componentPath);

      expect(componentSource).toContain('<PublicShell language={language}>');
      expect(componentSource).not.toMatch(/function\s+LanguageSwitch\b/u);
      expect(componentSource).not.toContain('to="?lang=en"');
      expect(componentSource).not.toContain('to="?lang=fr"');
    }
  });

  it('removes the obsolete hero-level switch styles from both layouts', () => {
    expect(readSource('app/components/marketing/solutions/app-builder.css')).not.toContain(
      '.app-builder-language-switch',
    );
    expect(readSource('app/components/marketing/solutions/solution-sales.css')).not.toContain('.sol-language-switch');
  });
});
