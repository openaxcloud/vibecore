/**
 * @vitest-environment jsdom
 */

/*
 * UNIF-14 (lot 8, docs/UX_UNIFORMIZATION_AUDIT.md) — boutons/contrôles ad hoc
 * restants de BaseChat.tsx sur les primitives partagées :
 *
 * 1. Env : onglets de scope Development | Preview | Production → PanelToolTabs
 *    (gelés pendant la vue Diff via la nouvelle prop `disabled`) ; « Diff
 *    scopes » et « Reveal values » → PanelButton ; Edit / Copy de ligne →
 *    PanelButton outline sm.
 * 2. Security : exports SARIF / JSON / Print → PanelButton outline sm ;
 *    « Cancel scan » → PanelButton danger (classe `.bolt-project-security-cancel`
 *    supprimée du JSX et de la feuille).
 * 3. Monitoring : zoom fit/2x/4x → FilterChip commun (Refresh metrics était
 *    déjà passé au lot 7 — re-vérifié ici).
 * 4. Integrations : raccourcis d'en-tête, CTA de section, Connect/Manage de
 *    carte, Configure, Close configuration → PanelButton (dont sortie des
 *    tokens legacy `--bolt-elements-button-primary-*` du footer de carte).
 * 5. Workflows : « New workflow » → PanelButton primary ; corbeille de tâche →
 *    PanelButton danger sm.
 * 6. Skills : bascule de scope communautaire Project | Workspace → FilterChip
 *    (nouvelle prop `disabled`) ; Install / Uninstall qui dupliquaient les
 *    classes du PanelButton à la main → composant partagé.
 * 7. SCSS : gabarits nus correspondants supprimés + purge de l'orphelin
 *    `.bolt-project-object-grid` (0 usage JSX depuis le lot 7).
 *
 * BaseChat.tsx (23k lignes) n'est pas rendable en jsdom : comme pour les lots
 * précédents, les points BaseChat/SCSS sont vérifiés au niveau source ; les
 * primitives (PanelToolTabs disabled, PanelButton gap) au niveau DOM dans
 * PanelPrimitives.spec.tsx, et FilterChip `disabled` au niveau DOM ici.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterChip } from '~/components/ui/FilterChip';

afterEach(cleanup);

const read = (...segments: string[]) => readFileSync(join(__dirname, ...segments), 'utf8');

const baseChatSource = read('..', 'chat', 'BaseChat.tsx');
const indexScssSource = read('..', '..', 'styles', 'index.scss');

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const sliceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start, `marker introuvable: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `marker introuvable: ${endMarker}`).toBeGreaterThan(start);

  return source.slice(start, end);
};

describe('UNIF-14 — point 1 : panneau Env sur les primitives', () => {
  it('les onglets de scope passent au PanelToolTabs (gelés pendant la vue Diff) et « Diff scopes » au PanelButton', () => {
    const scopes = sliceBetween(baseChatSource, 'className="bolt-project-env-scopes"', 'bolt-project-panel-toolbar');

    expect(scopes).toContain('<PanelToolTabs');
    expect(scopes).toContain('disabled={showDiff}');
    expect(scopes).toContain('aria-pressed={showDiff}');
    expect(countOccurrences(scopes, '<PanelButton')).toBe(1);

    // Plus aucun bouton nu ni classe `selected` maison dans la rangée de scopes.
    expect(scopes).not.toContain('<button');
    expect(scopes).not.toContain("'selected'");
  });

  it('« Reveal values » de la vue Diff est un PanelButton outline sm à aria-pressed', () => {
    const actions = sliceBetween(baseChatSource, 'className="bolt-project-env-diff-actions"', 'diffRows.length');

    expect(actions).toContain('<PanelButton');
    expect(actions).toContain('aria-pressed={revealDiff}');
    expect(actions).not.toContain('<button');
  });

  it('Edit / Copy / Delete de ligne sont 3 PanelButton outline sm (plus de boutons nus)', () => {
    const row = sliceBetween(
      baseChatSource,
      "t('chat.copy.storedInProjectMetadata_ac0072b9')",
      "t('chat.copy.delete_f6fdbe48')",
    );

    expect(countOccurrences(row, '<PanelButton')).toBe(3);
    expect(countOccurrences(row, 'variant="outline"')).toBe(3);
    expect(countOccurrences(row, 'size="sm"')).toBe(3);
    expect(row).not.toContain('<button');
  });
});

describe('UNIF-14 — point 2 : Security (exports + Cancel scan)', () => {
  it('les 3 exports (SARIF / JSON / Print) sont des PanelButton outline sm', () => {
    const exportsBlock = sliceBetween(baseChatSource, "t('chat.copy.exportAuditPackage_913ca7d5')", '<PanelRows');

    expect(countOccurrences(exportsBlock, '<PanelButton')).toBe(3);
    expect(countOccurrences(exportsBlock, 'variant="outline"')).toBe(3);
    expect(exportsBlock).not.toContain('<button');
  });

  it('« Cancel scan » est un PanelButton danger ; la classe maison a disparu du JSX et de la feuille', () => {
    const cancel = sliceBetween(
      baseChatSource,
      "t('chat.copy.scanning_bd5e8d69')",
      "t('chat.copy.cancelScan_b37844ba')",
    );
    expect(cancel).toContain('<PanelButton type="button" variant="danger"');

    expect(baseChatSource).not.toContain('bolt-project-security-cancel');
    expect(indexScssSource).not.toContain('.bolt-project-security-cancel {');
    expect(indexScssSource).not.toContain('.bolt-project-security-cancel:hover');
  });
});

describe('UNIF-14 — point 3 : zoom Monitoring sur FilterChip', () => {
  it('fit / 2x / 4x passent au FilterChip commun (plus de classe selected maison)', () => {
    const zoom = sliceBetween(baseChatSource, "(['fit', '2x', '4x'] as const)", '</div>');

    expect(zoom).toContain('<FilterChip');
    expect(zoom).not.toContain('<button');
    expect(zoom).not.toContain("'selected'");
  });

  it('« Refresh metrics » (lot 7) est toujours un PanelButton', () => {
    const refresh = sliceBetween(baseChatSource, "t('chat.copy.refreshMetrics_d4cc03bc')", '</PanelButton>');
    expect(refresh).not.toContain('<button');
  });
});

describe('UNIF-14 — point 4 : Integrations sur PanelButton', () => {
  const panel = sliceBetween(baseChatSource, 'function ProjectIntegrationsPanel', 'const ENV_VAR_SCOPES');

  it('raccourcis d’en-tête, CTA de section, Connect/Manage, Configure et Close configuration sont des PanelButton', () => {
    // En-tête : API keys / Webhooks / Event streaming.
    const headerActions = sliceBetween(panel, 'className="bolt-project-integrations-actions"', '</header>');
    expect(countOccurrences(headerActions, '<PanelButton')).toBe(3);
    expect(headerActions).not.toContain('<button');

    // Connect/Manage de carte garde son data-testid mais devient un PanelButton primary sm.
    const cardFooter = sliceBetween(panel, 'integrationCategoryLabel(item.category)', '</footer>');
    expect(cardFooter).toContain('<PanelButton');
    expect(cardFooter).toContain('data-testid={`button-connect-${item.id}`}');
    expect(cardFooter).not.toContain('<button');
  });

  it('il ne reste que 3 boutons nus, tous navigationnels (onglets, catégories, liste connectée)', () => {
    /*
     * Compte RÉEL après conversion : `.bolt-project-integrations-tabs` (1 map),
     * les catégories de la sidebar (1 map) et la mini-liste « Connected »
     * (1 map). Avant UNIF-14 ce même périmètre portait 11 `<button` ad hoc.
     */
    expect(countOccurrences(panel, '<button')).toBe(3);
  });

  it('le footer de carte ne passe plus par les tokens legacy button-primary', () => {
    expect(indexScssSource).not.toContain('.bolt-project-integrations-grid article footer button');
  });
});

describe('UNIF-14 — point 5 : Workflows sur PanelButton', () => {
  const panel = sliceBetween(baseChatSource, 'function ProjectWorkflowsPanel', 'function AddAuthenticationCard');

  it('« New workflow » est un PanelButton primary qui garde son data-testid', () => {
    const header = sliceBetween(panel, 'data-testid="new-workflow-button"', '</PanelButton>');
    expect(panel).toContain('<PanelButton type="button" onClick={() => setCreateOpen((value) => !value)}');
    expect(header).toContain('i-ph:plus');
  });

  it('la corbeille de tâche est un PanelButton danger sm (icône seule, aria-label conservé)', () => {
    const trash = sliceBetween(panel, 'className="bolt-project-workflow-task-delete"', '</ConfirmSubmitForm>');
    expect(trash).toContain('<PanelButton');
    expect(trash).toContain('variant="danger"');
    expect(trash).toContain('i-ph:trash');
    expect(trash).toContain("aria-label={t('chat.copy.deleteTask_9ad9dc2d')}");
    expect(trash).not.toContain('<button');
  });

  it('seuls le disclosure de carte et la bascule Sequential|Parallel restent des boutons nus', () => {
    // Compte RÉEL : 1 bouton-titre (expand) + 2 segments du mode d'exécution.
    expect(countOccurrences(panel, '<button')).toBe(3);
  });
});

describe('UNIF-14 — point 6 : Skills (scope communautaire + Install/Uninstall)', () => {
  it('la bascule Project | Workspace passe au FilterChip (avec gel sans workspace)', () => {
    const toggle = sliceBetween(baseChatSource, "t('chat.copy.installTo_358c06d6')", 'filteredCatalog.length');

    expect(toggle).toContain('<FilterChip');
    expect(toggle).toContain("disabled={scope === 'workspace' && !hasWorkspace}");
    expect(toggle).not.toContain('<button');
  });

  it('Install / Uninstall ne dupliquent plus les classes du PanelButton à la main', () => {
    const actions = sliceBetween(baseChatSource, '{installed ? (', 'isExpanded ?');

    expect(countOccurrences(actions, '<PanelButton')).toBe(2);
    expect(countOccurrences(actions, 'variant="danger"')).toBe(1);
    expect(actions).not.toContain('<button');
    expect(actions).not.toContain('bg-[var(--vc-ide-accent-action)]');
  });

  it('FilterChip : la nouvelle prop disabled gèle le chip cliquable (DOM)', () => {
    const onClick = vi.fn();
    render(<FilterChip label="Workspace" disabled onClick={onClick} />);

    const chip = screen.getByRole('button', { name: 'Workspace' });
    expect(chip).toHaveProperty('disabled', true);

    fireEvent.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('UNIF-14 — point 7 : gabarits SCSS nus retirés + purge .bolt-project-object-grid', () => {
  it('les gabarits bouton remplacés par les primitives ont disparu de la feuille desktop', () => {
    /*
     * Ancrage en début de ligne : les règles mobiles énumérées (planchers
     * tactiles 42px / width 100%) gardent les mêmes suffixes de sélecteur en
     * position indentée et restent légitimes.
     */
    expect(indexScssSource).not.toMatch(/^\.bolt-project-env-scopes button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-env-diff-actions button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-env-row button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-security-reports button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-monitoring-zoom button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-integrations-actions button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-integrations-section-head button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-integrations-list article > button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-integration-config > button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-workflows-head > button/m);
    expect(indexScssSource).not.toMatch(/^\.bolt-project-workflow-task-delete button/m);

    // Les conteneurs de mise en page restent, eux.
    expect(indexScssSource).toContain('.bolt-project-env-scopes {');
    expect(indexScssSource).toContain('.bolt-project-env-diff-actions {');
    expect(indexScssSource).toContain('.bolt-project-monitoring-zoom {');
    expect(indexScssSource).toContain('.bolt-project-integrations-actions,');

    // Les onglets Browse/Connected/Webhooks/API keys gardent leur habillage (navigation, pas CTA).
    expect(indexScssSource).toContain('.bolt-project-integrations-tabs button {');

    // Nouvel état gelé des onglets d'outil partagés.
    expect(indexScssSource).toContain('.bolt-project-tool-tabs button:disabled');
  });

  it('les planchers tactiles mobiles énumérés restent en place', () => {
    expect(indexScssSource).toContain('.bolt-project-integrations-actions button,');
    expect(indexScssSource).toContain(
      '.bolt-responsive-ide-mobile .bolt-project-security-reports article > div button',
    );
  });

  it('.bolt-project-object-grid est purgé : plus aucun sélecteur (0 usage JSX)', () => {
    expect(baseChatSource).not.toContain('bolt-project-object-grid');

    // Plus aucune règle ni membre de groupe — il ne reste que le commentaire de purge.
    expect(indexScssSource).not.toMatch(/^\s*\.bolt-project-object-grid[^\S\n]*[,{]/m);
    expect(indexScssSource).not.toMatch(/^\s*\.bolt-project-object-grid\s+\w/m);
  });
});
