import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { classNames } from '~/utils/classNames';

/**
 * 32px eye toggle for password/token inputs (auth screen, git token dialogs).
 * Rendered inside the input's relative wrapper, aligned right. onMouseDown is
 * prevented so clicking the toggle never steals focus (or the caret) from the
 * input it reveals.
 */
export function RevealButton({
  revealed,
  onToggle,
  subject,
  showLabel,
  hideLabel,
  className,
}: {
  revealed: boolean;
  onToggle: () => void;
  subject?: string;
  showLabel?: string;
  hideLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  const resolvedShowLabel =
    showLabel ?? (subject ? t('common.showSubject', { subject }) : t('auth.common.showPassword'));
  const resolvedHideLabel =
    hideLabel ?? (subject ? t('common.hideSubject', { subject }) : t('auth.common.hidePassword'));

  return (
    <button
      type="button"
      aria-pressed={revealed}
      aria-label={revealed ? resolvedHideLabel : resolvedShowLabel}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={classNames(
        'flex h-8 w-8 items-center justify-center rounded-md text-bolt-elements-textTertiary transition-colors',
        'hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)]',
        className,
      )}
    >
      {revealed ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  );
}
