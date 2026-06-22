import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | undefined;

/**
 * Build and start a NodeSDK instance.
 *
 * Extracted so the failure-handling in {@link startOpenTelemetry} can be tested
 * with an injectable factory. The factory defaults to the real OpenTelemetry SDK.
 */
export function initOpenTelemetry(
  factory: () => NodeSDK = () =>
    new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'vibecore-api',
      instrumentations: [getNodeAutoInstrumentations()],
    }),
): NodeSDK | undefined {
  /*
   * Constructing the SDK / auto-instrumentations and calling start() can throw
   * synchronously on a misconfigured exporter or a bad instrumentation package
   * (e.g. malformed OTEL_EXPORTER_OTLP_* / OTEL_TRACES_EXPORTER). Because this
   * runs at module top level in server.ts before the API is built, an unhandled
   * throw here would abort process startup entirely. Telemetry is best-effort:
   * log and continue with it disabled rather than failing the whole API boot.
   */
  try {
    const instance = factory();
    instance.start();

    return instance;
  } catch (error) {
    console.error('[telemetry] OpenTelemetry initialization failed; continuing without telemetry', error);
    return undefined;
  }
}

export function startOpenTelemetry() {
  if (sdk || process.env.OTEL_ENABLED === 'false') {
    return;
  }

  sdk = initOpenTelemetry();
}
