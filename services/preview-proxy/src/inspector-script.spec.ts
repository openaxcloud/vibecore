import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSPECTOR_SCRIPT } from './inspector-script.js';

/*
 * The embedded INSPECTOR_SCRIPT_BASE64 blob in inspector-script.ts is supposed
 * to be the byte-for-byte canonical script from public/inspector-script.js
 * (see the regeneration command in that file's header comment). These tests
 * guard against the blob drifting out of sync with the canonical source — most
 * importantly the message-handler guard: a missing `event.data` /
 * `typeof event.data === 'object'` check throws a TypeError when any frame or
 * extension posts a null/primitive message into the preview iframe, which the
 * injected reporter then forwards into the IDE Console as spurious noise.
 */

const CANONICAL_PATH = fileURLToPath(new URL('../../../public/inspector-script.js', import.meta.url));

function loadCanonical(): string {
  return readFileSync(CANONICAL_PATH, 'utf8');
}

describe('preview-proxy inspector-script embedded blob', () => {
  it('decodes to the byte-for-byte canonical public/inspector-script.js', () => {
    expect(INSPECTOR_SCRIPT).toBe(loadCanonical());
  });

  it('guards the message listener against null/primitive event.data', () => {
    /*
     * Must dereference event.data.type only after an object guard, otherwise a
     * null/primitive postMessage throws "Cannot read properties of null".
     */
    expect(INSPECTOR_SCRIPT).toContain("typeof event.data === 'object'");
    expect(INSPECTOR_SCRIPT).toMatch(
      /event\.data\s*&&\s*typeof event\.data === 'object'\s*&&\s*event\.data\.type === 'INSPECTOR_ACTIVATE'/,
    );

    // The unguarded form must not be what actually ships.
    expect(INSPECTOR_SCRIPT).not.toMatch(
      /addEventListener\('message',\s*function\(event\)\s*\{\s*if \(event\.data\.type ===/,
    );
  });
});
