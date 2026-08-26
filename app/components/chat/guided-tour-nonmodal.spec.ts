import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseChat = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const styles = readFileSync(join(__dirname, '../../styles/index.scss'), 'utf8');

describe('IDE guided tour non-modal interaction contract', () => {
  it('lets pointer input reach the IDE behind the coachmark while its controls remain usable', () => {
    expect(baseChat).toContain('role="dialog" aria-modal="false"');

    expect(styles).toMatch(/\.bolt-project-guided-tour\s*\{[^}]*pointer-events:\s*none;/su);
    expect(styles).toMatch(/\.bolt-project-guided-tour-card\s*\{[^}]*pointer-events:\s*none;/su);
    expect(styles).toMatch(
      /\.bolt-project-guided-tour-card button\s*\{[^}]*min-height:\s*44px;[^}]*pointer-events:\s*auto;/su,
    );
  });
});
