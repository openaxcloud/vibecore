import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Measured on a real project in the audit environment, mobile 390: the Object
 * Storage panel answered `200` three times while the probe waited, then failed,
 * and showed one static line — "Checking Object Storage…" — for 45 seconds
 * before saying anything at all. Nothing moved and no time was shown, so the
 * panel read as frozen rather than busy.
 *
 * The waiting state now has to carry three things. A source guard is the right
 * shape: each is a specific element of that branch, and naming the missing one
 * is more useful than a render test that only says "no spinner".
 */
const BASE_CHAT = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const CATALOG = readFileSync(join(__dirname, '..', '..', 'lib', 'i18n', 'catalogs', 'base-chat-ast.ts'), 'utf8');

/** The `enabled === null` branch — the panel's waiting state. */
const WAITING_STATE = (() => {
  const start = BASE_CHAT.indexOf("{t('chat.copy.checkingObjectStorage_959b2900')}");

  expect(start, 'the waiting state was not found').toBeGreaterThan(-1);

  return BASE_CHAT.slice(start - 900, start + 700);
})();

describe('the Object Storage probe shows that it is still working', () => {
  it('animates instead of sitting on a static line', () => {
    expect(WAITING_STATE).toContain('i-svg-spinners:3-dots-fade');
  });

  it('announces itself to assistive technology as a live status', () => {
    expect(WAITING_STATE).toContain('aria-live="polite"');
  });

  it('counts the seconds once the wait stops being instant', () => {
    expect(WAITING_STATE).toMatch(/checkSeconds >= 5/);
    expect(WAITING_STATE).toContain('baseChatAst.storage.checkingElapsed');
  });

  it('says the first probe can be slow, before a user assumes it is broken', () => {
    expect(WAITING_STATE).toMatch(/checkSeconds >= 15/);
    expect(WAITING_STATE).toContain('baseChatAst.storage.checkingSlow');
  });

  it('stops the timer as soon as the answer lands', () => {
    const effect = BASE_CHAT.slice(BASE_CHAT.indexOf('const [checkSeconds, setCheckSeconds]'));

    expect(effect.slice(0, 500)).toContain('if (enabled !== null)');
    expect(effect.slice(0, 500)).toContain('clearInterval');
  });

  it('ships the new copy in both catalogues', () => {
    expect(CATALOG.match(/'baseChatAst\.storage\.checkingSlow':/g)).toHaveLength(2);
  });
});
