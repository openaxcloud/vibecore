import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectionTestResult } from '~/components/@settings/shared/service-integration';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';

interface UseConnectionTestOptions {
  testEndpoint: string;
  serviceName: string;
  getUserIdentifier?: (data: any) => string;
}

type InternalConnectionTestResult =
  | { status: 'testing' }
  | { status: 'success'; account?: string; timestamp: number }
  | { status: 'error'; timestamp: number };

export function useConnectionTest({ testEndpoint, serviceName, getUserIdentifier }: UseConnectionTestOptions) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientRuntimeResidualCopy(language);
  const [internalResult, setInternalResult] = useState<InternalConnectionTestResult | null>(null);

  const testResult = useMemo<ConnectionTestResult | null>(() => {
    if (!internalResult) {
      return null;
    }

    if (internalResult.status === 'testing') {
      return {
        status: 'testing',
        message: copy['clientRuntime.connectionTest.testing'],
      };
    }

    if (internalResult.status === 'error') {
      return {
        status: 'error',
        message: formatClientRuntimeResidualCopy(copy['clientRuntime.connectionTest.failed'], {
          service: serviceName,
        }),
        timestamp: internalResult.timestamp,
      };
    }

    return {
      status: 'success',
      message: formatClientRuntimeResidualCopy(
        internalResult.account
          ? copy['clientRuntime.connectionTest.connectedAs']
          : copy['clientRuntime.connectionTest.connected'],
        {
          service: serviceName,
          ...(internalResult.account ? { account: internalResult.account } : {}),
        },
      ),
      timestamp: internalResult.timestamp,
    };
  }, [copy, internalResult, serviceName]);

  const testConnection = useCallback(async () => {
    setInternalResult({ status: 'testing' });

    try {
      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const userIdentifier = getUserIdentifier?.(data);

        setInternalResult({
          status: 'success',
          account: userIdentifier,
          timestamp: Date.now(),
        });
      } else {
        await response.json().catch(() => undefined);
        setInternalResult({
          status: 'error',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error(`Connection test failed for ${serviceName}:`, error);
      setInternalResult({
        status: 'error',
        timestamp: Date.now(),
      });
    }
  }, [getUserIdentifier, serviceName, testEndpoint]);

  const clearTestResult = useCallback(() => {
    setInternalResult(null);
  }, []);

  return {
    testResult,
    testConnection,
    clearTestResult,
    isTestingConnection: testResult?.status === 'testing',
  };
}
