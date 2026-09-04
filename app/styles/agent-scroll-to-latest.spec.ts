import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AGENT-SCROLL-001 — la pastille « Aller au plus récent ».
 *
 * Demande d'Avi, capture Replit à l'appui. L'existant était une icône SEULE de
 * 40x40 collée à droite. Trois écarts : pas de libellé, alignée à droite au lieu
 * d'être centrée, et 40px de haut — sous le plancher tactile.
 *
 * Le fichier est lu COMMENTAIRES RETIRÉS : la prose qui explique le défaut cite
 * `margin-left: auto` et `40px`, et un test qui lit ses propres commentaires ne
 * prouve rien.
 */

const INDEX = readFileSync(join(__dirname, 'index.scss'), 'utf8');
const CHAT_FR = readFileSync(join(__dirname, '..', 'lib/i18n/catalogs/chat.ts'), 'utf8');
const BASE_CHAT = readFileSync(join(__dirname, '..', 'components/chat/BaseChat.tsx'), 'utf8');

/** La règle de la pastille, sans ses commentaires. */
function pillCode(): string {
  const start = INDEX.indexOf('.bolt-agent-scroll-to-bottom {');
  expect(start, 'la règle de la pastille est introuvable').toBeGreaterThan(-1);

  const end = INDEX.indexOf('.bolt-project-agent-panel textarea', start);
  expect(end).toBeGreaterThan(start);

  return INDEX.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('AGENT-SCROLL-001 — la pastille suit la référence d’Avi', () => {
  it('est hors de la colonne de lecture, sans être collée au bord', () => {
    /*
     * CE TEST A CHANGÉ DE SENS, et il faut le dire.
     *
     * Il exigeait « centrée horizontalement, pas collée à un bord ». Mesuré en
     * production sur un fil réel (BUG-UX-021) : centrée, la pastille était
     * posée à 100 % sur du texte — elle mangeait « comme le nom du projet » en
     * plein mot. Rétrécir n'y changeait rien : c'est sa POSITION qui était
     * fautive.
     *
     * Ce qui est conservé de l'exigence d'origine : elle ne doit pas être
     * collée au bord. Ce qui change : elle n'est plus au milieu du texte, et
     * une gouttière est réservée pendant qu'elle est visible — c'est cette
     * réserve, pas la marge, qui garantit qu'aucune ligne ne passe dessous.
     */
    const code = pillCode();

    expect(code, 'la pastille est de nouveau centrée sur la colonne de texte').not.toMatch(/margin-inline:\s*auto/);
    expect(code, 'elle doit être poussée hors de la colonne').toMatch(/margin-inline-start:\s*auto/);

    const marge = /margin-inline-end:\s*(\d+)px/.exec(code);

    expect(marge, 'aucune marge déclarée : elle serait collée au bord').toBeTruthy();
    expect(Number(marge![1]), 'trop près du bord pour ne pas paraître accidentelle').toBeGreaterThanOrEqual(8);

    expect(INDEX, 'aucune gouttière réservée : le texte passerait sous la pastille').toMatch(
      /:has\(\.bolt-agent-scroll-to-bottom\)[\s\S]{0,160}padding-inline-end/,
    );
  });

  it('respecte le plancher tactile, exprimé en PIXELS', () => {
    const code = pillCode();
    const floor = code.match(/min-height:\s*([^;]+);/)?.[1] ?? '';

    expect(floor).toMatch(/44px/);
    expect(floor).not.toMatch(/rem/);

    // L'ancienne hauteur fixe de 40px ne doit plus contraindre la pastille.
    expect(code).not.toMatch(/\n\s*height:\s*40px/);
  });

  it('flotte au-dessus du fil sans le pousser', () => {
    expect(pillCode()).toMatch(/position:\s*sticky/);
  });

  it('est translucide et floutée, pour rester lisible sur le texte qui défile', () => {
    const code = pillCode();

    expect(code).toMatch(/background:\s*color-mix\([^;]*transparent\)/);
    expect(code).toMatch(/backdrop-filter:\s*blur/);
  });

  it('reste discrète : corps réduit, aucun aplat de couleur vive', () => {
    const code = pillCode();
    const size = code.match(/font-size:\s*(\d+)px/)?.[1];

    expect(Number(size)).toBeLessThanOrEqual(13);

    /*
     * Aucune couleur d'accent en fond : la pastille ne doit pas concurrencer le
     * bouton d'envoi.
     */
    expect(code).not.toMatch(/background:[^;]*(--vc-action-primary|--ecode-accent|--vc-ide-accent-action)/);
  });

  it('garde son libellé pour l’assistance, même s’il n’est plus affiché', () => {
    /*
     * CE TEST A CHANGÉ DE SENS, et il faut le dire.
     *
     * Il s'appelait « porte une flèche ET un libellé VISIBLE, pas une icône
     * seule ». Avi a tranché l'inverse : la pastille large masquait le fil, il
     * l'a entourée en rouge deux fois. Elle devient un disque de 44px et le
     * libellé passe hors écran.
     *
     * C'est un ARBITRAGE, pas un progrès net. Ce qui est conservé, et ce que ce
     * test garde désormais : le libellé existe toujours dans le DOM, il reste
     * traduit, et il donne son nom accessible au bouton. Le masquage est
     * visuel, pas sémantique.
     */
    expect(BASE_CHAT).toMatch(/i-ph:arrow-down/);
    expect(BASE_CHAT).toMatch(/bolt-agent-scroll-to-bottom__label/);
    expect(BASE_CHAT).toMatch(/chat\.copy\.scrollToLatest/);

    const regle = INDEX.slice(INDEX.indexOf('.bolt-agent-scroll-to-bottom__label'));

    expect(regle.slice(0, 400), 'le masquage doit être visuel, jamais display:none').toMatch(/clip-path|clip:/);
    expect(regle.slice(0, 400)).not.toMatch(/display:\s*none/);
  });

  it('traduit ce libellé en français ET en anglais', () => {
    expect(CHAT_FR).toMatch(/'chat\.copy\.scrollToLatest':\s*'Scroll to latest'/);
    expect(CHAT_FR).toMatch(/'chat\.copy\.scrollToLatest':\s*'Aller au plus récent'/);
  });

  it('ne se rend pas quand on est déjà en bas', () => {
    /*
     * Le comportement d'apparition était déjà juste ; ce cas le fige pour qu'une
     * refonte de l'apparence ne l'emporte pas au passage.
     */
    const fn = BASE_CHAT.slice(BASE_CHAT.indexOf('function ScrollToBottom()'));

    expect(fn.slice(0, 1600)).toMatch(/if \(isAtBottom\) \{\s*return null;/);
  });
});
