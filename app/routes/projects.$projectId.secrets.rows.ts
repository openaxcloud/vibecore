import {
  formatProjectSecretsCopy,
  getProjectSecretsCopy,
  resolveProjectSecretsLanguage,
  type ProjectSecretsCopy,
} from '~/lib/i18n/catalogs/project-secrets';
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
export function secretDetail(
  secret: SecretRecord,
  language?: string | null,
  suppliedCopy?: ProjectSecretsCopy,
): string {
  const resolvedLanguage = resolveProjectSecretsLanguage(language);
  const copy = suppliedCopy ?? getProjectSecretsCopy(resolvedLanguage);

  if (secret.updatedAt) {
    return formatProjectSecretsCopy(copy['projectSecrets.row.updated'], {
      date:
        formatUserAreaDateTime(secret.updatedAt, undefined, resolvedLanguage) ??
        copy['projectSecrets.row.dateUnavailable'],
    });
  }

  return copy['projectSecrets.row.saved'];
}

/*
 * Map raw secret records to display rows. When there are no secrets we surface a
 * single explanatory empty row; otherwise every secret becomes a deletable row.
 */
export function secretRows(
  secrets: SecretRecord[] | undefined | null,
  language?: string | null,
  suppliedCopy?: ProjectSecretsCopy,
): SecretRow[] {
  const resolvedLanguage = resolveProjectSecretsLanguage(language);
  const copy = suppliedCopy ?? getProjectSecretsCopy(resolvedLanguage);
  const list = secrets ?? [];

  if (list.length === 0) {
    return [
      {
        kind: 'empty',
        title: copy['projectSecrets.empty.title'],
        detail: copy['projectSecrets.empty.description'],
      },
    ];
  }

  return list.map((secret) => ({
    kind: 'secret',
    key: secret.key,
    detail: secretDetail(secret, resolvedLanguage, copy),
  }));
}
