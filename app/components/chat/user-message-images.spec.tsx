/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react';
import type { FileUIPart } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import { UserMessage } from './UserMessage';

afterEach(cleanup);

const image = {
  type: 'file',
  mimeType: 'image/png',
  data: 'x',
  url: 'data:image/png;base64,x',
} as unknown as FileUIPart;

describe('rangée d’images du message utilisateur', () => {
  it('n’est pas montée quand il n’y a pas d’image', () => {
    /*
     * Rendue systématiquement, elle réservait sa marge basse : mesuré 7px sous
     * CHAQUE message de l'utilisateur, pour un conteneur vide. Sur un fil de
     * douze messages, 42px — une ligne de texte entière perdue en blanc.
     */
    const { container } = render(<UserMessage content="Ajoute une page de contact." messageId="m1" />);

    expect(container.querySelector('.mb-2'), 'aucune rangée d’images sans image').toBeNull();
  });

  it('est montée dès qu’il y a une image', () => {
    const { container } = render(<UserMessage content="Regarde cette capture." messageId="m2" parts={[image]} />);

    expect(container.querySelector('.mb-2'), 'la rangée doit exister quand elle a du contenu').toBeTruthy();
  });
});
