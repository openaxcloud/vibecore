import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('app/styles/index.scss', 'utf8');
const rule = (selector: string) => stylesheet.slice(stylesheet.indexOf(`${selector} {`)).split('}')[0];

describe('Secrets floating menu at native zoom', () => {
  it('bounds the measured menu to the viewport with an 8px gutter and reachable overflowing actions', () => {
    const menu = rule('.bolt-secrets-menu');
    expect(menu).toContain('min-width: min(220px, calc(100vw - 16px))');
    expect(menu).toContain('max-width: calc(100vw - 16px)');
    expect(menu).toContain('max-height: calc(100dvh - 16px)');
    expect(menu).toContain('overflow-y: auto');
    expect(menu).toContain('overflow-wrap: anywhere');
  });

  it('allows translated actions to wrap without reducing their existing target height', () => {
    const item = rule('.bolt-secrets-menu-item');
    expect(item).toContain('min-height: 40px');
    expect(item).toContain('height: auto');
  });
});
