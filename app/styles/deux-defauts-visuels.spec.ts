import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Les deux défauts qu'Avi a signalés avec captures, mesurés le 2026-09-28 à
 * 390 px pendant une vraie génération sur la prod servie en `d4a6f1df28`.
 *
 * 1. LE BANDEAU RECOUVRAIT L'EN-TÊTE. « 1 fichier appliqué » s'ouvrait à y=60.
 *    La sonde n'a pas deviné ce qu'il masquait : elle a demandé au navigateur ce
 *    qui se trouvait sous son rectangle (`elementsFromPoint` sur neuf points), et
 *    il a nommé `button.bolt-preview-url-text` (y=60..88) et
 *    `button.bolt-preview-open-external` (y=52..96). Cause : la règle calibrée
 *    sur la barre supérieure du projet, qui sur téléphone est COLLAPSÉE —
 *    hauteur mesurée 0 — le chrome du panneau occupant la bande 0..96.
 *
 * 2. LA CARTE DE PRÉPARATION ÉTAIT TRONQUÉE EN HAUT. `.bolt-preview-splash`
 *    mesurait 652 px de haut pour 715 px de contenu, en `overflow: hidden`, et
 *    son parent centre verticalement : les 63 px perdus se répartissaient de
 *    part et d'autre, la coque s'étendant de y=56 à y=818 dans une fenêtre qui
 *    s'arrête à 764. Rien ne permettait d'atteindre les 55 px du haut — le
 *    `overflow-y: auto` du parent était inerte, son `scrollHeight` valant
 *    exactement son `clientHeight`.
 *
 * ⚠️ Ce fichier lit `app/styles/index.scss`, PAS une copie. Deux gardes de ce
 * dépôt ont déjà été vertes en épinglant leur propre exemplaire.
 */

const CHEMIN = join(__dirname, 'index.scss');
const BRUT = readFileSync(CHEMIN, 'utf8');
const INDEX = BRUT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function blocApres(selecteur: string, depuis: number): { bloc: string; index: number } {
  const debut = INDEX.indexOf(`${selecteur} {`, depuis);
  expect(debut, `règle ${selecteur} introuvable après l'offset ${depuis}`).toBeGreaterThan(-1);

  return { bloc: INDEX.slice(debut, INDEX.indexOf('}', debut) + 1), index: debut };
}

describe('la sonde lit bien la vraie feuille', () => {
  it('le fichier est là et il est gros — sinon les cas ci-dessous ne mesurent rien', () => {
    expect(BRUT.length, `${CHEMIN} vide ou tronqué`).toBeGreaterThan(100_000);

    /* Témoin positif : un sélecteur dont on SAIT qu'il existe. */
    expect(INDEX).toContain('.bolt-preview-splash-shell {');
    expect(INDEX).toContain('.Toastify__toast-container {');
  });
});

describe('1. le bandeau ne recouvre plus l’en-tête du panneau', () => {
  /*
   * La règle qui gagnait est `body:has(.bolt-project-statusbar)` : sa
   * spécificité (0,2,1) battait les deux overrides mobiles en (0,2,0). Le
   * correctif doit donc vivre dans la MÊME famille, plus loin dans le fichier.
   */
  const SELECTEUR = 'body:has(.bolt-project-statusbar) .Toastify__toast-container';

  it('le piège est toujours armé : la règle de base pose encore 60 px', () => {
    /*
     * Moitié « ce que le correctif protège » de la contre-épreuve. Si un jour la
     * barre supérieure n'est plus collapsée sur téléphone, cette assertion
     * rougira et convoquera une nouvelle mesure au lieu de laisser un override
     * devenu inutile.
     */
    const { bloc } = blocApres(SELECTEUR, 0);
    expect(bloc).toMatch(/top:\s*calc\(60px \+ env\(safe-area-inset-top/);
  });

  it('un override mobile passe la pile SOUS le chrome du panneau', () => {
    const premier = blocApres(SELECTEUR, 0);
    const override = blocApres(SELECTEUR, premier.index + 1);

    expect(override.index, "l'override doit venir APRÈS la règle de base").toBeGreaterThan(premier.index);

    /*
     * On n'épingle pas un nombre en dur : on exige que le calcul PARTE de la
     * hauteur déclarée de la barre supérieure et y AJOUTE de quoi dégager les
     * 44 px du chrome du panneau. Un `top: 104px` écrit à la main passerait le
     * pixel et perdrait le lien avec la variable.
     */
    expect(override.bloc).toMatch(/top:\s*calc\(var\(--vc-ide-topbar-height/);
    expect(override.bloc).toMatch(/\+\s*44px/);
    expect(override.bloc).toMatch(/env\(safe-area-inset-top/);
  });

  it('cet override est bien borné au téléphone', () => {
    const premier = blocApres(SELECTEUR, 0);
    const override = blocApres(SELECTEUR, premier.index + 1);

    /* La requête de média la plus proche AU-DESSUS de l'override. */
    const avant = INDEX.slice(0, override.index);
    const media = avant.lastIndexOf('@media');
    expect(media, 'override hors de toute requête de média').toBeGreaterThan(-1);
    expect(INDEX.slice(media, media + 120)).toMatch(/max-width:\s*767px/);
  });

  it('il ne descend pas la pile sur le composeur ni sur la barre de navigation', () => {
    const premier = blocApres(SELECTEUR, 0);
    const override = blocApres(SELECTEUR, premier.index + 1);

    /*
     * Le bas est interdit : le champ de saisie de l'agent y vit. Masquer ce
     * champ serait un défaut PIRE que celui qu'on corrige, et c'est l'erreur
     * naturelle quand on « déplace un bandeau qui gêne ».
     */
    expect(override.bloc).not.toMatch(/bottom:\s*(?!auto)/);
    expect(override.bloc, 'la hauteur doit réserver la barre de navigation mesurée à 72 px').toMatch(/max-height/);
  });
});

describe('2. la carte de préparation n’est plus tronquée en haut', () => {
  it('la coque borne sa hauteur et rend l’excédent défilable', () => {
    const { bloc } = blocApres('.bolt-preview-splash-shell', 0);

    expect(bloc).toMatch(/max-height:\s*100%/);
    expect(bloc).toMatch(/overflow-y:\s*auto/);
    expect(bloc).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('elle ne coupe plus l’axe Y — c’était ÇA le défaut, pas le débordement', () => {
    const { bloc } = blocApres('.bolt-preview-splash-shell', 0);

    /*
     * `overflow: hidden` masquait les deux axes. Il ne doit plus y avoir de
     * raccourci `overflow` dans ce bloc : seul l'axe X se masque encore, pour
     * les coins arrondis.
     */
    expect(bloc).not.toMatch(/^\s*overflow:\s/mu);
    expect(bloc).toMatch(/overflow-x:\s*hidden/);
  });

  it('le piège est toujours armé : le parent centre encore verticalement', () => {
    /*
     * Seconde moitié de la contre-épreuve. C'est le centrage qui transformait un
     * débordement en TRONCATURE PAR LE HAUT ; sans lui, le correctif n'aurait
     * plus d'objet. Le jour où quelqu'un le retire, ce cas rougit et force à
     * relire les deux moitiés ensemble.
     */
    const { bloc } = blocApres('.bolt-preview-splash,\n.bolt-preview-empty-state', 0);
    expect(bloc).toMatch(/align-items:\s*center/);
    expect(bloc).toMatch(/height:\s*100%/);
  });

  it('le même mécanisme reste corrigé chez le voisin — BUG-PREVIEW-CUTOFF-001', () => {
    /*
     * Règle 7 : viser le mécanisme, pas la première occurrence.
     * `.bolt-preview-loading-card` portait déjà ce remède ; la coque du splash
     * était la troisième occurrence et personne ne l'avait reportée. Ce cas
     * empêche les deux de rediverger dans un sens ou dans l'autre.
     */
    const { bloc } = blocApres('.bolt-preview-loading-card', 0);
    expect(bloc).toMatch(/max-height:\s*100%/);
    expect(bloc).toMatch(/overflow-y:\s*auto/);
  });
});
