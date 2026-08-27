import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IDE_ADDRESSABLE_PANELS,
  IDE_AGENT_PANEL,
  IDE_MANAGEMENT_PANELS,
  IDE_NON_ADDRESSABLE_TAB_KEYS,
  IDE_PANEL_ALIASES,
  ideMobileTarget,
  isIdeAddressablePanel,
  isIdeManagementPanel,
  resolveIdePanelKey,
  type IdeAddressablePanel,
} from './panel-registry';

/**
 * BUG-IDE-PANEL-RESOLUTION-001 — preuve exécutable : pour CHAQUE clé affichable
 * (canonique ou alias), l'URL, l'en-tête et le contenu doivent désigner le même
 * panneau. C'est exactement l'invariant qui était rompu en prod : `?panel=agent`
 * affichait Extensions, et l'en-tête « Agent » coiffait le contenu Déploiements.
 */
describe('registre des panneaux IDE', () => {
  const everyDisplayableKey: string[] = [...IDE_ADDRESSABLE_PANELS, ...Object.keys(IDE_PANEL_ALIASES)];

  it('accepte toutes les clés canoniques, agent et chat compris', () => {
    for (const panel of IDE_ADDRESSABLE_PANELS) {
      const resolution = resolveIdePanelKey(panel);
      expect(resolution, `clé canonique ${panel}`).toMatchObject({ status: 'canonical', panel });
    }

    expect(resolveIdePanelKey('agent')).toMatchObject({ status: 'canonical', panel: 'agent' });
    expect(resolveIdePanelKey('chat')).toMatchObject({ status: 'alias', panel: 'agent' });
  });

  it('résout chaque alias vers une clé canonique adressable', () => {
    for (const [alias, target] of Object.entries(IDE_PANEL_ALIASES)) {
      const resolution = resolveIdePanelKey(alias);
      expect(resolution, `alias ${alias}`).toMatchObject({ status: 'alias', panel: target });
      expect(isIdeAddressablePanel(target), `cible de l'alias ${alias}`).toBe(true);
    }
  });

  it('normalise la casse et les espaces sans jamais deviner', () => {
    expect(resolveIdePanelKey('  Agent ')).toMatchObject({ status: 'canonical', panel: 'agent' });
    expect(resolveIdePanelKey('DEPLOY')).toMatchObject({ status: 'alias', panel: 'deployments' });
  });

  it('signale explicitement une clé inconnue au lieu de retomber sur deployments', () => {
    for (const unknown of ['nope', 'deployments2', 'agent-x', 'studio!', 'tools']) {
      const resolution = resolveIdePanelKey(unknown);
      expect(resolution, `clé inconnue ${unknown}`).toEqual({ status: 'unknown', requested: unknown });
    }

    expect(resolveIdePanelKey('')).toEqual({ status: 'empty' });
    expect(resolveIdePanelKey(null)).toEqual({ status: 'empty' });
  });

  it('fait concorder URL, en-tête et contenu pour chaque clé affichable', () => {
    for (const key of everyDisplayableKey) {
      const resolution = resolveIdePanelKey(key);

      // 1. l'URL est acceptée
      expect(resolution.status, `statut de ${key}`).not.toBe('unknown');
      expect(resolution.status, `statut de ${key}`).not.toBe('empty');

      const panel = (resolution as { panel: IdeAddressablePanel }).panel;
      const target = ideMobileTarget(panel);

      // 2. l'onglet (donc l'en-tête, qui lit le méta de cet identifiant) désigne le panneau résolu
      expect(target.tabId, `onglet de ${key}`).toBe(panel);

      // 3. le contenu désigne le même panneau que l'en-tête
      if (target.surface === 'deploy') {
        expect(target.servicePanel, `contenu de ${key}`).toBe(panel);
        expect(isIdeManagementPanel(panel), `${key} doit être un panneau de service`).toBe(true);
      } else {
        expect(target.servicePanel, `${key} ne doit pas rendre de panneau de service`).toBeUndefined();
        expect(target.surface, `surface de ${key}`).toBe(panel === IDE_AGENT_PANEL ? 'chat' : panel);
      }
    }
  });

  it('ne laisse aucun doublon dans la liste des panneaux de service', () => {
    const seen = new Set<string>();

    const duplicates = IDE_MANAGEMENT_PANELS.filter((panel) => {
      if (seen.has(panel)) {
        return true;
      }

      seen.add(panel);

      return false;
    });

    expect(duplicates).toEqual([]);
  });

  /**
   * Garde anti-résidu : c'est ce test qui aurait attrapé la clé `web`, déclarée
   * dans le méta d'onglets mobiles mais jamais dispatchée. Toute nouvelle clé
   * d'onglet doit être canonique, alias, ou déclarée non adressable.
   */
  it('couvre toutes les clés d’onglets mobiles déclarées dans BaseChat', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8');
    const block = source.match(
      /const ECODE_MOBILE_TAB_META_BASE: Record<string, \{ id: string; name: string; icon: string \}> = \{([\s\S]*?)\n\};/,
    );

    expect(block, 'bloc ECODE_MOBILE_TAB_META_BASE introuvable').not.toBeNull();

    const keys = [...(block?.[1] ?? '').matchAll(/^\s{2}'?([a-z-]+)'?:\s*\{/gm)].map((match) => match[1]);

    expect(keys.length).toBeGreaterThan(40);

    const uncovered = keys.filter(
      (key) =>
        resolveIdePanelKey(key).status === 'unknown' &&
        !(IDE_NON_ADDRESSABLE_TAB_KEYS as readonly string[]).includes(key),
    );

    expect(uncovered, `clés d’onglets mobiles non résolues : ${uncovered.join(', ')}`).toEqual([]);
  });
});
