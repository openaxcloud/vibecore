import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk: NodeSDK | undefined;

export function startOpenTelemetry() {
  if (sdk || process.env.OTEL_ENABLED === 'false') {
    return;
  }

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'vibecore-api',
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}
