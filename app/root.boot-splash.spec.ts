import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const rootSource = readFileSync(join(process.cwd(), 'app/root.tsx'), 'utf8');
const stylesSource = readFileSync(join(process.cwd(), 'app/styles/index.scss'), 'utf8');

describe('pre-hydration E-Code splash', () => {
  it('renders the self-contained SVG mark in both the app and IDE fallbacks', () => {
    expect(rootSource).toContain("import EcodeBootMark from './components/brand/EcodeBootMark'");
    expect(rootSource).toContain('data-ecode-boot-splash=""');
    expect(rootSource).toContain('data-ecode-ide-boot-splash=""');
    expect(rootSource.match(/<EcodeBootMark theme="auto"/g)).toHaveLength(3);
    expect(rootSource).not.toContain('bolt-app-boot-mark');
  });

  it('keeps server-rendered marketing content behind the removable splash overlay', () => {
    const branchStart = rootSource.indexOf('{serverRendersRoute ? (');
    const serverRenderedBranch = rootSource.slice(branchStart, rootSource.indexOf(') : (', branchStart));

    expect(serverRenderedBranch).toContain(
      '<ClientOnly fallback={<AppBootFallback ide={showIdeBootFallback} overlay />}>',
    );
    expect(serverRenderedBranch).toContain('{children}');
  });

  it('themes the splash surface without the old hard-coded orange square', () => {
    expect(stylesSource).toContain('.ecode-app-boot-splash');
    expect(stylesSource).toContain('background-color: var(--vc-ide-bg-app)');
    expect(stylesSource).not.toContain('.bolt-app-boot-mark');
    expect(stylesSource).not.toMatch(/\.ecode-app-boot-(?:logo|content)[\s\S]{0,300}linear-gradient\(135deg/);
  });
});
