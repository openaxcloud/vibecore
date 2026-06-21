import { describe, expect, it } from 'vitest';
import { TestApiStore } from './test-api-store.js';

/*
 * Admin self-service OAuth provider config (GitHub/GitLab/Bitbucket): the store
 * contract that backs `GET/POST /admin/connectors/oauth` and the DB-first
 * `connectorCredentialsFor` resolver. The encrypted secret must round-trip but
 * never surface in the masked write-result (only `hasSecret`).
 */
describe('connector OAuth admin config (store)', () => {
  it('defaults to disabled / unconfigured before any admin write', async () => {
    const store = new TestApiStore();
    const cfg = await store.getConnectorOAuthCatalog('github');

    expect(cfg?.enabled).toBe(false);
    expect(cfg?.clientId).toBeNull();
    expect(cfg?.clientSecretEnc).toBeNull();
  });

  it('stores client id + encrypted secret and masks the secret in the result', async () => {
    const store = new TestApiStore();
    const result = await store.upsertConnectorOAuthConfig({
      provider: 'github',
      clientId: 'gh-client-id',
      clientSecretEnc: 'enc:super-secret',
      enabled: true,
    });

    expect(result).toEqual({ provider: 'github', enabled: true, clientId: 'gh-client-id', hasSecret: true });
    // The write-result must never carry the secret material.
    expect(JSON.stringify(result)).not.toContain('super-secret');

    const stored = await store.getConnectorOAuthCatalog('github');
    expect(stored?.enabled).toBe(true);
    expect(stored?.clientId).toBe('gh-client-id');
    expect(stored?.clientSecretEnc).toBe('enc:super-secret');
  });

  it('updates fields independently — toggling enabled keeps id + secret', async () => {
    const store = new TestApiStore();
    await store.upsertConnectorOAuthConfig({
      provider: 'gitlab',
      clientId: 'gl-id',
      clientSecretEnc: 'enc:gl',
      enabled: true,
    });

    const toggled = await store.upsertConnectorOAuthConfig({ provider: 'gitlab', enabled: false });

    expect(toggled.enabled).toBe(false);
    expect(toggled.clientId).toBe('gl-id');
    expect(toggled.hasSecret).toBe(true);
  });

  it('clearing the client id does not wipe the stored secret', async () => {
    const store = new TestApiStore();
    await store.upsertConnectorOAuthConfig({
      provider: 'bitbucket',
      clientId: 'bb-id',
      clientSecretEnc: 'enc:bb',
      enabled: true,
    });

    const cleared = await store.upsertConnectorOAuthConfig({ provider: 'bitbucket', clientId: null });

    expect(cleared.clientId).toBeNull();
    expect(cleared.hasSecret).toBe(true);
  });
});
