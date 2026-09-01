/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from './AssistantMessage';

/**
 * La bulle vide qu'Avi photographie sur son iPhone.
 *
 * En-tête « Agent · 2 messages », sa question s'affiche, et sous le titre
 * « Agent » il n'y a QUE la rangée d'actions — copier, relancer, éditer, pouce
 * haut, pouce bas — aucun texte, puis un grand vide.
 *
 * Le corps du message était lu UNIQUEMENT depuis `content`. Les `parts` texte du
 * SDK n'étaient utilisées que pour les appels d'outils et le raisonnement :
 * quand le texte arrive par les `parts` et que `content` est vide, la bulle
 * rendait son en-tête et sa barre d'actions autour de RIEN.
 *
 * Et quand il n'y a réellement rien à montrer, une coquille avec cinq boutons
 * est pire que pas de bulle du tout : elle donne à croire qu'un message existe.
 */
afterEach(cleanup);

const partsTexte = (texte: string) => [{ type: 'text' as const, text: texte }] as never;

describe('bulle de l’agent — le corps ne doit pas dépendre du seul `content`', () => {
  it('affiche le texte porté par les `parts` quand `content` est vide', () => {
    render(
      <AssistantMessage
        content=""
        parts={partsTexte('J’ai ajouté la validation du formulaire.')}
        messageId="m1"
        addToolResult={() => {}}
      />,
    );

    expect(screen.getByText(/J’ai ajouté la validation du formulaire\./)).toBeTruthy();
  });

  it('préfère `content` quand les deux sont présents — c’est la version analysée', () => {
    const { container } = render(
      <AssistantMessage
        content="Version analysée."
        parts={partsTexte('Version brute.')}
        messageId="m2"
        addToolResult={() => {}}
      />,
    );

    expect(container.textContent).toContain('Version analysée.');
    expect(container.textContent).not.toContain('Version brute.');
  });

  it('ne rend AUCUNE coquille quand le message est entièrement vide', () => {
    const { container } = render(<AssistantMessage content="" messageId="m3" addToolResult={() => {}} />);

    /*
     * C'est exactement la capture d'Avi : « Agent » suivi de cinq boutons et de
     * rien. Une bulle sans contenu ne doit pas exister.
     */
    expect(container.querySelector('.bolt-assistant-message-footer')).toBeNull();
    expect(container.textContent?.trim()).toBe('');
  });

  it('garde la bulle quand le texte est vide mais qu’un outil a tourné', () => {
    const { container } = render(
      <AssistantMessage
        content=""
        parts={
          [
            {
              type: 'tool-invocation',
              toolInvocation: { state: 'result', toolCallId: 't1', toolName: 'lireFichier', args: {}, result: 'ok' },
            },
          ] as never
        }
        messageId="m4"
        addToolResult={() => {}}
      />,
    );

    expect(container.textContent?.trim()).not.toBe('');
  });
});
