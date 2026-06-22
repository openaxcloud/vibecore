import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findReadmeAccuracyIssues, isReadmeAccurate } from './readme-accuracy.js';

const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url));

function loadReadme(): string {
  return readFileSync(README_PATH, 'utf8');
}

describe('preview-proxy README accuracy', () => {
  it('the shipped README is accurate (no stale claims, all live facts present)', () => {
    const issues = findReadmeAccuracyIssues(loadReadme());
    expect(issues).toEqual([]);
    expect(isReadmeAccurate(loadReadme())).toBe(true);
  });

  it('flags the old stale "exposes only /health" / "no production traffic" wording', () => {
    const stale = [
      '# @vibecore/preview-proxy',
      '',
      'This service is a deployable shell that exposes only `/health`. It is',
      'reserved for a future direct subdomain routing layer.',
      'It does not currently serve any production traffic.',
    ].join('\n');

    const issues = findReadmeAccuracyIssues(stale);
    const messages = issues.map((issue) => issue.message).join('\n');

    expect(isReadmeAccurate(stale)).toBe(false);
    expect(issues.some((issue) => issue.kind === 'stale-claim')).toBe(true);
    expect(messages).toContain('exposes only /health');
    expect(messages).toContain('does not currently serve any production traffic');
  });

  it('flags a README that hides the WebSocket/HMR known gap', () => {
    const noGap = [
      '# @vibecore/preview-proxy',
      '',
      'Production preview data plane with host-based routing.',
      'Tenant enforcement is gated by PREVIEW_PROXY_ENFORCE_TENANT.',
      'WebSocket reverse-proxying is fully supported.',
    ].join('\n');

    const issues = findReadmeAccuracyIssues(noGap);

    expect(isReadmeAccurate(noGap)).toBe(false);
    expect(issues.some((issue) => issue.kind === 'missing-fact')).toBe(true);
  });
});
