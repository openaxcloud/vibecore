import type { Message } from 'ai';
import { Fragment } from 'react';
import { forwardRef, useState } from 'react';
import type { ForwardedRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { toast } from 'react-toastify';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
import { forkChat } from '~/lib/persistence/db';
import { db, chatId } from '~/lib/persistence/useChatHistory';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  projectIdeMode?: boolean;

  /*
   * IDE-mode regenerate/rewind. The standalone chat rewinds via a ?rewindTo=
   * URL param + IndexedDB history, which doesn't exist in the project IDE, so
   * the IDE supplies an in-memory handler that truncates and regenerates.
   */
  onRewindToMessage?: (messageId: string) => void;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;
    const location = useLocation();

    /*
     * Ligne dont les actions sont dépliées au toucher. Une seule à la fois :
     * deux barres ouvertes sur un fil long, c'est le bruit qu'on cherchait
     * justement à supprimer.
     */
    const [revealedRowKey, setRevealedRowKey] = useState<string | undefined>(undefined);
    const { i18n } = useTranslation();
    const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

    const handleRewind = (messageId: string) => {
      /*
       * In the project IDE the conversation lives in useChat state (not the
       * IndexedDB-backed standalone history), so a ?rewindTo= reload is inert.
       * Defer to the IDE-supplied in-memory regenerate handler there.
       */
      if (props.projectIdeMode && props.onRewindToMessage) {
        props.onRewindToMessage(messageId);
        return;
      }

      const searchParams = new URLSearchParams(location.search);
      searchParams.set('rewindTo', messageId);
      window.location.search = searchParams.toString();
    };

    const handleFork = async (messageId: string) => {
      try {
        if (!db || !chatId.get()) {
          toast.error(copy['chatResiduals.messages.persistenceUnavailable']);
          return;
        }

        const urlId = await forkChat(db, chatId.get()!, messageId);
        window.location.href = `/chat/${urlId}`;
      } catch {
        toast.error(copy['chatResiduals.messages.forkFailed']);
      }
    };

    return (
      <div id={id} className={props.className} ref={ref}>
        {messages.length > 0
          ? messages.map((message, index) => {
              const { role, content, id: messageId, annotations, parts } = message;
              const isUserMessage = role === 'user';
              const isFirst = index === 0;
              const isHidden = annotations?.includes('hidden') || role === 'system';
              const rowKey = messageId ?? `${role}-${index}`;

              if (isHidden) {
                return <Fragment key={rowKey} />;
              }

              /*
               * Révélation des actions sur un écran SANS SURVOL.
               *
               * Elle reposait uniquement sur `:focus-within` : `tabIndex={-1}`
               * rendait la ligne focalisable et le toucher la focalisait. Ce
               * contrat est FRAGILE — il dépend de la façon dont chaque moteur
               * traite le focus d'un conteneur non interactif au toucher, et
               * Safari iOS, l'appareil de référence, ne focalise PAS un `<div
               * tabindex="-1">` sur un simple appui. La barre restait donc
               * invisible là où elle compte le plus, pendant qu'un test
               * Chromium la voyait s'ouvrir.
               *
               * On rend donc l'intention EXPLICITE : l'appui bascule un
               * attribut porté par la ligne, et le style s'accroche dessus.
               * `:focus-within` reste, pour le clavier ; `tabIndex={-1}` reste,
               * pour que le focus programmatique fonctionne toujours.
               */
              const isRevealed = revealedRowKey === rowKey;

              return (
                <div
                  key={rowKey}
                  id={messageId ? `chat-message-${messageId}` : undefined}
                  data-message-id={messageId}
                  data-actions-revealed={isRevealed ? 'true' : undefined}
                  onPointerUp={(event) => {
                    /*
                     * Un appui SUR une commande (copier, régénérer, un lien…)
                     * ne doit pas être détourné en « révéler » : la barre est
                     * déjà ouverte dans ce cas, et l'action doit partir.
                     */
                    if ((event.target as HTMLElement)?.closest?.('button, a, input, textarea, select, summary')) {
                      return;
                    }

                    setRevealedRowKey((current) => (current === rowKey ? undefined : rowKey));
                  }}
                  tabIndex={0}
                  className={classNames('bolt-chat-message-row flex gap-4 py-1 w-full rounded-lg', {
                    'bolt-chat-message-row-user': isUserMessage,
                    'bolt-chat-message-row-assistant': !isUserMessage,
                    'mt-1': !isFirst,
                  })}
                >
                  <div className="grid grid-col-1 w-full">
                    {isUserMessage ? (
                      <UserMessage
                        content={content}
                        parts={parts}
                        messageId={messageId}
                        canEdit={props.projectIdeMode && !isStreaming}
                      />
                    ) : (
                      <AssistantMessage
                        content={content}
                        annotations={message.annotations}
                        messageId={messageId}
                        onRewind={handleRewind}
                        onFork={handleFork}
                        append={props.append}
                        chatMode={props.chatMode}
                        setChatMode={props.setChatMode}
                        model={props.model}
                        provider={props.provider}
                        parts={parts}
                        addToolResult={props.addToolResult}
                      />
                    )}
                  </div>
                </div>
              );
            })
          : null}
        {isStreaming && (
          <div
            className="i-svg-spinners:3-dots-fade mt-4 w-full text-center text-4xl text-bolt-elements-item-contentAccent"
            role="status"
            aria-label={copy['chatResiduals.messages.streaming']}
          >
            <span className="sr-only">{copy['chatResiduals.messages.streaming']}</span>
          </div>
        )}
      </div>
    );
  },
);

Messages.displayName = 'Messages';
