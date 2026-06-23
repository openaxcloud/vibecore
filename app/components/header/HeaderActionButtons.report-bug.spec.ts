import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from '~/components/@settings/core/account-menu-links';

const source = readFileSync(fileURLToPath(new URL('./HeaderActionButtons.client.tsx', import.meta.url)), 'utf8');

describe('HeaderActionButtons "Report Bug"', () => {
  it('no longer routes bug reports to the upstream bolt.diy issue tracker', () => {
    expect(source).not.toMatch(/stackblitz-labs\/bolt\.diy/i);
    expect(source).not.toMatch(/github\.com\/.+\/issues\/new/i);
    expect(source).not.toMatch(/bug_report\.yml/i);
  });

  it('points the button at the first-party E-Code bug-report destination', () => {
    /*
     * The button must reuse the shared account-menu link helper so it stays in
     * lockstep with the AvatarDropdown "Report Bug" fix.
     */
    expect(source).toContain('resolveAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug)');
    expect(ACCOUNT_MENU_LINKS.reportBug).toBe('/contact');
  });

  it('resolves to an on-origin E-Code URL at click time', () => {
    expect(resolveAccountMenuLink(ACCOUNT_MENU_LINKS.reportBug, 'https://app.e-code.ai')).toBe(
      'https://app.e-code.ai/contact',
    );
  });
});
