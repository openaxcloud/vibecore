/*
 * Build the option list for the Timezone picker.
 *
 * The picker used to enumerate only the auto-detected zone (and at most a single
 * hydrated value), so the control rendered with exactly one choice and the user
 * could never actually change their timezone. We enumerate the full IANA zone
 * universe via `Intl.supportedValuesOf('timeZone')` (Node/modern browsers) and
 * fall back to a curated static list on engines that predate it. The
 * detected/current zone is always merged in and floated to the top so it stays
 * the default selection even on the fallback path.
 */

/*
 * Curated fallback covering the common zones for engines without
 * `Intl.supportedValuesOf` (e.g. older Safari / Node < 18).
 */
const FALLBACK_TIMEZONES: string[] = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

/**
 * Returns the de-duplicated, sorted list of IANA timezone identifiers to show in
 * the Timezone picker. Any `preferred` zones (the auto-detected zone and the
 * currently-saved value) are guaranteed to be present and are floated to the
 * front so the active selection is never missing from the list.
 */
export function buildTimezoneOptions(...preferred: Array<string | null | undefined>): string[] {
  let base: string[];

  try {
    const supported =
      typeof Intl !== 'undefined' &&
      typeof (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf === 'function'
        ? (Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone')
        : null;

    base = supported && supported.length > 0 ? [...supported] : [...FALLBACK_TIMEZONES];
  } catch {
    base = [...FALLBACK_TIMEZONES];
  }

  base.sort((a, b) => a.localeCompare(b));

  const pinned = preferred.filter((tz): tz is string => Boolean(tz));

  // Drop pinned zones from the body, then prepend them (de-duped) so they lead.
  const pinnedSet = new Set(pinned);
  const rest = base.filter((tz) => !pinnedSet.has(tz));

  return Array.from(new Set([...pinned, ...rest]));
}
