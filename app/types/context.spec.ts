import { describe, expect, it } from 'vitest';
import { classifyStreamError, streamErrorCodeMessages } from './context';

describe('classifyStreamError', () => {
  it('classifies generated JSON parse failures as invalid responses', () => {
    expect(classifyStreamError(new Error('Invalid JSON in package.json: Unexpected end of JSON input'))).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('keeps invalid JSON errors user-actionable instead of unknown', () => {
    const code = classifyStreamError(new Error('Unexpected end of JSON input'));

    expect(code).toBe('INVALID_RESPONSE');
    expect(streamErrorCodeMessages[code]).toContain('generated files');
  });

  it('classifies errors by numeric status when the message is opaque (fewer UNKNOWNs)', () => {
    expect(classifyStreamError({ message: '', status: 429 })).toBe('RATE_LIMIT');
    expect(classifyStreamError({ message: 'oops', statusCode: 401 })).toBe('AUTH_FAILED');
    expect(classifyStreamError({ message: '', statusCode: 502 })).toBe('NETWORK_ERROR');

    // AWS Bedrock-style metadata.
    expect(classifyStreamError({ message: '[UNKNOWN]', $metadata: { httpStatusCode: 503 } })).toBe('NETWORK_ERROR');
  });

  it('classifies transient connection codes as network errors', () => {
    expect(classifyStreamError({ message: 'socket hang up', code: 'ECONNRESET' })).toBe('NETWORK_ERROR');
    expect(classifyStreamError({ message: '', code: 'ETIMEDOUT' })).toBe('NETWORK_ERROR');
  });

  it('still returns UNKNOWN for a truly unclassifiable error', () => {
    expect(classifyStreamError({ message: 'something weird' })).toBe('UNKNOWN');
  });
});
