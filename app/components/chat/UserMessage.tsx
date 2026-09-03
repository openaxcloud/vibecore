import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { useStore } from '@nanostores/react';
import { useTranslation } from 'react-i18next';
import { Markdown } from './Markdown';
import { stripInternalAgentScaffolding } from '~/lib/chat/agent-message-scaffolding';
import {
  formatChatResidualsCopy,
  formatChatResidualsNumber,
  getChatResidualsCopy,
} from '~/lib/i18n/catalogs/chat-residuals';
import { profileStore } from '~/lib/stores/profile';
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
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

  /*
   * La révélation est portée par la feuille de style
   * (`.bolt-user-message-footer`) : survol sur pointeur fin, toucher sur
   * pointeur grossier. Un test JS du type de pointeur ne survivait pas à un
   * changement d'entrée en cours de session (une souris branchée sur une
   * tablette) et dupliquait une règle que CSS exprime directement.
   */
  return (
    <button
      type="button"
      aria-label={copy['chatResiduals.user.editAria']}
      data-vc-tooltip={copy['chatResiduals.user.editTooltip']}
      className="bolt-user-message-edit flex items-center justify-center rounded-md text-bolt-elements-textTertiary outline-none transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatResidualsCopy(language);
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
                  alt={profile?.username || copy['chatResiduals.user.avatarAlt']}
                  className="w-[25px] h-[25px] object-cover rounded-full"
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="i-ph:user-fill text-[var(--vc-action-primary)] text-2xl" />
              )}
              <span className="text-bolt-elements-textPrimary text-sm">
                {profile?.username ? profile.username : ''}
              </span>
            </div>
          ) : (
            <div className="i-ph:user-fill text-[var(--vc-action-primary)] text-2xl" />
          )}
        </div>
        <div className="group bolt-user-message-bubble flex flex-col gap-3 bg-[color-mix(in_srgb,var(--vc-action-primary)_10%,transparent)] backdrop-blur-sm px-3 py-2 w-auto rounded-lg [margin-inline-end:auto]">
          {textContent && <Markdown html>{textContent}</Markdown>}
          {images.map((item, index) => (
            <img
              key={index}
              src={`data:${item.mimeType};base64,${item.data}`}
              alt={formatChatResidualsCopy(copy['chatResiduals.user.imageAlt'], {
                count: formatChatResidualsNumber(index + 1, language),
              })}
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
    <div className="group bolt-user-message flex flex-col items-end">
      <div className="bolt-user-message-bubble flex w-auto flex-col rounded-lg bg-[color-mix(in_srgb,var(--vc-action-primary)_10%,transparent)] px-3 py-2 backdrop-blur-sm [margin-inline-start:auto]">
        {/*
          La rangée d'images n'est montée QUE s'il y a des images.

          Rendue systématiquement, elle réservait sa marge basse — mesuré 7px
          sous CHAQUE message de l'utilisateur, pour un conteneur vide. Sur un
          fil de douze messages c'est une ligne de texte entière perdue en
          blanc, et c'est exactement la plainte d'Avi : « pourquoi perdre tant
          de place dans les bubbles ».
        */}
        {images.length > 0 ? (
          <div className="flex gap-3 mb-2">
            {images.map((item, index) => (
              <div
                key={index}
                className="relative flex rounded-lg border border-bolt-elements-borderColor overflow-hidden"
              >
                <div className="h-16 w-16 bg-transparent outline-none">
                  <img
                    src={`data:${item.mimeType};base64,${item.data}`}
                    alt={formatChatResidualsCopy(copy['chatResiduals.user.imageAlt'], {
                      count: formatChatResidualsNumber(index + 1, language),
                    })}
                    className="h-full w-full rounded-lg"
                    style={{ objectFit: 'fill' }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <Markdown html>{textContent}</Markdown>
      </div>
      {/*
        « Modifier et renvoyer » occupait une rangée ENTIÈRE dans la bulle, et sur
        écran tactile elle était rendue en permanence : une bulle d'une ligne
        mesurait 102 px. L'action sort de la bulle et rejoint le même traitement
        que celles de l'agent — discrète, révélée au survol ou au toucher.
      */}
      {canEdit && messageId && textContent ? (
        <div className="bolt-user-message-footer" role="group" aria-label={copy['chatResiduals.user.editAria']}>
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
