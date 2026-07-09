import { describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

/*
 * Store contract for the admin-managed platform provider API key (apiKeyEnc):
 * a round-trip through upsertProviderConfig must persist the encrypted key,
 * leave it untouched on an unrelated update (conditional spread), and clear it
 * on an explicit null (rotate off) — the exact semantics the write-only admin
 * endpoints in COMMIT 2 rely on. The stored value is the *ciphertext*; the store
 * never decrypts.
 */
describe('provider API key store (apiKeyEnc)', () => {
  it('has no apiKeyEnc before any write (env-fallback path)', async () => {
    const store = new TestApiStore();
    const row = await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: true });

    expect(row.apiKeyEnc).toBeUndefined();
  });

  it('persists an encrypted key and reads it back', async () => {
    const store = new TestApiStore();
    await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: true });

    const saved = await store.upsertProviderConfig({
      provider: 'OpenAI',
      displayName: 'OpenAI',
      apiKeyEnc: 'v1.iv.tag.cipher',
    });
    expect(saved.apiKeyEnc).toBe('v1.iv.tag.cipher');

    const read = (await store.listProviderConfigs()).find((p) => p.provider === 'OpenAI');
    expect(read?.apiKeyEnc).toBe('v1.iv.tag.cipher');
  });

  it('leaves the stored key unchanged when apiKeyEnc is omitted (undefined)', async () => {
    const store = new TestApiStore();
    await store.upsertProviderConfig({ provider: 'Anthropic', displayName: 'Anthropic', apiKeyEnc: 'v1.enc.keep' });

    // An unrelated update (toggle enabled) must not wipe the key.
    const toggled = await store.upsertProviderConfig({ provider: 'Anthropic', displayName: 'Anthropic', enabled: false });
    expect(toggled.apiKeyEnc).toBe('v1.enc.keep');
    expect(toggled.enabled).toBe(false);
  });

  it('clears the stored key on an explicit null (rotate off)', async () => {
    const store = new TestApiStore();
    await store.upsertProviderConfig({ provider: 'Anthropic', displayName: 'Anthropic', apiKeyEnc: 'v1.enc.keep' });

    const cleared = await store.upsertProviderConfig({
      provider: 'Anthropic',
      displayName: 'Anthropic',
      apiKeyEnc: null,
    });
    expect(cleared.apiKeyEnc).toBeUndefined();
  });

  it('baseUrl follows the same undefined=keep / null=clear contract', async () => {
    const store = new TestApiStore();
    await store.upsertProviderConfig({ provider: 'xAI', displayName: 'xAI', baseUrl: 'https://api.x.ai/v1' });

    const kept = await store.upsertProviderConfig({ provider: 'xAI', displayName: 'xAI', enabled: true });
    expect(kept.baseUrl).toBe('https://api.x.ai/v1');

    const cleared = await store.upsertProviderConfig({ provider: 'xAI', displayName: 'xAI', baseUrl: null });
    expect(cleared.baseUrl).toBeUndefined();
  });
});
