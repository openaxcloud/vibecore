/**
 * @vitest-environment jsdom
 */

/*
 * UNIF lot 4 (docs/UX_UNIFORMIZATION_AUDIT.md) — suite du programme
 * d'uniformisation :
 *
 * 1. Boutons restants → PanelButton (héros Activity, items du menu ⋮ de la
 *    coque, Retry « danger » de la bannière d'erreur, « Enable object
 *    storage ») + décision « LE » style primary (accent action plein, source
 *    unique IDE_PRIMARY_ACCENT_CLASSES dans ui/EmptyState).
 * 2. UNE famille de statuts : `--status-*` sont des alias de
 *    `--vc-ide-accent-(success|warning|error)` (info → accent action).
 * 3. Inputs ad hoc → PanelInput (lien de partage, filtre objets) avec size sm.
 * 4. Chips/badges → ui/Badge (tags skills) + icône Phosphor au lieu de
 *    l'emoji brut « 📁 » (Object Storage).
 * 5. Micro-typo hors BaseChat : plus de text-[9px]/text-[10px] dans git/*,
 *    Artifact/CodeBlock/DiffActionRow, marketing/ecode-exact.
 * 6. États vides workspace (Search, Locks) → PanelEmptyState.
 *
 * BaseChat.tsx (23k lignes) n'est pas rendable en jsdom : comme pour
 * panel-header-uniformization.spec.tsx, les points BaseChat/SCSS sont vérifiés
 * au niveau source, les primitives au niveau DOM (PanelPrimitives.spec.tsx).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (...segments: string[]) => readFileSync(join(__dirname, ...segments), 'utf8');

const baseChatSource = read('..', 'chat', 'BaseChat.tsx');
const indexScssSource = read('..', '..', 'styles', 'index.scss');
const emptyStateSource = read('..', 'ui', 'EmptyState.tsx');
const panelPrimitivesSource = read('.', 'PanelPrimitives.tsx');
const searchSource = read('..', 'workbench', 'Search.tsx');
const lockManagerSource = read('..', 'workbench', 'LockManager.tsx');

describe('UNIF lot 4 — point 1 : boutons restants → PanelButton', () => {
  it('LE style primary est tranché : source unique IDE_PRIMARY_ACCENT_CLASSES (EmptyState), consommée par PanelButton', () => {
    expect(emptyStateSource).toContain('export const IDE_PRIMARY_ACCENT_CLASSES');

    /*
     * Audit user area : le fond passe par `--vc-cta-accent`, qui vaut l'accent
     * action dans l'IDE (inchangé) et le ton renforcé AA dans la coque user
     * area (blanc sur l'orange de marque = 2,80:1).
     */
    expect(emptyStateSource).toContain("'bg-[var(--vc-cta-accent,var(--vc-ide-accent-action))] text-white");
    expect(panelPrimitivesSource).toContain('IDE_PRIMARY_ACCENT_CLASSES');

    // L'ancien style teinté n'est plus émis par les primitives de panneau.
    expect(panelPrimitivesSource).not.toContain('bg-bolt-elements-button-primary-background');
  });

  it('le héros Activity n’a plus de bouton nu stylé SCSS', () => {
    expect(indexScssSource).not.toContain('.bolt-project-activity-hero button');

    const heroBlock = baseChatSource.slice(
      baseChatSource.indexOf('bolt-project-activity-hero'),
      baseChatSource.indexOf('bolt-project-activity-metrics'),
    );
    expect(heroBlock).toContain('<PanelButton');
    expect(heroBlock).not.toContain('<button');
  });

  it('l’item « Refresh now » du menu ⋮ de la coque est un PanelButton variant="menu"', () => {
    expect(baseChatSource).toMatch(/<PanelButton\s+type="button"\s+variant="menu"\s+role="menuitem"/);
  });

  it('le Retry de la bannière d’erreur est un PanelButton danger (plus de rouge Tailwind brut)', () => {
    expect(baseChatSource).toMatch(
      /<PanelButton type="button" variant="danger" size="sm" onClick=\{\(\) => void loadPanel\(\)\}/,
    );
    expect(baseChatSource).not.toContain('border-red-500/40');
    expect(baseChatSource).not.toContain('bg-red-500/10');
    expect(baseChatSource).not.toContain('hover:bg-red-500/20');
  });

  it('« Enable object storage » passe par PanelButton (primary)', () => {
    expect(baseChatSource).toContain(
      '<PanelButton type="button" onClick={() => void enableStorage()} disabled={enabling || busy} className="w-fit">',
    );
  });
});

describe('UNIF lot 4 — point 2 : UNE famille de statuts', () => {
  it('les tokens --status-*-text sont des alias de --vc-ide-accent-* (clair ET sombre)', () => {
    const errorAliases = indexScssSource.match(/--status-error-text: var\(--vc-ide-accent-error\);/g) ?? [];
    const warningAliases = indexScssSource.match(/--status-warning-text: var\(--vc-ide-accent-warning\);/g) ?? [];
    const successAliases = indexScssSource.match(/--status-success-text: var\(--vc-ide-accent-success\);/g) ?? [];
    const infoAliases = indexScssSource.match(/--status-info-text: var\(--vc-ide-accent-action\);/g) ?? [];

    // Un alias par bloc de thème (sombre :root + clair :root[data-theme='light']).
    expect(errorAliases.length).toBe(2);
    expect(warningAliases.length).toBe(2);
    expect(successAliases.length).toBe(2);
    expect(infoAliases.length).toBe(2);

    // Plus AUCUNE valeur hex propre : la famille --status-* ne double plus les accents.
    expect(indexScssSource).not.toMatch(/--status-(?:success|warning|error|info)-text:\s*#/);
  });
});

describe('UNIF lot 4 — point 3 : inputs ad hoc → PanelInput', () => {
  it('le champ lien de partage est un PanelInput size="sm"', () => {
    expect(baseChatSource).toMatch(/<PanelInput[\s\S]{0,300}?shareLinkUrl_4e30a187/);
    expect(baseChatSource).not.toMatch(/<input[\s\S]{0,400}?shareLinkUrl_4e30a187/);
  });

  it('le filtre d’objets (Object Storage) est un PanelInput size="sm"', () => {
    expect(baseChatSource).toMatch(/<PanelInput\s+size="sm"[\s\S]{0,400}?searchObjects_e9aa6bcc/);
  });
});

describe('UNIF lot 4 — point 4 : chips/badges via ui/Badge + icônes Phosphor', () => {
  it('les tags skills (verdict + provenance) passent par le Badge commun', () => {
    const badgesBlock = baseChatSource.slice(
      baseChatSource.indexOf('function SkillProvenanceBadges'),
      baseChatSource.indexOf('const SEVERITY_STYLE'),
    );

    expect(badgesBlock).toContain('<Badge');
    expect(badgesBlock).toContain('verdictVariant');

    // Plus de pseudo-badges span ad hoc bordés à la main dans ce composant.
    expect(badgesBlock).not.toContain('inline-flex items-center gap-1 rounded border px-1.5');
  });

  it('plus d’emoji brut « 📁 » : le dossier Object Storage a une icône Phosphor', () => {
    expect(baseChatSource).not.toContain('📁');
    expect(baseChatSource).toContain('i-ph:folder');
  });
});

describe('UNIF lot 4 — point 5 : micro-typo hors BaseChat (échelle fermée)', () => {
  const scopedFiles = [
    ['git', 'GitStatusBadge.tsx'],
    ['git', 'GitBranchSyncControls.tsx'],
    ['git', 'GitSettingsPanel.tsx'],
    ['git', 'GitProviderConnectPanel.tsx'],
    ['chat', 'Artifact.tsx'],
    ['chat', 'CodeBlock.tsx'],
    ['chat', 'DiffActionRow.tsx'],
    ['marketing', 'ecode-exact', 'EcodeExactLandingControls.tsx'],
    ['marketing', 'ecode-exact', 'pages', 'Pricing.tsx'],
    ['marketing', 'ecode-exact', 'pages', 'AIAgent.tsx'],
  ] as const;

  it.each(scopedFiles.map((segments) => [segments.join('/'), segments] as const))(
    '%s ne contient plus de text-[9px]/text-[10px]',
    (_label, segments) => {
      const source = read('..', ...segments);
      expect(source).not.toContain('text-[9px]');
      expect(source).not.toContain('text-[10px]');
    },
  );
});

describe('UNIF lot 4 — point 6 : états vides workspace → PanelEmptyState', () => {
  it('Search affiche l’état vide canonique (plus de texte gris nu)', () => {
    expect(searchSource).toContain('<PanelEmptyState');
    expect(searchSource).not.toContain('text-gray-500');
  });

  it('Locks affiche l’état vide canonique', () => {
    expect(lockManagerSource).toContain('<PanelEmptyState');
    expect(lockManagerSource).toContain("copy['lockManager.empty']");
  });
});
