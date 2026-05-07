import { describe, expect, it } from 'vitest';
import { createSecurityHeaders } from './security';

describe('createSecurityHeaders', () => {
  it('does not allow inline or eval scripts in CSP', () => {
    const csp = createSecurityHeaders()['Content-Security-Policy'];

    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptSrc).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});
