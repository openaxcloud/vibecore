import { appPublicCopy, type AppPublicCopyKey } from '../../app-public-copy.js';
import type { TransactionalLocale } from '../../transactional-i18n.js';
import type { ConnectorApiKeyTestResult, ConnectorProviderError } from './types.js';

export type ConnectorPublicErrorCode = ConnectorProviderError['code'] | NonNullable<ConnectorApiKeyTestResult['code']>;

const publicCopyKeyByCode: Readonly<Record<ConnectorPublicErrorCode, AppPublicCopyKey>> = Object.freeze({
  API_KEY_EXPIRED: 'CONNECTOR_API_KEY_EXPIRED',
  API_KEY_INSUFFICIENT_SCOPE: 'CONNECTOR_API_KEY_INSUFFICIENT_SCOPE',
  API_KEY_INVALID: 'CONNECTOR_API_KEY_INVALID',
  PROVIDER_RESPONSE_MALFORMED: 'CONNECTOR_PROVIDER_RESPONSE_MALFORMED',
  PROVIDER_TOKEN_EXCHANGE_FAILED: 'CONNECTOR_PROVIDER_TOKEN_EXCHANGE_FAILED',
  PROVIDER_UNREACHABLE: 'CONNECTOR_PROVIDER_UNREACHABLE',
  PROVIDER_UNSUPPORTED_OPERATION: 'CONNECTOR_PROVIDER_UNSUPPORTED_OPERATION',
  PROVIDER_USER_INFO_FAILED: 'CONNECTOR_PROVIDER_USER_INFO_FAILED',
});

/**
 * Resolve stable, backend-owned connector copy. Provider responses and network
 * exception messages are deliberately not accepted by this function, so they
 * cannot cross the public API boundary in either locale.
 */
export function connectorPublicErrorMessage(input: {
  code: ConnectorPublicErrorCode;
  locale: TransactionalLocale;
}): string {
  const key = publicCopyKeyByCode[input.code] ?? 'CONNECTOR_PROVIDER_RESPONSE_MALFORMED';
  return appPublicCopy(key, input.locale);
}

export function connectorPublicErrorCodes(): readonly ConnectorPublicErrorCode[] {
  return Object.freeze(Object.keys(publicCopyKeyByCode) as ConnectorPublicErrorCode[]);
}
