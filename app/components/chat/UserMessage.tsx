/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { useStore } from '@nanostores/react';
import { Markdown } from './Markdown';
import { useCoarsePointer } from '~/components/sidebar/HistoryItem';
import { stripInternalAgentScaffolding } from '~/lib/chat/agent-message-scaffolding';
import { profileStore } from '~/lib/stores/profile';
import { classNames } from '~/utils/classNames';
import { MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';

interface UserMessageProps {
  content: string | Array<{ type: string; text?: string; image?: string }>;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  messageId?: string;
  canEdit?: boolean;
}

/**
 * Edit-and-resubmit affordance (Cursor/Replit parity). Dispatches a window event
 * that Chat.client handles by truncating to this message and prefilling the
 * composer with `text`, so the user edits it and resends through the normal path.
 */
function EditMessageButton({ messageId, text }: { messageId: string; text: string }) {
  /*
   * On a coarse (touch) pointer there is no hover, so the hover-only reveal left
   * the edit affordance permanently invisible. Show it outright on touch; on a
   * fine pointer keep the hover reveal but also surface it on keyboard focus.
   */
  const coarse = useCoarsePointer();

  return (
    <button
      type="button"
      aria-label="Edit and resend this message"
      data-vc-tooltip="Edit & resend"
      className={classNames(
        'bolt-user-message-edit transition-opacity text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary focus-visible:opacity-100',
        coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
      onClick={() => {
        if (typeof window === 'undefined') {
          return;
        }

        window.dispatchEvent(new CustomEvent('vibecore:edit-message', { detail: { messageId, text } }));
      }}
    >
      <span className="i-ph:pencil-simple text-sm" aria-hidden />
    </button>
  );
}

export function UserMessage({ content, parts, messageId, canEdit }: UserMessageProps) {
  const profile = useStore(profileStore);

  // Extract images from parts - look for file parts with image mime types
  const images =
    parts?.filter(
      (part): part is FileUIPart => part.type === 'file' && 'mimeType' in part && part.mimeType.startsWith('image/'),
    ) || [];

  if (Array.isArray(content)) {
    const textItem = content.find((item) => item.type === 'text');
    const textContent = stripMetadata(textItem?.text || '');

    return (
      <div className="bolt-user-message overflow-hidden flex flex-col gap-3 items-center ">
        <div className="flex flex-row items-start justify-center overflow-hidden shrink-0 self-start">
          {profile?.avatar || profile?.username ? (
            <div className="flex items-end gap-2">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'User'}
                  className="w-[25px] h-[25px] object-cover rounded-full"
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="i-ph:user-fill text-accent-500 text-2xl" />
              )}
              <span className="text-bolt-elements-textPrimary text-sm">
                {profile?.username ? profile.username : ''}
              </span>
            </div>
          ) : (
            <div className="i-ph:user-fill text-accent-500 text-2xl" />
          )}
        </div>
        <div className="group bolt-user-message-bubble flex flex-col gap-3 bg-accent-500/10 backdrop-blur-sm px-3 py-2 w-auto rounded-lg [margin-inline-end:auto]">
          {textContent && <Markdown html>{textContent}</Markdown>}
          {images.map((item, index) => (
            <img
              key={index}
              src={`data:${item.mimeType};base64,${item.data}`}
              alt={`Image ${index + 1}`}
              className="max-w-full h-auto rounded-lg"
              style={{ maxHeight: '512px', objectFit: 'contain' }}
            />
          ))}
          {canEdit && messageId && textContent ? (
            <div className="flex justify-end">
              <EditMessageButton messageId={messageId} text={textContent} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const textContent = stripMetadata(content);

  return (
    <div className="group bolt-user-message bolt-user-message-bubble flex flex-col bg-accent-500/10 backdrop-blur-sm px-4 py-2.5 w-auto rounded-lg [margin-inline-start:auto]">
      <div className="flex gap-3 mb-2">
        {images.map((item, index) => (
          <div key={index} className="relative flex rounded-lg border border-bolt-elements-borderColor overflow-hidden">
            <div className="h-16 w-16 bg-transparent outline-none">
              <img
                src={`data:${item.mimeType};base64,${item.data}`}
                alt={`Image ${index + 1}`}
                className="h-full w-full rounded-lg"
                style={{ objectFit: 'fill' }}
              />
            </div>
          </div>
        ))}
      </div>
      <Markdown html>{textContent}</Markdown>
      {canEdit && messageId && textContent ? (
        <div className="mt-1 flex justify-end">
          <EditMessageButton messageId={messageId} text={textContent} />
        </div>
      ) : null}
    </div>
  );
}

function stripMetadata(content: string) {
  const artifactRegex = /<boltArtifact\s+[^>]*>[\s\S]*?<\/boltArtifact>/gm;
  const actionRegex = /<boltAction\s+[^>]*>[\s\S]*?<\/boltAction>/gm;

  let text = stripInternalAgentScaffolding(content)
    .replace(MODEL_REGEX, '')
    .replace(PROVIDER_REGEX, '')
    .replace(/\[Model:[^\]]*\]/gi, '')
    .replace(/\[Provider:[^\]]*\]/gi, '')
    .replace(artifactRegex, '')
    .replace(actionRegex, '');

  const userPromptMatch = text.match(/User prompt:\s*([\s\S]*)$/i);

  if (userPromptMatch && userPromptMatch[1].trim()) {
    text = userPromptMatch[1];
  }

  return text.trim();
}
