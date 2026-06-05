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
});
