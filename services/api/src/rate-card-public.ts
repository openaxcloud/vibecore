import { appPublicCopy, type AppPublicCopyKey } from './app-public-copy.js';
import type { MachineSizeError } from './rate-card-service.js';
import type { TransactionalLocale } from './transactional-i18n.js';

const machineSizeCopyKey = {
  MACHINE_SIZE_UNKNOWN: 'MACHINE_SIZE_UNKNOWN',
  MACHINE_SIZE_PLAN: 'MACHINE_SIZE_PLAN_UNAVAILABLE',
  MACHINE_SIZE_CAPACITY: 'MACHINE_SIZE_CAPACITY_UNAVAILABLE',
} as const satisfies Record<MachineSizeError['code'], AppPublicCopyKey>;

export function publicMachineSizeError(error: MachineSizeError, locale: TransactionalLocale) {
  return {
    error: appPublicCopy(machineSizeCopyKey[error.code], locale, error.values),
    code: error.code,
  } as const;
}
