import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MOBILE_WORKBENCH_PANELS,
  isMobileWorkbenchPanel,
  resolveMobileWorkbenchPanel,
  shouldMountMobileWorkbench,
} from './mobile-workbench-keepalive';

/*
 * BUG-IDE-PANEL-REPROVISION-RELOAD-001 — « ouvrir certains panneaux recharge
 * tout l'IDE » (mobile/tablette).
 *
 * Contrat de non-régression :
 *  1. changer de panneau mobile ne doit JAMAIS démonter le Workbench une fois
 *     qu'il a été ouvert (sinon : Suspense plein écran, terminal/éditeur
 *     réinitialisés, et la Preview remontée relance sa boucle de démarrage —
 *     re-provisionnement du pod froid avec overlay « Webview startup » sur
 *     toute la zone de contenu) ;
 *  2. le masquage se fait par CSS (visibility) scoping le keep-alive, pas par
 *     démontage ;
 *  3. l'overlay de démarrage de la Preview reste scoping au panneau webview
 *     (position absolute dans un parent positionné), jamais plein-page.
 */

const BASECHAT = 'app/components/chat/BaseChat.tsx';
const FEUILLE = 'app/styles/index.scss';

describe('keep-alive du Workbench mobile — logique', () => {
  it('reconnaît exactement les panneaux rendus par le Workbench', () => {
    expect([...MOBILE_WORKBENCH_PANELS]).toEqual(['files', 'editor', 'search', 'terminal', 'preview']);

    for (const panel of MOBILE_WORKBENCH_PANELS) {
      expect(isMobileWorkbenchPanel(panel)).toBe(true);
    }

    expect(isMobileWorkbenchPanel('chat')).toBe(false);
    expect(isMobileWorkbenchPanel('deploy')).toBe(false);
    expect(isMobileWorkbenchPanel('locks')).toBe(false);
  });

  it('desktop : le Workbench est monté comme avant, sans condition', () => {
    expect(shouldMountMobileWorkbench({ useMobileIde: false, mobilePanel: 'chat', workbenchKeepAlive: false })).toBe(
      true,
    );
  });

  it('mobile : pas de montage anticipé avant le premier panneau workbench', () => {
    // Le chargement initial (Agent actif) reste aussi léger qu'avant le correctif.
    expect(shouldMountMobileWorkbench({ useMobileIde: true, mobilePanel: 'chat', workbenchKeepAlive: false })).toBe(
      false,
    );
    expect(shouldMountMobileWorkbench({ useMobileIde: true, mobilePanel: 'deploy', workbenchKeepAlive: false })).toBe(
      false,
    );
  });

  it('mobile : ouvrir un panneau workbench le monte, y revenir ne le remonte pas', () => {
    // Ouverture: monté.
    for (const panel of MOBILE_WORKBENCH_PANELS) {
      expect(shouldMountMobileWorkbench({ useMobileIde: true, mobilePanel: panel, workbenchKeepAlive: false })).toBe(
        true,
      );
    }

    /*
     * LE cœur du bug : une fois ouvert (keep-alive), retourner sur Agent ou sur
     * un panneau de gestion (Database, Logs, Déploiements…) NE démonte PAS le
     * Workbench — il est seulement masqué. Avant, ce démontage/remontage était
     * vécu comme « ouvrir un panneau recharge tout l'IDE ».
     */
    for (const panel of ['chat', 'deploy', 'locks']) {
      expect(shouldMountMobileWorkbench({ useMobileIde: true, mobilePanel: panel, workbenchKeepAlive: true })).toBe(
        true,
      );
    }
  });

  it('masqué, le Workbench reste sur son dernier panneau (aucune transition cachée)', () => {
    expect(resolveMobileWorkbenchPanel({ mobilePanel: 'preview', lastWorkbenchPanel: undefined })).toBe('preview');
    expect(resolveMobileWorkbenchPanel({ mobilePanel: 'chat', lastWorkbenchPanel: 'preview' })).toBe('preview');
    expect(resolveMobileWorkbenchPanel({ mobilePanel: 'deploy', lastWorkbenchPanel: 'terminal' })).toBe('terminal');

    // Jamais ouvert : le repli historique reste l'éditeur.
    expect(resolveMobileWorkbenchPanel({ mobilePanel: 'chat', lastWorkbenchPanel: undefined })).toBe('editor');
  });
});

describe('keep-alive du Workbench mobile — câblage réel', () => {
  const baseChat = readFileSync(BASECHAT, 'utf8');
  const styles = readFileSync(FEUILLE, 'utf8');

  it('BaseChat monte le Workbench via shouldMountMobileWorkbench (pas de ternaire qui démonte)', () => {
    expect(baseChat).toContain('shouldMountMobileWorkbench({');
    expect(baseChat).toContain("from '~/components/chat/mobile-workbench-keepalive'");

    /*
     * La régression d'origine : `mobilePanel === 'chat' ? null : (<ClientOnly>…
     * LazyWorkbench` — le null démontait le Workbench à chaque retour sur
     * Agent. Ce motif ne doit pas réapparaître.
     */
    expect(baseChat).not.toMatch(/mobilePanel === 'chat' \? null :/u);
  });

  it('le Workbench masqué l’est par CSS (visibility), pas par démontage', () => {
    expect(baseChat).toContain('className="bolt-workbench-mobile-keepalive"');
    expect(baseChat).toMatch(/data-active=\{!useMobileIde \|\| mobileWorkbenchPanelActive \? 'true' : 'false'\}/u);

    // Le conteneur ne crée pas de boîte (layout inchangé) et se masque par visibility.
    expect(styles).toMatch(/\.bolt-workbench-mobile-keepalive\s*\{\s*display:\s*contents;\s*\}/u);
    expect(styles).toMatch(
      /\.bolt-workbench-mobile-keepalive\[data-active='false'\]\s*\{\s*visibility:\s*hidden;\s*pointer-events:\s*none;\s*\}/u,
    );
  });

  it("l'overlay de démarrage de la Preview reste scoping au panneau (jamais fixed plein écran)", () => {
    /*
     * `.bolt-preview-loading-overlay` (« Webview startup ») doit rester en
     * `position: absolute` dans un ancêtre positionné du panneau webview
     * (`.bolt-project-webview-viewport` porte `position: relative`). En
     * `position: fixed`, il recouvrirait la coque entière de l'IDE pendant le
     * re-provisionnement d'un pod froid.
     */
    const debut = styles.indexOf('.bolt-preview-loading-overlay {');

    expect(debut).toBeGreaterThan(-1);

    const bloc = styles.slice(debut, styles.indexOf('}', debut));

    expect(bloc).toMatch(/position:\s*absolute/u);
    expect(bloc).not.toMatch(/position:\s*fixed/u);
  });
});
