/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

/*
 * Constaté en réel : « I will add a `users` table » s'affichait
 * « I will add auserstable ».
 *
 * Markdown supprime les espaces de BORD d'un document. C'est correct pour un
 * document entier, destructeur pour un FRAGMENT : rendu en trois segments — le
 * texte, le code inline, la suite — chacun perd ses espaces de bord et la
 * concaténation colle les mots. Le même effet apparaît pendant le streaming,
 * où un morceau qui s'arrête juste après un code inline perd son espace final
 * jusqu'à l'arrivée du suivant.
 *
 * Le composant restitue donc ce que le rendu retire. Ces tests couvrent les
 * deux formes du symptôme, et vérifient qu'un message complet reste intact.
 */

afterEach(cleanup);

function textOf(markdown: string): string {
  const { container } = render(<Markdown>{markdown}</Markdown>);

  return container.textContent ?? '';
}

describe('espaces autour du code inline', () => {
  it('le cas exact remonté, en un seul bloc', () => {
    expect(textOf('I will add a `users` table to the schema.')).toBe('I will add a users table to the schema.');
  });

  it('rendu en segments : la concaténation reste lisible', () => {
    const segments = ['I will add a ', '`users`', ' table to the schema.'];
    const seen = segments.map(textOf).join('');

    // Avant le correctif : « I will add auserstable to the schema. »
    expect(seen).toBe('I will add a users table to the schema.');
  });

  it('pendant le streaming, l’espace final ne disparaît pas', () => {
    const full = 'I will add a `users` table to the schema.';

    // Le préfixe qui s'arrête juste APRÈS l'espace suivant le code inline.
    expect(textOf(full.slice(0, 21))).toBe('I will add a users ');
  });

  it('un espace de tête est conservé lui aussi', () => {
    expect(textOf(' table to the schema.')).toBe(' table to the schema.');
  });

  it('un contenu sans espace de bord n’est pas modifié', () => {
    expect(textOf('Just a sentence.')).toBe('Just a sentence.');
    expect(textOf('`code`')).toBe('code');
  });

  it('un contenu entièrement blanc ne fabrique pas de doublon', () => {
    expect(textOf('   ')).toBe('   ');
  });
});
