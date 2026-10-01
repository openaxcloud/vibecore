/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { Message } from 'ai';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { Messages } from './Messages.client';

afterEach(cleanup);

const question: Message = { id: 'u1', role: 'user', content: 'Ajoute une page de contact.' };
const reponseVide: Message = { id: 'a1', role: 'assistant', content: '' };
const reponse: Message = { id: 'a1', role: 'assistant', content: 'La page est créée.' };

function monter(messages: Message[], isStreaming: boolean) {
  /* `Messages` lit la route pour ses actions ; sans routeur il ne monte pas. */
  return render(
    <MemoryRouter>
      <Messages messages={messages} isStreaming={isStreaming} />
    </MemoryRouter>,
  );
}

describe('« l’agent écrit… » dans le fil', () => {
  it('apparaît dès la question posée', () => {
    monter([question], true);

    expect(screen.getByRole('status'), 'l’attente doit être signalée').toBeTruthy();
  });

  it('reste tant que la réponse est vide', () => {
    monter([question, reponseVide], true);

    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('s’efface dès que le texte est lisible', () => {
    /*
     * Le texte qui s'écrit EST le retour. Garder les points par-dessus, c'est
     * deux signaux pour une information — et une ligne de plus dans un fil
     * qu'Avi trouve déjà trop aéré.
     */
    monter([question, reponse], true);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ne s’affiche pas hors production de réponse', () => {
    monter([question, reponse], false);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('porte un libellé lisible, pas seulement une animation', () => {
    /*
     * Une animation seule n'annonce rien à qui ne la voit pas — ni au lecteur
     * d'écran, ni à qui a désactivé les animations.
     */
    monter([question], true);

    expect(screen.getByRole('status').textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
