import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDeploymentUrl } from './deployments.js';
import {
  accessConfigFromMetadata,
  accessCookieName,
  computeAccessToken,
  deriveDeploymentAccessSecret,
  isAccessTokenValid,
  verifyAccessTokenSignature,
} from './deployment-access.js';

describe('buildDeploymentUrl (P104 gated → API origin, public → dedicated)', () => {
  const prev = process.env.PREVIEW_DOMAIN;
  const prevBase = process.env.STATIC_DEPLOY_BASE_URL;
  beforeEach(() => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.test';
    process.env.STATIC_DEPLOY_BASE_URL = 'https://api.e-code.test';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.PREVIEW_DOMAIN;
    else process.env.PREVIEW_DOMAIN = prev;
    if (prevBase === undefined) delete process.env.STATIC_DEPLOY_BASE_URL;
    else process.env.STATIC_DEPLOY_BASE_URL = prevBase;
  });

  const project = { id: 'p1', slug: 'p1', organizationId: 'o1' } as any;
  const dep = (metadata: unknown) =>
    ({ id: 'abcdef123456', provider: 'static', environment: 'preview', status: 'READY', metadata } as any);

  it('public static → dedicated s-<id> origin', () => {
    expect(buildDeploymentUrl(project, dep({}))).toBe('https://s-abcdef123456.preview.e-code.test/');
  });

  it('password-protected static → API-origin canonical URL', () => {
    const url = buildDeploymentUrl(project, dep({ access: { mode: 'password', passwordHash: 'h' } }));
    expect(url).toBe('https://api.e-code.test/static-deployments/abcdef123456/');
  });

  it('LOCKED (password, missing hash) also → API-origin (never advertises a public URL)', () => {
    const url = buildDeploymentUrl(project, dep({ access: { mode: 'password' } }));
    expect(url).toBe('https://api.e-code.test/static-deployments/abcdef123456/');
  });
});

describe('accessConfigFromMetadata', () => {
  it('defaults to public for empty/missing metadata', () => {
    expect(accessConfigFromMetadata(undefined).mode).toBe('public');
    expect(accessConfigFromMetadata({}).mode).toBe('public');
    expect(accessConfigFromMetadata({ access: null }).mode).toBe('public');
  });

  it('reads a password config', () => {
    expect(accessConfigFromMetadata({ access: { mode: 'password', passwordHash: 'h' } })).toEqual({
      mode: 'password',
      passwordHash: 'h',
    });
  });

  it('SEC-1: a password config with a missing/empty hash FAILS CLOSED to locked — never public', () => {
    expect(accessConfigFromMetadata({ access: { mode: 'password' } }).mode).toBe('locked');
    expect(accessConfigFromMetadata({ access: { mode: 'password', passwordHash: '' } }).mode).toBe('locked');
    expect(accessConfigFromMetadata({ access: { mode: 'password', passwordHash: 123 } }).mode).toBe('locked');
  });

  it('reads an EXPLICIT public config as public', () => {
    // L'ouverture doit être reconnue positivement, pas obtenue par défaut.
    expect(accessConfigFromMetadata({ access: { mode: 'public' } }).mode).toBe('public');
  });

  /*
   * SEC-1b — le fail-open que le contre-audit a trouvé.
   *
   * L'ancienne forme était `if (mode === 'password') {…} return public` : PUBLIC
   * servait de repli à tout état non reconnu. Ces cas ne sont pas théoriques —
   * `locked` en fait partie, donc la décision fail-closed de SEC-1 ne survivait
   * même pas à son propre aller-retour de persistance.
   */
  describe('SEC-1b: an UNRECOGNISED access config fails closed to locked — never public', () => {
    const unknownModes = [
      'private',
      'locked', // ← relu depuis la base : l'ancien code le rouvrait en public
      '123',
      'password-protected', // proche de `password`, mais PAS `password`
      'PASSWORD', // la casse ne doit pas ouvrir
      'future-mode-not-yet-known',
      '',
    ];

    for (const mode of unknownModes) {
      it(`mode ${JSON.stringify(mode)} → locked`, () => {
        const config = accessConfigFromMetadata({ access: { mode } });

        expect(config.mode).toBe('locked');
        expect(config.mode).not.toBe('public');
        // Un état verrouillé ne doit jamais transporter de secret exploitable.
        expect(config.passwordHash).toBeUndefined();
      });
    }

    it('a non-string mode → locked', () => {
      for (const mode of [123, true, null, {}, [], undefined]) {
        expect(accessConfigFromMetadata({ access: { mode } }).mode, JSON.stringify(mode)).toBe('locked');
      }
    });

    it('an access block that is present but not an object → locked', () => {
      /*
       * `{ access: 'password' }` est le piège : quelqu'un a écrit quelque chose,
       * mais pas la forme attendue. Le traiter comme « absent » le rendrait
       * public.
       */
      for (const access of ['password', 'public', 42, true, []]) {
        expect(accessConfigFromMetadata({ access }).mode, JSON.stringify(access)).toBe('locked');
      }
    });

    it('an EMPTY access block (partially applied migration) → locked', () => {
      expect(accessConfigFromMetadata({ access: {} }).mode).toBe('locked');
      expect(accessConfigFromMetadata({ access: { passwordHash: 'h' } }).mode).toBe('locked');
    });

    it('the ONLY inputs that yield public are: no access at all, or an explicit public mode', () => {
      /*
       * Contrôle de couverture : on énumère un échantillon large et on vérifie
       * que l'ensemble des entrées « publiques » est exactement celui attendu.
       * Sans lui, ajouter un nouveau chemin ouvrant passerait inaperçu.
       */
      const inputs: Array<{ label: string; metadata: unknown }> = [
        { label: 'undefined', metadata: undefined },
        { label: 'null', metadata: null },
        { label: '{}', metadata: {} },
        { label: 'access: null', metadata: { access: null } },
        { label: 'access: undefined', metadata: { access: undefined } },
        { label: 'mode public', metadata: { access: { mode: 'public' } } },
        { label: 'mode password + hash', metadata: { access: { mode: 'password', passwordHash: 'h' } } },
        { label: 'mode password sans hash', metadata: { access: { mode: 'password' } } },
        { label: 'mode private', metadata: { access: { mode: 'private' } } },
        { label: 'mode locked', metadata: { access: { mode: 'locked' } } },
        { label: 'access chaîne', metadata: { access: 'password' } },
        { label: 'access vide', metadata: { access: {} } },
      ];

      const publicOnes = inputs
        .filter((i) => accessConfigFromMetadata(i.metadata).mode === 'public')
        .map((i) => i.label);

      expect(publicOnes.sort()).toEqual(
        ['undefined', 'null', '{}', 'access: null', 'access: undefined', 'mode public'].sort(),
      );
    });
  });
});

describe('deriveDeploymentAccessSecret (SEC-6 dedicated key)', () => {
  it('is deterministic and DISTINCT from the base secret', () => {
    const base = 'platform-base-secret';
    const a = deriveDeploymentAccessSecret(base);
    expect(deriveDeploymentAccessSecret(base)).toBe(a);
    expect(a).not.toBe(base);
    expect(deriveDeploymentAccessSecret('other')).not.toBe(a);
  });
});

describe('computeAccessToken / isAccessTokenValid (SEC-5 expiry, SEC-6 rotation)', () => {
  const secret = 'dep-secret';
  const exp = 1_900_000_000_000; // far future
  const tok = computeAccessToken(secret, 'd1', 'hash', exp);

  it('token embeds the expiry and is payload.sig shaped', () => {
    expect(tok).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyAccessTokenSignature([secret], 'd1', 'hash', tok)).toBe(exp);
  });

  it('accepts a valid, unexpired token', () => {
    expect(isAccessTokenValid([secret], 'd1', 'hash', tok, exp - 1)).toBe(true);
  });

  it('SEC-5: rejects an EXPIRED (but authentically signed) token — server-side check', () => {
    expect(verifyAccessTokenSignature([secret], 'd1', 'hash', tok)).toBe(exp); // signature is authentic
    expect(isAccessTokenValid([secret], 'd1', 'hash', tok, exp)).toBe(false); // but now >= exp
    expect(isAccessTokenValid([secret], 'd1', 'hash', tok, exp + 1)).toBe(false);
  });

  it('rejects wrong secret, other deployment, rotated password', () => {
    expect(isAccessTokenValid(['nope'], 'd1', 'hash', tok, exp - 1)).toBe(false);
    expect(isAccessTokenValid([secret], 'd2', 'hash', tok, exp - 1)).toBe(false);
    expect(isAccessTokenValid([secret], 'd1', 'hash2', tok, exp - 1)).toBe(false);
  });

  it('SEC-6: accepts a token signed by a ROTATED (old) secret in the accept list', () => {
    const oldTok = computeAccessToken('old-secret', 'd1', 'hash', exp);
    // mint list is [new, old]; an old cookie still verifies during rotation
    expect(isAccessTokenValid(['new-secret', 'old-secret'], 'd1', 'hash', oldTok, exp - 1)).toBe(true);
    expect(isAccessTokenValid(['new-secret'], 'd1', 'hash', oldTok, exp - 1)).toBe(false);
  });

  it('rejects absent / malformed / tampered tokens', () => {
    expect(isAccessTokenValid([secret], 'd1', 'hash', undefined, exp - 1)).toBe(false);
    expect(isAccessTokenValid([secret], 'd1', 'hash', '', exp - 1)).toBe(false);
    expect(isAccessTokenValid([secret], 'd1', 'hash', 'garbage', exp - 1)).toBe(false);
    expect(isAccessTokenValid([secret], 'd1', 'hash', `${tok}x`, exp - 1)).toBe(false);
    // tamper the expiry payload (forge a later expiry) → signature no longer matches
    const forged = `${Buffer.from(String(exp + 10_000)).toString('base64url')}.${tok.split('.')[1]}`;
    expect(isAccessTokenValid([secret], 'd1', 'hash', forged, exp + 5_000)).toBe(false);
  });
});

describe('accessCookieName', () => {
  it('is per-deployment', () => {
    expect(accessCookieName('abc')).toBe('vc_dep_abc');
    expect(accessCookieName('abc')).not.toBe(accessCookieName('abd'));
  });
});
