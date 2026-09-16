import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * Deux défauts signalés sur l'agent en mobile, et ils sont LIÉS.
 *
 * 1. Le transcript n'arrêtait pas de glisser pendant un stream. `resize="smooth"`
 *    fait lancer à `useStickToBottom` un ressort qui pousse `scrollTop` image par
 *    image vers la fin du contenu. Pendant un stream la cible bouge à chaque
 *    jeton : le ressort la poursuit sans jamais l'atteindre. Sur une fenêtre de
 *    lecture courte — un téléphone — c'est le « ça saute » signalé.
 *
 * 2. Le bouton « aller en bas » n'apparaissait qu'à plus de 240px du bas, soit
 *    plus d'une demi-fenêtre sur un téléphone. Ce seuil avait été ajouté pour
 *    éviter un scintillement… causé précisément par le défilement animé du
 *    point 1 : le ressort accusant du retard, on repassait brièvement « pas en
 *    bas ». Le défilement devenu instantané, la cause disparaît avec lui.
 *
 * `isAtBottom` porte déjà sa propre tolérance (`STICK_TO_BOTTOM_OFFSET_PX`,
 * 70px) : deux ou trois lignes qui s'ajoutent ne le font pas basculer.
 */

const BASE_CHAT = 'app/components/chat/BaseChat.tsx';
const FEUILLE = 'app/styles/index.scss';
const HOOK = 'app/lib/hooks/useStickToBottom.tsx';

describe('stabilité du transcript pendant le stream', () => {
  const baseChat = readFileSync(BASE_CHAT, 'utf8');
  const hook = readFileSync(HOOK, 'utf8');

  it('colle le bas sans animer, pour que le contenu ne glisse pas', () => {
    expect(baseChat).toContain('resize="instant"');
    expect(baseChat).not.toContain('resize="smooth"');
  });

  /*
   * BUG-WEBKIT-SCROLL-FIL-001 — cette garde disait « garde l'animation
   * d'arrivée, qui ne joue qu'une fois ». Le raisonnement tenait sur bureau.
   * Ce que son auteur n'avait pas, c'est la MESURE : le canari WebKit iPhone
   * (2026-09-10) a rendu `dejaEnHaut` neuf fois sur dix, avec UN SEUL élément
   * défilant sous le panneau — donc pas un défaut de sonde — et la seule
   * réussite est l'essai qui a mis 45 s, celui qui a laissé le ressort finir.
   *
   * À la première hauteur de contenu, `useStickToBottom` part de
   * `scrollTop = 0` et ferme ~5 % de la distance par image (raideur 0,05,
   * masse 1,25). Sur un téléphone, l'utilisateur voit le PREMIER message puis
   * regarde 2 500 px d'historique défiler devant lui. C'est la famille du
   * « ça saute » que `resize="instant"` corrige déjà au-dessus, et pour la
   * même raison.
   *
   * La règle est donc à DEUX branches, et la garde les tient toutes les deux :
   * instantané sur téléphone, animé sur bureau. Ramener l'une vers l'autre
   * — dans un sens comme dans l'autre — rougit.
   */
  it('arrive en bas SANS animer sur téléphone, et garde l’animation d’arrivée sur bureau', () => {
    expect(baseChat, 'l’arrivée n’est plus conditionnée à la fenêtre de lecture').toContain(
      "initial={useMobileIde ? 'instant' : 'smooth'}",
    );

    /*
     * Contre-forme : ni un « smooth » inconditionnel (le défaut mesuré), ni un
     * « instant » inconditionnel (le bureau perdrait son animation sans raison).
     */
    expect(baseChat).not.toContain('initial="smooth"');
    expect(baseChat).not.toContain('initial="instant"');
  });

  it('le drapeau qui décide de l’arrivée est bien celui de la fenêtre de lecture', () => {
    /*
     * Règle 14 : la garde ci-dessus lirait « vrai » avec n'importe quel
     * identifiant du même nom. On vérifie que `useMobileIde` est bien dérivé
     * de la disposition — c'est ce qui fait que « téléphone » veut dire
     * téléphone.
     */
    expect(baseChat).toContain('const useMobileIde = layout.isMobile || layout.isTablet;');
  });

  it('« instant » est bien un raccourci sans ressort dans la bibliothèque', () => {
    /*
     * Si un jour la bibliothèque animait aussi ce mode, le correctif serait vide
     * de sens sans que rien ne le signale.
     */
    expect(hook).toMatch(/if\s*\(behavior === 'instant'\)\s*\{\s*state\.scrollTop = state\.calculatedTargetScrollTop/u);
  });
});

describe('bouton « aller au dernier message »', () => {
  const baseChat = readFileSync(BASE_CHAT, 'utf8');
  const styles = readFileSync(FEUILLE, 'utf8');

  it('apparaît dès qu’on n’est plus en bas, sans seuil supplémentaire', () => {
    expect(baseChat).not.toContain('SCROLL_TO_BOTTOM_THRESHOLD');
    expect(baseChat).toMatch(/if \(isAtBottom\) \{\s*return null;/u);
  });

  it('ramène au dernier message au clic', () => {
    expect(baseChat).toMatch(/onClick=\{\(\) => scrollToBottom\(\)\}/u);
  });

  it('est un bouton rond flottant, pas une bannière', () => {
    const debut = styles.indexOf('.bolt-agent-scroll-to-bottom {');

    expect(debut, 'le style du bouton doit exister').toBeGreaterThan(-1);

    const bloc = styles.slice(debut, styles.indexOf('}', debut));

    expect(bloc).toMatch(/position:\s*sticky/u);
    expect(bloc).toMatch(/border-radius:\s*999px/u);
    expect(bloc).toMatch(/margin-left:\s*auto/u);
  });

  it('reste dans le conteneur du transcript', () => {
    /*
     * `sticky` et non `fixed` : en `fixed` il flotterait aussi au-dessus des
     * autres panneaux de l'IDE, y compris quand l'agent n'est pas affiché.
     */
    const debut = styles.indexOf('.bolt-agent-scroll-to-bottom {');
    const bloc = styles.slice(debut, styles.indexOf('}', debut));

    expect(bloc).not.toMatch(/position:\s*fixed/u);
  });
});
