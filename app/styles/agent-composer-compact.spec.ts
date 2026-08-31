import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * COMPOSER-001 — la zone de saisie de l'agent tient en deux lignes au repos.
 *
 * Elle empilait TROIS blocs : une rangée de sélecteurs au-dessus du champ, le
 * champ, puis une barre de commandes qui repassait à la ligne « à toute
 * largeur ». Elle réservait `clamp(236px, 36dvh, 360px)` — plus du tiers d'un
 * écran d'iPhone.
 *
 * Modèle demandé par Avi : un seul bloc, le champ sur une ligne, puis UNE rangée
 * de commandes — sélecteurs à gauche séparés par de fins traits, actions à
 * droite.
 *
 * ANCRES SUR DU CODE, JAMAIS SUR DE LA PROSE, et lecture commentaires retirés :
 * ce fichier explique le défaut en citant les valeurs qu'il interdit.
 */

const ROOT = join(__dirname, '..', '..');
const INDEX = readFileSync(join(__dirname, 'index.scss'), 'utf8');
const CODE = INDEX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CHATBOX = readFileSync(join(ROOT, 'app/components/chat/ChatBox.tsx'), 'utf8');

/** Une règle CSS, repérée par son SÉLECTEUR et fermée sur son accolade. */
function rule(selector: string): string {
  const start = CODE.indexOf(`${selector} {`);
  expect(start, `règle ${selector} introuvable`).toBeGreaterThan(-1);

  return CODE.slice(start, CODE.indexOf('}', start) + 1);
}

describe('COMPOSER-001 — deux lignes au repos, pas trois blocs', () => {
  it('ne laisse plus la rangée de commandes repasser à la ligne', () => {
    const primary = rule('.bolt-chatbox-toolbar-primary');

    expect(primary).toMatch(/flex-wrap:\s*nowrap/);
  });

  it('fait DÉFILER plutôt que d’empiler quand le panneau est étroit', () => {
    /*
     * Repasser à la ligne ferait grandir la hauteur au repos — exactement ce
     * qu'on corrige. Le défilement la garde constante.
     */
    expect(rule('.bolt-chatbox-toolbar-primary')).toMatch(/overflow-x:\s*auto/);
  });

  it('sépare les sélecteurs par de fins traits, pas par des aplats', () => {
    const separators = rule('.bolt-chatbox-selectors > * + *');

    expect(separators).toMatch(/border-left:\s*1px solid/);
    expect(separators).not.toMatch(/background/);
  });

  it('réserve deux lignes et non un tiers d’écran', () => {
    const reserved = CODE.match(/--vc-agent-composer-reserved-space:[^;]+;/)?.[0] ?? '';
    const floor = Number(reserved.match(/clamp\((\d+)px/)?.[1]);

    expect(floor).toBeGreaterThan(0);

    /*
     * Le repli sert AUSSI de rembourrage au bas du fil : trop court, la queue du
     * transcript glisse sous la zone de saisie. `ui-details` l'a attrapé deux
     * fois — à 132px, puis à 168px. La borne basse n'est donc PAS un chiffre
     * choisi : c'est la hauteur du chrome permanent, mesurée dans le montage
     * E2E — barre de navigation basse 72px + boîte de saisie 112px = 184px.
     * En dessous, faire défiler jusqu'au dernier message le cache.
     *
     * La borne haute reste la réduction visée : 236px était l'ancien plancher.
     */
    expect(floor).toBeGreaterThanOrEqual(184);
    expect(floor).toBeLessThan(236);

    // La hauteur MESURÉE reste prioritaire : le repli ne sert qu'au premier rendu.
    expect(reserved).toMatch(/--vc-agent-composer-measured-height/);
  });

  it('garde le plancher tactile, exprimé en PIXELS', () => {
    const floor = rule('.bolt-chatbox-selectors button,\n.bolt-chatbox-toolbar-primary > .bolt-chatbox-toolbar-button');

    expect(floor).toMatch(/var\(--vc-touch-min,\s*44px\)/);
    expect(floor).not.toMatch(/rem/);
  });

  it('n’a plus qu’UN endroit qui rend les sélecteurs', () => {
    /*
     * Le bloc d'origine vivait au-dessus du champ, avec sa propre bordure. Le
     * laisser en plus du nouveau rendrait les commandes en double.
     */
    /*
     * `<AgentPowerControls` seul compterait aussi les annotations de type
     * `useState<AgentPowerControlsValue>` : quatre faux positifs. On exige donc
     * ce qui suit une BALISE — un saut de ligne ou une espace.
     */
    const occurrences = (CHATBOX.match(/<AgentPowerControls[\s\n]/g) ?? []).length;

    expect(occurrences).toBe(1);
  });

  it('rend les sélecteurs DANS la rangée de commandes', () => {
    const toolbar = CHATBOX.slice(CHATBOX.indexOf('bolt-chatbox-toolbar-primary'));

    expect(toolbar.slice(0, 2000)).toMatch(/bolt-chatbox-selectors/);
    expect(toolbar.slice(0, 2000)).toMatch(/<AgentPowerControls/);
  });

  it('n’introduit aucune couleur nouvelle sur les sélecteurs', () => {
    const group = rule('.bolt-chatbox-selectors');

    expect(group).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
