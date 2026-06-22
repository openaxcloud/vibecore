import type { NodeSDK } from '@opentelemetry/sdk-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initOpenTelemetry } from '../telemetry.js';

describe('initOpenTelemetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the SDK and returns the instance on success', () => {
    const start = vi.fn();
    const fakeSdk = { start } as unknown as NodeSDK;

    const result = initOpenTelemetry(() => fakeSdk);

    expect(start).toHaveBeenCalledTimes(1);
    expect(result).toBe(fakeSdk);
  });

  it('does not throw when the SDK constructor throws (telemetry never aborts boot)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let result: NodeSDK | undefined;
    expect(() => {
      result = initOpenTelemetry(() => {
        throw new Error('malformed OTEL_EXPORTER_OTLP_ENDPOINT');
      });
    }).not.toThrow();

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not throw when sdk.start() throws (telemetry never aborts boot)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const start = vi.fn(() => {
      throw new Error('exporter connection refused');
    });

    const fakeSdk = { start } as unknown as NodeSDK;

    let result: NodeSDK | undefined;
    expect(() => {
      result = initOpenTelemetry(() => fakeSdk);
    }).not.toThrow();

    expect(start).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
