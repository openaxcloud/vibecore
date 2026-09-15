import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * UNIF lot 6 — gardes SOURCE hors BaseChat.tsx (BaseChat est traité par les
 * lots 2/3/4 encore en vol ; il est volontairement exclu ici).
 *
 * 1. Accent primary : plus de palette statique `accent-500`/`accent-600`
 *    (hex figé, non surface-aware) dans les composants convertis — tout passe
 *    par la famille `--vc-action-primary` (alias surface-aware de
 *    `--vc-ide-accent-action`, cf. IDE_PRIMARY_ACCENT_CLASSES / ui/Button).
 * 2. Échelle typo fermée : plus de `text-[9px]` / `text-[10px]` dans les
 *    fichiers chat déjà soldés et les routes admin/login/roles/collaborators/
 *    usage (minimum lisible 11 px — audit K2).
 */

const appDir = join(__dirname, '..', '..');

const read = (relativePath: string) => readFileSync(join(appDir, relativePath), 'utf8');

const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

describe('UNIF lot 6 — accent-500 statique éradiqué hors BaseChat', () => {
  const convertedFiles = [
    'components/chat/ChatBox.tsx',
    'components/chat/UserMessage.tsx',
    'components/chat/SendButton.client.tsx',
    'components/workbench/Workbench.client.tsx',
    'components/ui/Dialog.tsx',
  ];

  it.each(convertedFiles)('%s ne contient plus accent-500 / accent-600', (relativePath) => {
    const source = codeOnly(read(relativePath));
    expect(source).not.toMatch(/\b(?:bg|text|border)-accent-(?:500|600)(?:\/\d+)?\b/);
  });

  it.each(convertedFiles)('%s consomme la famille --vc-action-primary', (relativePath) => {
    const source = codeOnly(read(relativePath));
    expect(source).toContain('--vc-action-primary');
  });

  it('le bouton de confirmation de SelectionDialog garde les mêmes états que le primary canonique', () => {
    const source = codeOnly(read('components/ui/Dialog.tsx'));
    expect(source).toContain('bg-[var(--vc-action-primary)]');
    expect(source).toContain('hover:bg-[var(--vc-action-primary-hover)]');
    expect(source).toContain('text-[var(--vc-action-primary-foreground)]');
  });
});

describe('UNIF lot 6 — échelle typo fermée (11 px minimum) hors BaseChat', () => {
  const typographyFiles = [
    'components/chat/Artifact.tsx',
    'components/chat/CodeBlock.tsx',
    'components/chat/DiffActionRow.tsx',
    'components/chat/InlineFileActionDiff.tsx',
    'routes/admin.$section.tsx',
    'routes/login.tsx',
    'routes/organization-roles.tsx',
    'routes/projects.$projectId.collaborators.tsx',
    'routes/usage.tsx',
  ];

  it.each(typographyFiles)('%s ne contient plus de text-[9px]/text-[10px]', (relativePath) => {
    const source = codeOnly(read(relativePath));
    expect(source).not.toContain('text-[9px]');
    expect(source).not.toContain('text-[10px]');
  });
});
