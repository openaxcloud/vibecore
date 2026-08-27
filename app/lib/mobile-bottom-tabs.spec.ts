import { describe, expect, it } from 'vitest';
import { countHiddenMobileBottomTabs, selectVisibleMobileBottomTabs } from './mobile-bottom-tabs';

/*
 * Reported from a phone: "I open a panel and I can't see it in the menu."
 *
 * The row used to pin the FIRST tabs and give the active one a single trailing
 * slot, so with three core tabs at the head of the list every panel the user
 * opened evicted the one opened just before it. Reproduced live at 390px:
 *
 *   initial        : editor · preview · agent · deployments
 *   after Security : editor · preview · agent · security      (deployments gone)
 *   after Skills   : editor · preview · agent · skills        (security gone)
 *   after Ports    : editor · preview · agent · ports         (skills gone)
 *
 * The two assertions below used to REQUIRE that behaviour — they froze the
 * defect. The row now shows the most recently used tabs, which is what a tab
 * strip is for.
 */
const tabs = [
  { id: 'preview', name: 'Webview' },
  { id: 'agent', name: 'AI Agent' },
  { id: 'deployments', name: 'Deployments' },
  { id: 'settings', name: 'Settings' },
  { id: 'database', name: 'Database' },
];

describe('mobile bottom tabs', () => {
  it('shows the most recently used tabs, so a freshly opened panel stays visible', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'database').map((tab) => tab.id)).toEqual([
      'deployments',
      'settings',
      'database',
    ]);
  });

  it('never hides the tab the user is actually looking at', () => {
    const visible = selectVisibleMobileBottomTabs(tabs, 'preview').map((tab) => tab.id);

    expect(visible).toContain('preview');
    expect(visible).toHaveLength(3);
  });

  it('keeps the list order stable when the active tab is older than the window', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'agent').map((tab) => tab.id)).toEqual([
      'agent',
      'settings',
      'database',
    ]);
  });

  it('returns every tab when they all fit', () => {
    expect(selectVisibleMobileBottomTabs(tabs.slice(0, 3), 'agent', 4).map((tab) => tab.id)).toEqual([
      'preview',
      'agent',
      'deployments',
    ]);
  });

  it('no longer evicts the previously opened panel — the reported symptom', () => {
    const core = [{ id: 'editor' }, { id: 'preview' }, { id: 'agent' }];

    // L'utilisateur ouvre Sécurité, puis Compétences : les deux doivent rester joignables.
    const afterSecurity = selectVisibleMobileBottomTabs([...core, { id: 'security' }], 'security', 4);
    expect(afterSecurity.map((tab) => tab.id)).toContain('security');

    const afterSkills = selectVisibleMobileBottomTabs([...core, { id: 'security' }, { id: 'skills' }], 'skills', 4);
    expect(afterSkills.map((tab) => tab.id)).toEqual(['preview', 'agent', 'security', 'skills']);
  });

  it('counts the tabs that rotated out of the row', () => {
    const visibleTabs = selectVisibleMobileBottomTabs(tabs, 'database');

    expect(countHiddenMobileBottomTabs(tabs, visibleTabs)).toBe(2);
  });
});

/*
 * Demande d'Avi du 19/08 : la rangée porte TROIS onglets fixes — Webview, Agent,
 * Déploiement — et l'éditeur devient un panneau à la demande. Les fixes sont
 * donc épinglés en tête et le créneau restant va au panneau le plus récent.
 */
describe('mobile bottom tabs — trois onglets fixes', () => {
  const core = ['preview', 'agent', 'deployments'] as const;

  it('garde les trois fixes visibles quand un panneau à la demande est ouvert', () => {
    const open = [...tabs.slice(0, 3), { id: 'security', name: 'Security' }];

    expect(selectVisibleMobileBottomTabs(open, 'security', 4, core).map((tab) => tab.id)).toEqual([
      'preview',
      'agent',
      'deployments',
      'security',
    ]);
  });

  it('n’évince jamais un fixe au profit d’un panneau à la demande', () => {
    const open = [...tabs.slice(0, 3), { id: 'security', name: 'Security' }, { id: 'skills', name: 'Skills' }];
    const visible = selectVisibleMobileBottomTabs(open, 'skills', 4, core).map((tab) => tab.id);

    expect(visible).toEqual(['preview', 'agent', 'deployments', 'skills']);
    expect(visible).toContain('preview');
    expect(visible).toContain('agent');
    expect(visible).toContain('deployments');
  });

  it('montre toujours le panneau regardé, même plus ancien que la fenêtre', () => {
    const open = [...tabs.slice(0, 3), { id: 'security', name: 'Security' }, { id: 'skills', name: 'Skills' }];
    const visible = selectVisibleMobileBottomTabs(open, 'security', 4, core).map((tab) => tab.id);

    expect(visible).toContain('security');
    expect(visible).toHaveLength(4);
  });

  /*
   * Le compromis assumé : trois fixes pour quatre créneaux n'en laissent qu'UN à
   * la demande, donc le deuxième panneau ouvert masque le premier. Ce test le
   * FIGE volontairement — non pour bénir le symptôme, mais pour que la pastille
   * `+N` reste obligatoire : elle est le seul indice que des onglets existent
   * au-delà de la rangée.
   */
  it('ne laisse qu’un créneau à la demande, et le compte des masqués le signale', () => {
    const open = [...tabs.slice(0, 3), { id: 'security', name: 'Security' }, { id: 'skills', name: 'Skills' }];
    const visible = selectVisibleMobileBottomTabs(open, 'skills', 4, core);

    expect(visible.map((tab) => tab.id)).not.toContain('security');
    expect(countHiddenMobileBottomTabs(open, visible)).toBe(1);
  });

  it('sans liste de fixes, retombe sur le comportement « plus récents »', () => {
    expect(selectVisibleMobileBottomTabs(tabs, 'database').map((tab) => tab.id)).toEqual([
      'deployments',
      'settings',
      'database',
    ]);
  });
});

/*
 * Mesuré en PRODUCTION le 19/08 à 390 px, après le déploiement de la rangée à
 * trois fixes : elle affichait « Webview · Déploiement · Agent » au lieu de
 * l'ordre demandé « Webview · Agent · Déploiement ». Cause :
 * `ensureMobileOpenTab('agent')` porte l'Agent en FIN de liste au chargement, et
 * la sélection recopiait l'ordre de la liste.
 */
describe('ordre des onglets fixes', () => {
  const core = ['preview', 'agent', 'deployments'] as const;

  it('rend les fixes dans l’ordre canonique, pas dans celui de la liste ouverte', () => {
    // L'Agent est en fin de liste : c'est l'état réel après ensureMobileOpenTab.
    const open = [
      { id: 'preview', name: 'Webview' },
      { id: 'deployments', name: 'Deployments' },
      { id: 'agent', name: 'AI Agent' },
      { id: 'security', name: 'Security' },
    ];

    expect(selectVisibleMobileBottomTabs(open, 'agent', 4, core).map((tab) => tab.id)).toEqual([
      'preview',
      'agent',
      'deployments',
      'security',
    ]);
  });

  it('garde l’onglet à la demande APRÈS les trois fixes', () => {
    const open = [
      { id: 'deployments', name: 'Deployments' },
      { id: 'agent', name: 'AI Agent' },
      { id: 'preview', name: 'Webview' },
      { id: 'skills', name: 'Skills' },
    ];

    const visible = selectVisibleMobileBottomTabs(open, 'skills', 4, core).map((tab) => tab.id);

    expect(visible.slice(0, 3)).toEqual(['preview', 'agent', 'deployments']);
    expect(visible[3]).toBe('skills');
  });
});
