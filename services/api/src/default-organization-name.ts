import { appPublicCopy } from './app-public-copy.js';
import type { TransactionalLocale } from './transactional-i18n.js';

/**
 * UIB-05 — nom de l'organisation créée d'office pour un compte neuf.
 *
 * Mesuré le 2026-09-30 : une inscription française sans nom d'organisation
 * donnait « Parcours UI bureau's Organization », affiché dès la première minute
 * dans le fil d'Ariane de l'IDE. Le nom suit désormais la langue du compte.
 *
 * Français : élision devant une voyelle ou un h (« Organisation d’Ada »).
 */
const ELISION = /^[aeiouyhàâäéèêëîïôöùûüÿæœ]/i;

export function defaultOrganizationName(owner: string, locale: TransactionalLocale): string {
  const trimmed = owner.trim();
  const name = appPublicCopy('DEFAULT_ORGANIZATION_NAME', locale, { owner: trimmed });

  return locale === 'fr' && ELISION.test(trimmed) ? name.replace(/^Organisation de /, 'Organisation d’') : name;
}
