/*
 * Single source of truth for the auth hero stats. The login page previously
 * showed "21 AI providers" in the desktop panel but "21 AI models" in the mobile
 * strip — same number, contradictory label. Share one list so the figures can
 * never drift again; the desktop panel uses the first two, mobile uses all four.
 */
export const AUTH_HERO_STATS = [
  { value: '21', label: 'AI providers' },
  { value: '29+', label: 'Languages' },
  { value: '99.9%', label: 'Uptime path' },
  { value: 'SOC2', label: 'Ready controls' },
] as const;
