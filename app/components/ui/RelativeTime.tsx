import { useTranslation } from 'react-i18next';
import { formatAbsoluteTime, formatRelativeTime } from '~/lib/format-relative';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';

/**
 * <time> that renders "Updated 2 hours ago"-style labels with the absolute
 * date-time in the title tooltip and dateTime attribute. suppressHydrationWarning
 * because the relative label can legitimately tick over between the server
 * render and hydration.
 */
export function RelativeTime({
  value,
  prefix,
  className,
}: {
  value: string | number | Date;
  prefix?: string;
  className?: string;
}) {
  const { i18n, t } = useTranslation();
  const language = normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const relative = formatRelativeTime(value, new Date(), language);

  if (!relative) {
    const recently = t('userArea.time.recently');

    return (
      <span className={className}>{prefix ? t('userArea.time.withPrefix', { prefix, time: recently }) : recently}</span>
    );
  }

  const absolute = formatAbsoluteTime(value, language);

  return (
    <time dateTime={new Date(value).toISOString()} title={absolute} suppressHydrationWarning className={className}>
      {prefix ? t('userArea.time.withPrefix', { prefix, time: relative }) : relative}
    </time>
  );
}
