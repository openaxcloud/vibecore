/*
 * SCR-008 — mise en forme des jauges RAM / CPU / stockage de « Vue d'ensemble ».
 *
 * La règle qui gouverne tout ce fichier : une valeur que le noyau n'expose pas
 * rend `null`, et `null` s'affiche « Non communiqué » — JAMAIS `0 %` ni
 * « 0 o ». Un zéro se lit « rien n'est consommé » ; c'est une affirmation
 * fausse là où la vérité est « on ne sait pas ». Le lecteur cgroup en amont
 * prend déjà ce parti (`services/workspace-agent/src/resource-usage.ts`) ; le
 * rendu doit le tenir jusqu'au bout, sinon le soin pris en amont est perdu à la
 * dernière ligne.
 */

export type ResourceGaugeInput = Readonly<{ used: number | null; limit: number | null }>;

export type ProjectOverviewResources = Readonly<{
  memory?: ResourceGaugeInput;
  cpu?: Readonly<{ ratio: number | null; limitCores: number | null }>;
  storage?: ResourceGaugeInput;
  measuredAt?: string;
  unavailable?: boolean;
}>;

export type GaugeDisplay = Readonly<{
  /** Texte principal, déjà localisé. */
  value: string;

  /**
   * Part remplie de la barre, entre 0 et 1 — `null` quand la barre ne doit PAS
   * être dessinée (consommation inconnue, ou aucune limite à laquelle rapporter
   * la consommation). Une barre vide se lirait « 0 % consommé ».
   */
  fill: number | null;
}>;

const BINARY_UNITS_EN = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const BINARY_UNITS_FR = ['o', 'Kio', 'Mio', 'Gio', 'Tio'] as const;

/**
 * Un octet est un octet : on n'arrondit pas une valeur absente à zéro, on rend
 * `undefined` pour que l'appelant pose le libellé « non communiqué ».
 */
export function formatResourceBytes(bytes: number | null | undefined, language?: string | null): string | undefined {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return undefined;
  }

  const french = String(language ?? '')
    .toLowerCase()
    .startsWith('fr');

  const units = french ? BINARY_UNITS_FR : BINARY_UNITS_EN;

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  // Les octets bruts n'ont pas de décimale ; au-delà, une seule suffit à lire la jauge.
  const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : 1;

  const formatted = new Intl.NumberFormat(french ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  return `${formatted}\u00a0${units[unitIndex]}`;
}

export function formatResourceRatio(ratio: number | null | undefined, language?: string | null): string | undefined {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) {
    return undefined;
  }

  const french = String(language ?? '')
    .toLowerCase()
    .startsWith('fr');

  return new Intl.NumberFormat(french ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: ratio < 0.1 ? 1 : 0,
  }).format(Math.min(1, ratio));
}

/**
 * Jauge d'octets : « 382 Mio sur 512 Mio » avec barre quand la limite est
 * connue, « 382 Mio » sans barre quand elle ne l'est pas, et le libellé
 * d'absence quand la consommation elle-même manque.
 */
export function describeByteGauge(
  gauge: ResourceGaugeInput | undefined,
  copy: Readonly<{ unknown: string; noLimit: string; usedOfLimit: string }>,
  language?: string | null,
): GaugeDisplay {
  const used = formatResourceBytes(gauge?.used, language);

  if (used === undefined) {
    return { value: copy.unknown, fill: null };
  }

  const limit = formatResourceBytes(gauge?.limit, language);

  if (limit === undefined) {
    return { value: `${used} · ${copy.noLimit}`, fill: null };
  }

  const limitBytes = gauge?.limit ?? 0;
  const fill = limitBytes > 0 ? Math.min(1, (gauge?.used ?? 0) / limitBytes) : null;

  return { value: copy.usedOfLimit.replace('{used}', used).replace('{limit}', limit), fill };
}

/**
 * Jauge processeur : un taux d'usage est une DÉRIVÉE, il n'existe pas avant
 * deux relevés. Tant qu'il vaut `null`, on dit que la mesure est en cours —
 * afficher 0 % en attendant serait inventer un chiffre.
 */
export function describeCpuGauge(
  cpu: ProjectOverviewResources['cpu'],
  copy: Readonly<{ pending: string }>,
  language?: string | null,
): GaugeDisplay {
  const ratio = formatResourceRatio(cpu?.ratio, language);

  if (ratio === undefined) {
    return { value: copy.pending, fill: null };
  }

  return { value: ratio, fill: Math.min(1, Math.max(0, cpu?.ratio ?? 0)) };
}
