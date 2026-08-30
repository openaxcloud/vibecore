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
  it('est centrée horizontalement, pas collée à un bord', () => {
    const code = pillCode();

    expect(code).toMatch(/margin-inline:\s*auto/);
    expect(code).not.toMatch(/margin-left:\s*auto/);
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

  it('porte une flèche ET un libellé visible, pas une icône seule', () => {
    expect(BASE_CHAT).toMatch(/i-ph:arrow-down/);
    expect(BASE_CHAT).toMatch(/bolt-agent-scroll-to-bottom__label/);
    expect(BASE_CHAT).toMatch(/chat\.copy\.scrollToLatest/);
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
