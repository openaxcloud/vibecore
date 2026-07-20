import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('Community Gallery live surface contract', () => {
  it('uses Gallery language in both public navigation shells and retires the Languages entry', () => {
    const navigationSources = [
      read('app/components/dashboard/SaaSLayout.tsx'),
      read('app/components/marketing/ecode-exact/EcodeExactShell.tsx'),
    ].join('\n');

    expect(navigationSources).toContain('Community Gallery');
    expect(navigationSources).toContain('Import Hub');
    expect(navigationSources).not.toMatch(/(?:title|label): 'Templates'/);
    expect(navigationSources).not.toMatch(/(?:title|label): 'Languages'/);
    expect(navigationSources).not.toContain("['Templates', '/templates'");
    expect(navigationSources).not.toContain("['Languages', '/templates/languages'");
  });

  it('does not advertise unverified Python, Go or Rust runtimes on the current landing runtime section', () => {
    const runtimeSection = read('app/components/marketing/ecode-exact/landing/sections/LandingLanguages.tsx');

    expect(runtimeSection).toContain('JavaScript and TypeScript, proven end to end');
    expect(runtimeSection).not.toMatch(/\b(?:Python|Go|Rust)\b/);
    expect(runtimeSection).not.toContain('all major frameworks');
  });

  it('keeps public Agent/runtime claims aligned to the currently validated web runtime', () => {
    const runtimeClaims = [
      read('app/components/marketing/EcodeProductMarketingPages.tsx'),
      read('app/components/marketing/ecode-exact/pages/AIAgent.tsx'),
      read('app/components/marketing/ecode-exact/pages/Mobile.tsx'),
      read('app/routes/api.ai.features.ts'),
      read('app/lib/marketing/ecode-public-runtime.server.ts'),
    ].join('\n');

    expect(runtimeClaims).not.toContain('100+ languages');
    expect(runtimeClaims).not.toContain('29+ languages');
    expect(runtimeClaims).not.toContain('Python services');
    expect(runtimeClaims).not.toContain('python-ml');
    expect(runtimeClaims).toContain('JavaScript');
    expect(runtimeClaims).toContain('TypeScript');
  });
});
