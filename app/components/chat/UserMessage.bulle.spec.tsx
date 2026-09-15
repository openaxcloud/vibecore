/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserMessage } from './UserMessage';

/*
 * BUG-USER-BUBBLE-HEIGHT-001 / RP-BUBBLE-01 — « on perd de l'espace pour rien
 * en haut » (Avi, 08/09, point 6).
 *
 * MESURÉ AVANT D'ÉCRIRE, à 390 px sur Chromium : la bulle faisait 42,9 px pour
 * 19,9 px de texte. Le compte tombe juste et désigne le coupable :
 *
 *   19,9 (texte) + 7 + 7 (rembourrage) + 2 (bordure) = 35,9
 *   42,9 − 35,9 = 7,0 px
 *
 * Ces 7 px étaient la marge basse d'un conteneur d'images rendu SANS
 * CONDITION : hauteur 0, zéro enfant, et pourtant `mb-2` s'applique. De
 * l'espace réservé à des images qui n'existent pas, au-dessus du texte —
 * exactement ce qu'Avi voyait. Après correctif, mesuré : 35,9 px.
 *
 * Ce test tient la CAUSE, pas le nombre : un test sur « 35,9 px » dépendrait
 * de la police du moteur et rougirait pour rien. Ce qui doit rester vrai,
 * c'est qu'aucun conteneur d'images n'est rendu quand il n'y a pas d'image —
 * et qu'il l'est dès qu'il y en a une.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'fr', resolvedLanguage: 'fr' } }),
}));

vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="texte">{children}</div>,
}));

vi.mock('@nanostores/react', () => ({ useStore: () => undefined }));

afterEach(cleanup);

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('bulle du message utilisateur — l’espace au-dessus du texte', () => {
  it('ne réserve AUCUNE place aux images quand le message n’en porte pas', () => {
    const { container } = render(<UserMessage content="Ajoute une page de contact." parts={undefined} />);

    expect(screen.getByTestId('texte').textContent).toBe('Ajoute une page de contact.');
    expect(
      container.querySelector('.bolt-user-message-images'),
      'un conteneur d’images vide rend 7 px de vide au-dessus du texte',
    ).toBeNull();

    const bulle = container.querySelector('.bolt-user-message-bubble');

    expect(bulle, 'la bulle doit exister').not.toBeNull();
    expect(
      bulle!.children.length,
      'la bulle ne doit porter que le texte : tout enfant en plus est de l’espace perdu',
    ).toBe(1);
  });

  it('et le rend dès qu’une image est jointe', () => {
    const { container } = render(
      <UserMessage
        content="Voici la maquette."
        parts={[{ type: 'file', mimeType: 'image/png', data: PIXEL } as never]}
      />,
    );

    expect(container.querySelector('.bolt-user-message-images')).not.toBeNull();
    expect(container.querySelectorAll('.bolt-user-message-images img')).toHaveLength(1);
  });
});
