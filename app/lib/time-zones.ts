const FALLBACK_IANA_TIME_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Warsaw',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[];
};

export function isValidIanaTimeZone(value: string): boolean {
  const timeZone = value.trim();

  if (!timeZone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();

    return true;
  } catch {
    return false;
  }
}

export function detectedIanaTimeZone(): string | null {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return timeZone && isValidIanaTimeZone(timeZone) ? timeZone : null;
}

export function supportedIanaTimeZones(additionalValues: string[] = []): string[] {
  const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
  const platformTimeZones = typeof supportedValuesOf === 'function' ? supportedValuesOf.call(Intl, 'timeZone') : [];
  const timeZones = new Set<string>(['UTC', ...platformTimeZones, ...FALLBACK_IANA_TIME_ZONES]);

  for (const value of additionalValues) {
    const timeZone = value.trim();

    if (isValidIanaTimeZone(timeZone)) {
      timeZones.add(timeZone);
    }
  }

  return [...timeZones].sort((left, right) => {
    if (left === 'UTC') {
      return -1;
    }

    if (right === 'UTC') {
      return 1;
    }

    return left.localeCompare(right, 'en');
  });
}
