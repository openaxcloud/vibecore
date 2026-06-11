import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('E-Code public theme wrappers', () => {
  it('renders shared marketing pages with the exact E-Code theme tokens instead of legacy vc wrappers', () => {
    const source = readFileSync(new URL('./EcodeMarketingPages.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-ecode-marketing-page');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('marketing-gradient');
    expect(source).toContain('container-responsive');
    expect(source).not.toContain('vc-marketing-page');
    expect(source).not.toContain('vc-marketing-page-hero');
  });

  it('renders compatibility surface pages with the same E-Code public shell tokens', () => {
    const source = readFileSync(new URL('./EcodeSurfacePages.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-ecode-surface-page');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('marketing-gradient');
    expect(source).toContain('container-responsive');
    expect(source).not.toContain('vc-surface-page');
    expect(source).not.toContain('vc-surface-hero');
  });
});
