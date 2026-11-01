import { useTranslation } from 'react-i18next';
import type { AssistantPresentationPart } from './assistant-presentation';
import { getAssistantMessageCopy } from '~/lib/i18n/catalogs/assistant-message';

/** Escaped source inside the message's single collapsed technical disclosure. */
export function MessageTechnicalActivity({
  activity,
}: {
  activity: Extract<AssistantPresentationPart, { kind: 'activity' }>;
}) {
  const { i18n } = useTranslation();
  const copy = getAssistantMessageCopy(i18n.resolvedLanguage ?? i18n.language ?? 'en');

  return (
    <section className="my-2 min-w-0" data-testid="message-technical-activity">
      <h4 className="break-words text-sm">{activity.title ?? copy['assistantMessage.activity.files']}</h4>
      <pre
        tabIndex={0}
        aria-label={copy['assistantMessage.activity.files']}
        className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words text-xs"
      >
        <code>{activity.text}</code>
      </pre>
    </section>
  );
}
