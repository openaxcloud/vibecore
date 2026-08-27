import { format, isAfter, isThisWeek, isThisYear, isToday, isYesterday, subDays } from 'date-fns';
import { enGB, fr as frLocale } from 'date-fns/locale';
import { getSidebarMenuCopy, resolveSidebarMenuLanguage } from '~/lib/i18n/catalogs/sidebar-menu';
import type { ChatHistoryItem } from '~/lib/persistence';

type Bin = { category: string; items: ChatHistoryItem[] };

export function binDates(_list: ChatHistoryItem[], language?: string | null) {
  const list = _list.toSorted((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const binLookup: Record<string, Bin> = {};
  const bins: Array<Bin> = [];

  list.forEach((item) => {
    const category = dateCategory(new Date(item.timestamp), language);

    if (!(category in binLookup)) {
      const bin = {
        category,
        items: [item],
      };

      binLookup[category] = bin;

      bins.push(bin);
    } else {
      binLookup[category].items.push(item);
    }
  });

  return bins;
}

export function dateCategory(date: Date, language?: string | null) {
  const resolvedLanguage = resolveSidebarMenuLanguage(language);
  const locale = resolvedLanguage === 'fr' ? frLocale : enGB;
  const copy = getSidebarMenuCopy(resolvedLanguage).sidebarMenu.history.dates;

  if (Number.isNaN(date.getTime())) {
    return copy.unknown;
  }

  if (isToday(date)) {
    return copy.today;
  }

  if (isYesterday(date)) {
    return copy.yesterday;
  }

  if (isThisWeek(date, { locale })) {
    // e.g., "Mon" instead of "Monday"
    return format(date, 'EEE', { locale });
  }

  const thirtyDaysAgo = subDays(new Date(), 30);

  if (isAfter(date, thirtyDaysAgo)) {
    return copy.pastThirtyDays;
  }

  if (isThisYear(date)) {
    // e.g., "Jan" instead of "January"
    return format(date, 'LLL', { locale });
  }

  // e.g., "Jan 2023" instead of "January 2023"
  return format(date, 'LLL yyyy', { locale });
}
