import type { LogEntry } from '~/lib/stores/logs';

/**
 * Count how many logs match the active level + search query.
 *
 * Extracted as a pure helper so the search-result count can be computed inside
 * the debounced search-logging effect WITHOUT making `filteredLogs.length` a
 * dependency of that effect. Depending on the count there causes an infinite
 * log/localStorage storm: the effect writes a log entry whose message embeds the
 * search query, that entry matches the active query, the count increments, the
 * effect re-fires, writes again, and so on once per debounce interval.
 */
export function countMatchingLogs(logs: LogEntry[], selectedLevel: string, searchQuery: string): number {
  const query = searchQuery.toLowerCase();

  return logs.filter((log) => {
    const matchesType = selectedLevel === 'all' || log.category === selectedLevel || log.level === selectedLevel;
    const matchesSearch = query ? log.message.toLowerCase().includes(query) : true;

    return matchesType && matchesSearch;
  }).length;
}
