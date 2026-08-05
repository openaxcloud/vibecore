/**
 * Compteurs d'observation du masquage PII au remix (P0-V3-05).
 *
 * Le pipeline de masquage (`remix-pipeline.ts`) reste PUR : il se contente de
 * RENVOYER ce qu'il a observé. C'est ici, au bord, qu'on accumule — de sorte
 * que la décision de masquer ne dépende jamais d'un état global, et que les
 * compteurs restent assertables dans un test.
 *
 * Arbitrage Avi du 2026-08-05 : le checksum MOD-97 n'est PLUS une condition de
 * masquage, seulement une étiquette de confiance. `ibanMasked` se lit donc
 * comme `iban_masked{checksum_valid=true|false}`.
 */

export interface RemixPiiMetrics {
  /** Masquages d'IBAN, ventilés par validité du checksum (jamais une condition). */
  ibanMasked: { checksumValid: number; checksumInvalid: number };

  /**
   * Codes pays qui ressemblent à un IBAN mais sont absents du registre ISO
   * 13616. NON masqués — comptés pour qu'un nouveau pays devienne visible et
   * que la table soit mise à jour, plutôt que la fuite passe inaperçue.
   *
   * CARDINALITÉ BORNÉE : au plus {@link MAX_METRIC_COUNTRIES} libellés nommés ;
   * au-delà, tout est agrégé sous {@link OTHER_COUNTRY_LABEL}. Le TOTAL reste
   * donc exact même sous des données adverses, sans faire exploser le nombre de
   * séries temporelles côté Prometheus.
   */
  unknownCountryCode: Record<string, number>;
}

function emptyMetrics(): RemixPiiMetrics {
  return { ibanMasked: { checksumValid: 0, checksumInvalid: 0 }, unknownCountryCode: {} };
}

let metrics: RemixPiiMetrics = emptyMetrics();

/*
 * ------------------------------------------------------------------------- *
 * ÉCHANTILLONNAGE DU LOG (garde-fou 1)
 *
 * La MÉTRIQUE compte CHAQUE candidat plausible — c'est elle qui dit si le
 * phénomène monte. Le LOG, lui, est borné : il ne sert qu'à DIAGNOSTIQUER, et
 * un fichier de seed contenant mille lignes ne doit pas produire mille lignes
 * de journal.
 *
 * Règle : le PREMIER candidat de chaque code pays par fenêtre d'observation,
 * et au plus MAX_LOGGED_COUNTRIES codes distincts — cardinalité bornée même
 * face à des données adverses qui feraient défiler les codes pays.
 * -------------------------------------------------------------------------
 */

const MAX_LOGGED_COUNTRIES = 10;

/*
 * ------------------------------------------------------------------------- *
 * CARDINALITÉ DES MÉTRIQUES (garde-fou 2)
 *
 * `unknown_country_code` est indexé PAR CODE PAYS : c'est un libellé alimenté
 * par des DONNÉES, donc une porte ouverte à l'explosion de séries temporelles
 * (676 codes à deux lettres possibles, et rien n'oblige un fichier hostile à
 * s'en tenir aux vrais). On borne donc le nombre de libellés NOMMÉS ; le reste
 * s'agrège sous un libellé unique, ce qui préserve le TOTAL sans multiplier
 * les séries.
 * -------------------------------------------------------------------------
 */

const MAX_METRIC_COUNTRIES = 20;

/** Libellé fourre-tout une fois le plafond de libellés nommés atteint. */
export const OTHER_COUNTRY_LABEL = '__other__';

let loggedCountries = new Set<string>();

/**
 * Faut-il journaliser CE candidat ? Vrai une seule fois par code pays et par
 * fenêtre, dans la limite de {@link MAX_LOGGED_COUNTRIES} codes distincts.
 *
 * Appeler cette fonction CONSOMME l'autorisation : elle a un effet de bord
 * assumé, pour que l'appelant ne puisse pas journaliser deux fois par mégarde.
 */
export function shouldLogUnknownIbanCountry(countryCode: string): boolean {
  if (loggedCountries.has(countryCode) || loggedCountries.size >= MAX_LOGGED_COUNTRIES) {
    return false;
  }

  loggedCountries.add(countryCode);

  return true;
}

/** Un IBAN a été masqué ; `checksumValid` qualifie, il ne conditionne pas. */
export function recordIbanMasked(checksumValid: boolean): void {
  if (checksumValid) {
    metrics.ibanMasked.checksumValid += 1;
  } else {
    metrics.ibanMasked.checksumInvalid += 1;
  }
}

/**
 * Un candidat IBAN d'un pays hors registre a été rencontré (et NON masqué).
 *
 * Chaque occurrence compte. Seule la RÉPARTITION est bornée : passé
 * {@link MAX_METRIC_COUNTRIES} libellés nommés, les codes suivants tombent dans
 * {@link OTHER_COUNTRY_LABEL} — le total, lui, reste exact.
 */
export function recordUnknownIbanCountry(countryCode: string): void {
  const known = Object.prototype.hasOwnProperty.call(metrics.unknownCountryCode, countryCode);
  const saturated = Object.keys(metrics.unknownCountryCode).length >= MAX_METRIC_COUNTRIES;
  const label = known || !saturated ? countryCode : OTHER_COUNTRY_LABEL;

  metrics.unknownCountryCode[label] = (metrics.unknownCountryCode[label] ?? 0) + 1;
}

/** Instantané immuable — pour l'exposition Prometheus et les tests. */
export function snapshotRemixPiiMetrics(): RemixPiiMetrics {
  return {
    ibanMasked: { ...metrics.ibanMasked },
    unknownCountryCode: { ...metrics.unknownCountryCode },
  };
}

/** Remise à zéro (tests, et rotation d'une fenêtre d'observation). */
export function resetRemixPiiMetrics(): void {
  metrics = emptyMetrics();
  loggedCountries = new Set<string>();
}

/**
 * Rendu texte façon Prometheus — `iban_masked{checksum_valid="false"} 3`,
 * `iban_unknown_country_code{country="ZZ"} 1`.
 */
export function formatRemixPiiMetrics(): string {
  const lines = [
    `remix_pii_iban_masked{checksum_valid="true"} ${metrics.ibanMasked.checksumValid}`,
    `remix_pii_iban_masked{checksum_valid="false"} ${metrics.ibanMasked.checksumInvalid}`,
  ];

  for (const [country, count] of Object.entries(metrics.unknownCountryCode).sort()) {
    lines.push(`remix_pii_iban_unknown_country_code{country="${country}"} ${count}`);
  }

  return lines.join('\n');
}
