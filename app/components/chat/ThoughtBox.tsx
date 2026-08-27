import { useId, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChatResidualsCopy, getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';

const ThoughtBox = ({ title, children }: PropsWithChildren<{ title: string }>) => {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  return (
    <div
      className={`
        bolt-assistant-thought-box
        bg-bolt-elements-background-depth-2
        shadow-md 
        rounded-lg 
        transition-all 
        duration-300
        min-w-0
        border border-bolt-elements-borderColor
      `}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-label={formatChatResidualsCopy(
          isExpanded ? copy['chatResiduals.thought.collapseAria'] : copy['chatResiduals.thought.expandAria'],
          { title },
        )}
        onClick={() => setIsExpanded((value) => !value)}
        className="bolt-assistant-thought-header flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-bolt-elements-borderColor p-4 text-left text-sm font-medium leading-5 text-bolt-elements-textSecondary outline-none hover:bg-bolt-elements-background-depth-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bolt-elements-focus"
      >
        <span className="i-ph:brain-thin shrink-0 text-2xl" aria-hidden />
        <span className="min-w-0 break-words">
          <span>{title}</span>
          {!isExpanded ? (
            <span className="text-bolt-elements-textTertiary"> — {copy['chatResiduals.thought.expandHint']}</span>
          ) : null}
        </span>
      </button>
      <div
        id={contentId}
        hidden={!isExpanded}
        className={`
        transition-opacity 
        duration-300
        p-4 
        rounded-lg 
        opacity-100
      `}
      >
        {children}
      </div>
    </div>
  );
};

export default ThoughtBox;
