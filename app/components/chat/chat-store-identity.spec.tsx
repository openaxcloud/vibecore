/**
 * @vitest-environment jsdom
 */

import { useChat } from '@ai-sdk/react';
import { act, cleanup, render } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Pourquoi le panneau Agent pouvait afficher un fil VIDE alors que le réseau
 * avait rendu les messages.
 *
 * `useChat` clé son magasin ainsi (source installée, `@ai-sdk/react`) :
 *
 *   const hookId = useId();
 *   const chatId = id != null ? id : hookId;
 *   const chatKey = typeof api === 'string' ? [api, chatId] : chatId;
 *   useSWR([chatKey, 'messages'], …)
 *
 * `useId()` dépend de la POSITION du composant dans l'arbre. Deux instances au
 * même endroit logique mais à des positions différentes — une frontière
 * Suspense qui se résout, un enveloppement conditionnel qui apparaît —
 * obtiennent donc des clés DIFFÉRENTES, et la seconde lit un magasin vide.
 *
 * Un `setMessages` déjà appliqué reste écrit sous l'ancienne clé : perdu, sans
 * erreur et sans retrait de nœud. Ces tests mesurent ce comportement sur le
 * vrai SDK plutôt que de le déduire.
 */

afterEach(cleanup);

const FIL: Message[] = [
  { id: 'u1', role: 'user', content: 'Question de l’utilisateur.' },
  { id: 'a1', role: 'assistant', content: 'Réponse de l’agent.' },
];

/** Sonde qui expose ce que `useChat` voit, sous une identité donnée. */
function Sonde({
  id,
  rapport,
}: {
  id?: string;
  rapport: (api: { messages: Message[]; setMessages: (m: Message[]) => void }) => void;
}) {
  const { messages, setMessages } = useChat({ api: '/api/chat', id });
  rapport({ messages: messages as Message[], setMessages });

  return <div data-testid="sonde">{messages.length}</div>;
}

/**
 * Deux enveloppes de PROFONDEUR différente : c'est ce qui fait varier `useId()`
 * entre deux instances, exactement comme une frontière Suspense qui se résout
 * change la forme de l'arbre autour du composant.
 */
function Peu({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function Beaucoup({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div>
        <div>
          <span />
          {children}
        </div>
      </div>
    </div>
  );
}

function monterEtAppliquer(id: string | undefined, enveloppe: (p: { children: React.ReactNode }) => JSX.Element) {
  let dernier: { messages: Message[]; setMessages: (m: Message[]) => void } | undefined;

  const Enveloppe = enveloppe;

  const vue = render(
    <Enveloppe>
      <Sonde id={id} rapport={(api) => (dernier = api)} />
    </Enveloppe>,
  );

  return { vue, api: () => dernier! };
}

describe('identité du magasin de conversation (`useChat`)', () => {
  it('SANS id : un fil appliqué est perdu quand la forme de l’arbre change', () => {
    const premier = monterEtAppliquer(undefined, Peu);
    act(() => premier.api().setMessages(FIL));
    expect(premier.api().messages).toHaveLength(2);

    premier.vue.unmount();

    // Même composant, autre position dans l'arbre → autre `useId()` → autre clé.
    const second = monterEtAppliquer(undefined, Beaucoup);

    expect(
      second.api().messages,
      'le fil appliqué a survécu : la clé n’a pas changé, ce test ne prouve donc rien',
    ).toHaveLength(0);
  });

  it('AVEC un id stable : le fil survit au changement de forme de l’arbre', () => {
    const identite = `project:${Math.random().toString(36).slice(2)}`;

    const premier = monterEtAppliquer(identite, Peu);
    act(() => premier.api().setMessages(FIL));
    expect(premier.api().messages).toHaveLength(2);

    premier.vue.unmount();

    const second = monterEtAppliquer(identite, Beaucoup);

    expect(second.api().messages).toHaveLength(2);
    expect(second.api().messages.map((m) => m.content)).toEqual(['Question de l’utilisateur.', 'Réponse de l’agent.']);
  });

  it('deux projets différents ne partagent pas leur fil', () => {
    const a = monterEtAppliquer('project:aaa', Peu);
    act(() => a.api().setMessages(FIL));
    a.vue.unmount();

    const b = monterEtAppliquer('project:bbb', Peu);

    expect(b.api().messages).toHaveLength(0);
  });
});
