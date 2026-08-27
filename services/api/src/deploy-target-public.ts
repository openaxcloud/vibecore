import { appPublicCopy } from './app-public-copy.js';
import type { DeployTargetDetection } from './server-runtime-detect.js';
import type { TransactionalLocale } from './transactional-i18n.js';

export type PublicDeployTargetDetection = Readonly<{
  mode: 'server' | 'static' | 'unknown';
  framework: string;
  reason: string;
  reasonCode: 'WORKSPACE_PENDING' | 'DECLARED_RUN' | 'SERVER_DETECTED' | 'STATIC_DETECTED' | 'UNDETERMINED';
  error?: string;
  errorCode?: 'DEPLOY_TARGET_UNDETERMINED';
  pending: boolean;
}>;

export function publicPendingDeployTarget(locale: TransactionalLocale): PublicDeployTargetDetection {
  return {
    mode: 'unknown',
    framework: 'unknown',
    reason: appPublicCopy('DEPLOY_WORKSPACE_UNREACHABLE', locale),
    reasonCode: 'WORKSPACE_PENDING',
    pending: true,
  };
}

export function publicDeclaredDeployTarget(locale: TransactionalLocale): PublicDeployTargetDetection {
  return {
    mode: 'server',
    framework: 'custom',
    reason: appPublicCopy('DEPLOY_SERVER_DECLARED_CONFIG_NOTE', locale),
    reasonCode: 'DECLARED_RUN',
    pending: false,
  };
}

/**
 * Convert the runtime detector's internal diagnostics into a stable public
 * contract. Raw detector errors can contain implementation details and are
 * deliberately never serialized.
 */
export function publicDetectedDeployTarget(
  target: DeployTargetDetection,
  locale: TransactionalLocale,
): PublicDeployTargetDetection {
  if (target.mode === 'server') {
    return {
      mode: target.mode,
      framework: target.framework,
      reason: appPublicCopy('DEPLOY_TARGET_SERVER_DETECTED', locale, { framework: target.framework }),
      reasonCode: 'SERVER_DETECTED',
      pending: false,
    };
  }

  if (target.mode === 'static') {
    return {
      mode: target.mode,
      framework: target.framework,
      reason: appPublicCopy('DEPLOY_TARGET_STATIC_DETECTED', locale),
      reasonCode: 'STATIC_DETECTED',
      pending: false,
    };
  }

  const message = appPublicCopy('DEPLOY_TARGET_UNDETERMINED', locale);

  return {
    mode: 'unknown',
    framework: 'unknown',
    reason: message,
    reasonCode: 'UNDETERMINED',
    error: message,
    errorCode: 'DEPLOY_TARGET_UNDETERMINED',
    pending: false,
  };
}
