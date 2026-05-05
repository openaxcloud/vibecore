import { describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, importJWK, type JWK, type JWTVerifyGetKey } from 'jose';
import { assertOidcIdToken } from '../app.js';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = (await exportJWK(publicKey)) as JWK;
  publicJwk.kid = 'test-key-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const resolver: JWTVerifyGetKey = async () => importJWK(publicJwk, 'RS256');
  return { privateKey, resolver };
}

async function signIdToken(privateKey: Awaited<ReturnType<typeof setup>>['privateKey']) {
  return new SignJWT({ email: 'oidc@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer('https://idp.example.com/')
    .setAudience('vibecore-client')
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('assertOidcIdToken', () => {
  it('returns an empty payload when no JWKS resolver is configured', async () => {
    const result = await assertOidcIdToken('any.bogus.token');
    expect(result).toEqual({});
  });

  it('verifies a valid id_token against a JWKS resolver', async () => {
    const { privateKey, resolver } = await setup();
    const token = await signIdToken(privateKey);
    const payload = await assertOidcIdToken(token, {
      jwks: resolver,
      issuer: 'https://idp.example.com/',
      audience: 'vibecore-client',
    });
    expect(payload.email).toBe('oidc@example.com');
    expect(payload.sub).toBe('user-123');
  });

  it('rejects a token with the wrong issuer', async () => {
    const { privateKey, resolver } = await setup();
    const token = await signIdToken(privateKey);
    await expect(
      assertOidcIdToken(token, {
        jwks: resolver,
        issuer: 'https://attacker.example.com/',
        audience: 'vibecore-client',
      }),
    ).rejects.toMatchObject({ code: 'OIDC_ID_TOKEN_INVALID' });
  });

  it('rejects a token with a tampered signature', async () => {
    const { privateKey, resolver } = await setup();
    const token = await signIdToken(privateKey);
    const tampered = `${token.slice(0, -4)}AAAA`;
    await expect(
      assertOidcIdToken(tampered, {
        jwks: resolver,
        issuer: 'https://idp.example.com/',
        audience: 'vibecore-client',
      }),
    ).rejects.toMatchObject({ code: 'OIDC_ID_TOKEN_INVALID' });
  });
});
