/*
 * Canonical "Last updated" dates for the public legal documents. Frozen to a
 * single value per doc — NO auto-computed / machine-generated dates, so the
 * legal pages never silently drift to "today". Update a doc's entry
 * deliberately when that document actually changes.
 */
export const LEGAL_DATES = {
  terms: 'September 2025',
  privacy: 'September 2025',
  dpa: 'September 2025',
  commercialAgreement: 'September 2025',
  subprocessors: 'September 2025',
  studentDpa: 'September 2025',
  enforcement: 'September 2025',
  dataDeletion: 'September 2025',
  accountInactivity: 'September 2025',
} as const;

export type LegalDocKey = keyof typeof LEGAL_DATES;
