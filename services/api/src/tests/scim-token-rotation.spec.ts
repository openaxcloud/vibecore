import { describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

/**
 * F16 — SCIM token 24h dual-valid rotation. Rotation mints a new bearer IN PLACE
 * (same id), keeps the previous hash valid for 24h, then the previous hash stops
 * authenticating. Tested at the store seam (the endpoint just wraps this + reauth).
 */
describe('F16 SCIM token dual-valid rotation', () => {
  async function seed() {
    const store = new TestApiStore();
    const created = await store.createScimToken({ organizationId: 'org-1', name: 'idp', token: 'OLD-TOKEN' });
    return { store, created };
  }

  it('the original token authenticates before any rotation', async () => {
    const { store } = await seed();
    expect((await store.findScimToken('OLD-TOKEN'))?.name).toBe('idp');
    expect(await store.findScimToken('WRONG')).toBeUndefined();
  });

  it('after rotation BOTH the new and the old token authenticate (same id, zero-downtime)', async () => {
    const { store, created } = await seed();

    const rotated = await store.rotateScimToken(created.id, 'NEW-TOKEN');
    expect(rotated?.id).toBe(created.id); // in place — same token id

    expect((await store.findScimToken('NEW-TOKEN'))?.id).toBe(created.id);
    expect((await store.findScimToken('OLD-TOKEN'))?.id).toBe(created.id); // still valid within 24h
  });

  it('the OLD token stops authenticating after the 24h window, the NEW token keeps working', async () => {
    const { store, created } = await seed();
    await store.rotateScimToken(created.id, 'NEW-TOKEN');

    // Simulate 25h elapsed since the rotation.
    const record = [...store.scimTokens.values()].find((r) => r.id === created.id)!;
    record.rotatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    expect(await store.findScimToken('OLD-TOKEN')).toBeUndefined(); // window closed
    expect((await store.findScimToken('NEW-TOKEN'))?.id).toBe(created.id); // current hash unaffected
  });

  it('a second rotation supersedes the first previous hash (only the most recent old token gets the window)', async () => {
    const { store, created } = await seed();
    await store.rotateScimToken(created.id, 'TOKEN-2');
    await store.rotateScimToken(created.id, 'TOKEN-3');

    expect((await store.findScimToken('TOKEN-3'))?.id).toBe(created.id); // current
    expect((await store.findScimToken('TOKEN-2'))?.id).toBe(created.id); // immediate previous, still in window
    expect(await store.findScimToken('OLD-TOKEN')).toBeUndefined(); // two rotations back — no longer the previous hash
  });

  it('rotating a non-existent token id returns undefined', async () => {
    const { store } = await seed();
    expect(await store.rotateScimToken('does-not-exist', 'X')).toBeUndefined();
  });
});
