import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

describe('runtime E-Code branding', () => {
  it('removes the upstream landing tagline from the empty chat surface', () => {
    const chat = source('app/components/chat/BaseChat.tsx');

    expect(chat).toContain('Turn ideas into working software');
    expect(chat).not.toContain('Where ideas begin');
  });

  it('identifies E-Code in network and diagnostic surfaces', () => {
    expect(source('app/lib/hooks/useGit.ts')).toContain("'User-Agent': 'E-Code'");
    expect(source('app/routes/api.bug-report.ts')).toContain('`- E-Code: ${data.environmentInfo.boltVersion}\\n`');
    expect(source('app/lib/api/updates.ts')).toContain(
      'https://raw.githubusercontent.com/openaxcloud/vibecore/main/package.json',
    );
    expect(source('scripts/update.sh')).toContain('Starting E-Code update process');
    expect(source('scripts/update.sh')).toContain('https://api.github.com/repos/openaxcloud/vibecore/releases/latest');
    expect(source('scripts/update.sh')).not.toContain('stackblitz-labs/bolt.diy');
  });
});
