import type { Message } from 'ai';
import { Fragment } from 'react';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'react-toastify';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
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
          toast.error('Chat persistence is not available');
          return;
        }

        const urlId = await forkChat(db, chatId.get()!, messageId);
        window.location.href = `/chat/${urlId}`;
      } catch (error) {
        toast.error('Failed to fork chat: ' + (error as Error).message);
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

              return (
                <div
                  key={rowKey}
                  id={messageId ? `chat-message-${messageId}` : undefined}
                  data-message-id={messageId}
                  className={classNames('bolt-chat-message-row flex gap-4 py-2 w-full rounded-lg', {
                    'bolt-chat-message-row-user': isUserMessage,
                    'bolt-chat-message-row-assistant': !isUserMessage,
                    'mt-3': !isFirst,
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
          <div className="text-center w-full  text-bolt-elements-item-contentAccent i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
        )}
      </div>
    );
  },
);
