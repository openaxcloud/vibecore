import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

type App = Awaited<ReturnType<typeof buildApiApp>>;

const apps: App[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});

async function fixture() {
  vi.stubEnv('ENCRYPTION_SECRET', 'saml-parser-regression-test-only');

  const store = new TestApiStore();

  const app = await buildApiApp({
    store,
    emailProvider: {
      async send() {
        return undefined;
      },
    },
  });
  apps.push(app);

  const registration = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'owner@example.com',
      password: 'password123',
      name: 'SAML parser test',
      organizationName: 'XML DSIG regression',
    },
  });
  expect(registration.statusCode).toBe(201);

  const { token, organization } = registration.json<{ token: string; organization: { id: string } }>();
  const orgId = organization.id;
  await store.upsertSubscription({ organizationId: orgId, planKey: 'team', status: 'ACTIVE' });
  await store.createDomainVerification({ organizationId: orgId, domain: 'example.com', verificationToken: 'test' });
  await store.verifyDomain({ organizationId: orgId, domain: 'example.com' });

  const headers = { authorization: `Bearer ${token}` };

  const reauth = await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers,
    payload: { password: 'password123' },
  });
  expect(reauth.statusCode).toBe(200);

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const configured = await app.inject({
    method: 'PUT',
    url: `/orgs/${orgId}/sso/saml`,
    headers,
    payload: {
      entityId: 'urn:test:idp',
      ssoUrl: 'https://idp.example.com/sso',
      x509Certificate: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  });
  expect(configured.statusCode).toBe(200);

  const signer = new SignedXml({
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  signer.addReference({
    xpath: "//*[local-name()='Assertion']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });

  const xml =
    '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">' +
    '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="assertion-test">' +
    '<saml2:Subject><saml2:NameID>signed@example.com</saml2:NameID></saml2:Subject>' +
    `<saml2:Conditions NotOnOrAfter="${new Date(Date.now() + 60_000).toISOString()}">` +
    `<saml2:AudienceRestriction><saml2:Audience>vibecore:${orgId}</saml2:Audience></saml2:AudienceRestriction>` +
    '</saml2:Conditions></saml2:Assertion></samlp:Response>';
  signer.computeSignature(xml, { location: { reference: "//*[local-name()='Assertion']", action: 'append' } });

  const signed = signer.getSignedXml();

  const submit = (value: string) =>
    app.inject({
      method: 'POST',
      url: `/auth/saml/${orgId}/acs`,
      payload: { SAMLResponse: Buffer.from(value).toString('base64url') },
    });

  return { store, signed, submit };
}

describe('SAML XML-DSIG with the installed xmldom parser', () => {
  it('accepts a genuinely canonicalized signature and rejects a changed identity', async () => {
    const { store, signed, submit } = await fixture();

    // XML-DSIG signs SignedInfo, not raw Assertion bytes: the fallback RSA path cannot make this pass.
    const tampered = await submit(signed.replace('signed@example.com', 'intruder@example.com'));
    expect(tampered.statusCode).toBe(401);
    expect(tampered.json().code).toBe('SAML_INVALID_SIGNATURE');
    expect(await store.findUserByEmail('intruder@example.com')).toBeFalsy();

    const accepted = await submit(signed);
    expect(accepted.statusCode).toBe(200);
    expect(await store.findUserByEmail('signed@example.com')).toBeTruthy();

    const replay = await submit(signed);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('SAML_ASSERTION_REPLAYED');
  });

  it('rejects malformed, unsigned XML without creating an identity or returning 500', async () => {
    const { store, submit } = await fixture();
    const response = await submit('<Response><Assertion><Subject><NameID>intruder@example.com</NameID></Subject>');
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('SAML_INVALID_ASSERTION');
    expect(await store.findUserByEmail('intruder@example.com')).toBeFalsy();
  });
});
