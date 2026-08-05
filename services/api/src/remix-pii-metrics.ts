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
   */
  unknownCountryCode: Record<string, number>;
}

function emptyMetrics(): RemixPiiMetrics {
  return { ibanMasked: { checksumValid: 0, checksumInvalid: 0 }, unknownCountryCode: {} };
}

let metrics: RemixPiiMetrics = emptyMetrics();

/** Un IBAN a été masqué ; `checksumValid` qualifie, il ne conditionne pas. */
export function recordIbanMasked(checksumValid: boolean): void {
  if (checksumValid) {
    metrics.ibanMasked.checksumValid += 1;
  } else {
    metrics.ibanMasked.checksumInvalid += 1;
  }
}

/** Un candidat IBAN d'un pays hors registre a été rencontré (et NON masqué). */
export function recordUnknownIbanCountry(countryCode: string): void {
  metrics.unknownCountryCode[countryCode] = (metrics.unknownCountryCode[countryCode] ?? 0) + 1;
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
