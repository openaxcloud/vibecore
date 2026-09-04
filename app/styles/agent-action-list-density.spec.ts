import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AGENT-MOBILE-04/09 — trois points relevés par Avi sur capture iPhone.
 *
 *   1. la liste d'actions d'un artefact (« Créer package.json … Terminé ») :
 *      trop d'espace entre les lignes, pastille plus grosse que le contenu ;
 *   2. la pastille « descendre » flottait au milieu du fil au lieu de se poser
 *      juste au-dessus de la zone de saisie ;
 *   3. toute la zone de saisie était plus grosse que les messages de l'agent.
 *
 * Mesuré AVANT (Chromium, 390×844, commit bf4f6a6, arbre propre) : pas de
 * ligne 47,25 px ; pastille 14 px contre 11 px pour le chemin ; pastille
 * « descendre » à 63 px au-dessus du composeur ; libellés du composeur à 17 px
 * contre 14 px pour les messages.
 *
 * ANCRES SUR DU CODE, JAMAIS SUR DE LA PROSE : la feuille et le composant sont
 * lus commentaires retirés, parce que la prose qui explique le défaut cite les
 * valeurs qu'elle interdit. Le comportement à l'écran est mesuré par
 * `tests/e2e/agent-action-list-density.spec.ts` ; ce fichier fige la RÈGLE.
 */

const ROOT = join(__dirname, '..', '..');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const INDEX = sansCommentaires(readFileSync(join(__dirname, 'index.scss'), 'utf8'));
const ARTIFACT = sansCommentaires(readFileSync(join(ROOT, 'app/components/chat/Artifact.tsx'), 'utf8'));

/** Une règle CSS, repérée par son SÉLECTEUR exact et fermée sur son accolade. */
function regle(selecteur: string): string {
  const debut = INDEX.indexOf(`${selecteur} {`);
  expect(debut, `règle ${selecteur} introuvable`).toBeGreaterThan(-1);

  return INDEX.slice(debut, INDEX.indexOf('}', debut) + 1);
}

/** Le composant `ActionList`, seul — pas l'en-tête de l'artefact. */
function actionList(): string {
  const debut = ARTIFACT.indexOf('const ActionList = memo(');
  expect(debut).toBeGreaterThan(-1);

  const fin = ARTIFACT.indexOf('function getIconColor(', debut);
  expect(fin).toBeGreaterThan(debut);

  return ARTIFACT.slice(debut, fin);
}

describe('1. liste d’actions — lignes serrées, cible tactile conservée', () => {
  it('ne porte plus de plancher de 44px DANS le flux (rem = 14px en mobile → 38,5px par ligne)', () => {
    // Le repli `<details>` d'une commande shell est SOUS la ligne : hors sujet ici.
    const liste = actionList().replace(/<details[\s\S]*?<\/details>/g, '');

    expect(liste).not.toMatch(/min-h-11/);
    expect(liste).not.toMatch(/space-y-/);
    expect(liste).toContain('bolt-action-list');
  });

  it('espace les lignes en PIXELS, sous les 8,75px qu’imposait la base rem', () => {
    const liste = regle('.bolt-action-list');
    const gap = Number(liste.match(/gap:\s*(\d+)px/)?.[1]);

    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(8);
  });

  it('garde une boîte cliquable de 44px, sortie du flux par des marges négatives symétriques', () => {
    const cible = regle('.bolt-action-target');
    const plancher = cible.match(/min-height:\s*([^;]+);/)?.[1] ?? '';
    const marge = Number(cible.match(/margin-block:\s*-(\d+)px/)?.[1]);
    const gap = Number(regle('.bolt-action-list').match(/gap:\s*(\d+)px/)?.[1]);

    expect(plancher).toMatch(/44px/);
    expect(plancher).not.toMatch(/rem/);

    // La boîte ne doit déborder que dans l'interligne, jamais sur la ligne voisine.
    expect(marge).toBeGreaterThan(0);
    expect(marge).toBeLessThanOrEqual(gap);

    // Les deux cibles de la liste (ouvrir le fichier, démarrer l'application) la portent.
    const liste = actionList();
    expect(liste.match(/bolt-action-target/g)?.length).toBe(2);
  });

  it('peint le fond du chemin sur le `code`, pas sur la boîte de 44px', () => {
    const liste = actionList();
    const bouton = liste.match(/<button[^>]*bolt-action-target[^>]*>/)?.[0] ?? '';

    expect(bouton).not.toMatch(/bg-bolt-elements-artifacts-inlineCode-background/);
    expect(liste).toMatch(
      /<code className="bolt-action-file-path[^"]*bg-bolt-elements-artifacts-inlineCode-background/,
    );
  });
});

describe('1 bis. pastille de statut — la taille du contenu à sa gauche', () => {
  it('suit le JETON DU CODE, le même que le chemin de fichier', () => {
    const pastille = regle('.bolt-project-agent-panel .bolt-action-row .bolt-action-status');

    // `!important` obligatoire : la règle d'échelle du panneau force 14px sur tout `span`.
    expect(pastille).toMatch(/font-size:\s*var\(--vc-type-code-size\)\s*!important/);

    // Contre-épreuve de couplage : le `code` du panneau est bien sur ce jeton-là.
    const code = INDEX.match(
      /\.bolt-project-agent-panel\s*:where\(code[^{]*\{[^}]*font-size:\s*var\(--vc-type-code-size\)\s*!important/,
    );
    expect(code, 'le chemin de fichier ne suit plus --vc-type-code-size').not.toBeNull();
  });

  it('les deux pastilles (statut, durée) portent la classe', () => {
    expect(actionList()).toContain("'bolt-action-status shrink-0 rounded-full");
    expect(ARTIFACT).toMatch(/className="bolt-action-status ml-1 inline-flex/);
  });
});

describe('2. pastille « descendre » — juste au-dessus de la zone de saisie', () => {
  it('en mobile, se décale de ce que le composeur RECOUVRE le fil, pas de sa hauteur', () => {
    const composeur = regle(".bolt-responsive-ide-mobile[data-mobile-panel='chat'] .bolt-project-agent-composer");
    const remontee = (composeur.match(/bottom:\s*calc\((.+?)\)\s*!important;/)?.[1] ?? '').trim();

    expect(remontee).toMatch(/var\(--mobile-nav-height\)\s*\+\s*10px/);

    const pastille = regle(
      ".bolt-responsive-ide-mobile[data-mobile-panel='chat'] .bolt-agent-scroll-to-bottom,\n  .bolt-responsive-ide-mobile[data-mobile-panel='chat']\n    .bolt-agent-scroll-to-bottom[data-vc-tooltip]:not([data-vc-radix-tooltip='true'])",
    );

    const bas = (pastille.match(/bottom:\s*calc\((.+?)\);/)?.[1] ?? '').trim();

    // Le même terme que la remontée du composeur, plus la marge de 12px.
    expect(bas).toContain(remontee);
    expect(bas).toMatch(/\+\s*12px/);
    expect(bas).not.toMatch(/measured-height/);
  });
});

describe('3. zone de saisie — la taille des messages de l’agent', () => {
  it('sous 1024px, le libellé du composeur EST le jeton des messages', () => {
    const mobile = INDEX.match(/@media \(max-width: 1024px\) \{\s*:root \{[^}]*\}/)?.[0] ?? '';

    expect(mobile).toMatch(/--vc-composer-text:\s*var\(--vc-type-interface-size\)/);
    expect(mobile).not.toMatch(/--vc-composer-text:\s*17px/);
  });

  it('garde le plancher iOS de 16px sur le champ et descend seulement son invite', () => {
    expect(regle(".bolt-project-chatbox textarea:not([class*='i-'])")).toMatch(/font-size:\s*16px\s*!important/);
    expect(regle(".bolt-project-chatbox textarea:not([class*='i-'])::placeholder")).toMatch(
      /font-size:\s*var\(--vc-composer-text\)/,
    );
  });
});
