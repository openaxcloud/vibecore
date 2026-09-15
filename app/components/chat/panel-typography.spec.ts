import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * UNIF-08 (lot E) — gardes SOURCE tokens & typo sur BaseChat.tsx.
 *
 * 1. Titres de section : les trois familles historiques (`h3 text-sm
 *    font-semibold`, `h3 mb-2 text-sm font-medium`, `h4 text-xs uppercase`)
 *    sont remplacées par le composant partagé `PanelSectionTitle` (13 px
 *    section / 11 px groupe — audit H3).
 * 2. Échelle typo fermée : plus de `text-[9px]` / `text-[10px]` dans les
 *    panneaux (minimum lisible 11 px — audit K2).
 * 3. Statuts sur UNE famille de tokens : plus de rouge/orange/vert Tailwind
 *    bruts (`red-500`, `amber-500`, `green-500`) à côté des tokens
 *    `--status-*` thémés clair/sombre (audit K1).
 */

const baseChatSource = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

const baseChatCode = codeOnly(baseChatSource);

describe('UNIF-08 — titres de section normalisés (lot E)', () => {
  it('les trois familles de titres ad hoc ont disparu de BaseChat', () => {
    expect(baseChatCode).not.toContain('<h3 className="text-sm font-semibold text-bolt-elements-textPrimary">');
    expect(baseChatCode).not.toContain('<h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">');
    expect(baseChatCode).not.toContain(
      '<h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">',
    );
  });

  it('BaseChat consomme PanelSectionTitle depuis les primitives partagées (21 titres convertis)', () => {
    expect(baseChatCode).toMatch(
      /import \{[^}]*PanelSectionTitle[^}]*\} from '~\/components\/project-ide\/PanelPrimitives'/,
    );

    const occurrences = baseChatCode.match(/<PanelSectionTitle[\s>]/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(21);
  });
});

describe('UNIF-08 — échelle typo fermée (lot E)', () => {
  it('aucun text-[9px] / text-[10px] ne subsiste dans BaseChat (minimum 11 px)', () => {
    expect(baseChatCode).not.toContain('text-[9px]');
    expect(baseChatCode).not.toContain('text-[10px]');
  });
});

describe('UNIF-08 — statuts sur les tokens thémés (lot E)', () => {
  it('plus de palette Tailwind brute pour les statuts (red/amber/green/emerald-500)', () => {
    const offenders = baseChatCode.match(/\b(?:red|amber|green|emerald|yellow)-500(?:\/\d+)?/g) ?? [];
    expect(offenders).toEqual([]);
  });

  it('les classes de consensus passent par la famille --status-*', () => {
    expect(baseChatCode).toContain(
      "ACCEPTED: 'text-[var(--status-success-text)] border-[var(--status-success-border)]'",
    );
    expect(baseChatCode).toContain("REJECTED: 'text-[var(--status-error-text)] border-[var(--status-error-border)]'");
    expect(baseChatCode).toContain(
      "PARTIAL: 'text-[var(--status-warning-text)] border-[var(--status-warning-border)]'",
    );
  });
});
