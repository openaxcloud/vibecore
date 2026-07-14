import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';

/*
 * Pure presentation logic for the dashboard Secrets page, extracted so the
 * empty-state / row-label decisions can be unit-tested without rendering React.
 */

export type SecretRecord = { id: string; key: string; createdAt?: string; updatedAt?: string };

export type SecretRow =
  | { kind: 'secret'; key: string; detail: string }
  | { kind: 'empty'; title: string; detail: string };

/* Build the detail line shown under a secret key. */
export function secretDetail(secret: SecretRecord): string {
  if (secret.updatedAt) {
    return `Encrypted, updated ${formatUserAreaDateTime(secret.updatedAt) ?? 'date unavailable'}`;
  }

  return 'Encrypted project secret';
}

/*
 * Map raw secret records to display rows. When there are no secrets we surface a
 * single explanatory empty row; otherwise every secret becomes a deletable row.
 */
export function secretRows(secrets: SecretRecord[] | undefined | null): SecretRow[] {
  const list = secrets ?? [];

  if (list.length === 0) {
    return [
      {
        kind: 'empty',
        title: 'No project secrets',
        detail: 'Secrets are encrypted and values are never listed in clear text.',
      },
    ];
  }

  return list.map((secret) => ({ kind: 'secret', key: secret.key, detail: secretDetail(secret) }));
}
