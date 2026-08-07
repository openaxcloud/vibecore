import { useTranslation } from 'react-i18next';
import { IconButton } from '~/components/ui';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
import { classNames } from '~/utils/classNames';

export function DiscussMode() {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div>
      <IconButton
        title={copy['chatResiduals.discuss.title']}
        className={classNames(
          'flex min-h-11 min-w-11 items-center gap-1 bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent transition-all',
        )}
      >
        <div className="i-ph:chats text-xl" aria-hidden />
      </IconButton>
    </div>
  );
}
