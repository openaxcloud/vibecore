import { formatAbsoluteTime, formatRelativeTime } from '~/lib/format-relative';

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
  const relative = formatRelativeTime(value);

  if (!relative) {
    return <span className={className}>{prefix ? `${prefix} recently` : 'recently'}</span>;
  }

  const absolute = formatAbsoluteTime(value);

  return (
    <time dateTime={new Date(value).toISOString()} title={absolute} suppressHydrationWarning className={className}>
      {prefix ? `${prefix} ${relative}` : relative}
    </time>
  );
}
