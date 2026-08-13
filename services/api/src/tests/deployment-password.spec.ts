import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { staticDeploymentSnapshotDir } from '../deployments.js';
import { accessCookieName, computeAccessToken } from '../deployment-access.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

// A known dedicated secret so the tests can mint expired / valid tokens directly.
const DEP_SECRET = 'test-deployment-access-secret';

/*
 * P104 — password-protected deployments (endpoint wiring).
 *
 * Proves the real routes: owner sets a password, an anonymous visitor gets 401
 * (no bytes), the wrong password is refused, the right password sets a cookie
 * that unlocks the serve, and switching back to public re-opens it.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('password-protected static deployments (endpoint)', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevSecret = process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET;
  const prevActivation = process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'pwd-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = DEP_SECRET;

    /*
     * SEC-8: activation is gated by a DEPLOY-TIME interlock (see the SEC-8 block
     * on the /access route). These tests exercise the PRODUCT behaviour, which is
     * what prod looks like once the deploy workflow's drain barrier has armed the
     * flag — so arm it here. The interlock's own behaviour, including the fact
     * that enforcement does NOT depend on it, is proven in its own describe below.
     */
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    if (prevSecret === undefined) delete process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET;
    else process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = prevSecret;
    if (prevActivation === undefined) delete process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
    else process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = prevActivation;
    await rm(storageDir, { recursive: true, force: true });
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'pwd@example.com', password: 'password123', name: 'P', organizationName: 'P Org' },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'P Project' },
    });
    const projectId = (proj.json() as { project: { id: string } }).project.id;

    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
    });
    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>SECRET CONTENT</body>', 'utf8');

    return { app, store, auth, projectId, deploymentId: deployment.id };
  }

  const setAccess = (app: any, projectId: string, deploymentId: string, token: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  const serve = (app: any, deploymentId: string, cookies?: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/static-deployments/${deploymentId}/`, ...(cookies ? { cookies } : {}) });

  it('serves publicly by default', async () => {
    const { app, deploymentId } = await setup();
    const res = await serve(app, deploymentId);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('SECRET CONTENT');
  });

  it('gates anonymous access once a password is set, and unlocks with the right one', async () => {
    const { app, auth, projectId, deploymentId } = await setup();

    const set = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    expect(set.statusCode).toBe(200);
    expect((set.json() as { accessMode: string }).accessMode).toBe('password');

    // Anonymous → 401, no content leaked.
    const anon = await serve(app, deploymentId);
    expect(anon.statusCode).toBe(401);
    expect(anon.body).not.toContain('SECRET CONTENT');

    // Wrong password → 401, no cookie.
    const wrong = await app.inject({
      method: 'POST',
      url: `/static-deployments/${deploymentId}/__access`,
      payload: { password: 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect((wrong.json() as { code: string }).code).toBe('DEPLOYMENT_PASSWORD_INCORRECT');

    // Right password → 200 + Set-Cookie.
    const gate = await app.inject({
      method: 'POST',
      url: `/static-deployments/${deploymentId}/__access`,
      payload: { password: 'letmein' },
    });
    expect(gate.statusCode).toBe(200);
    const cookie = gate.cookies.find((c) => c.name === accessCookieName(deploymentId));
    if (!cookie) throw new Error('access cookie was not set');
    expect(cookie.httpOnly).toBe(true);

    // Serve WITH the cookie → 200 + content.
    const unlocked = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: cookie.value });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.body).toContain('SECRET CONTENT');

    // A forged/other-deployment cookie value does NOT unlock.
    const forged = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: 'forged-token' });
    expect(forged.statusCode).toBe(401);
  });

  it('rotating the password invalidates the old cookie', async () => {
    const { app, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'first' });
    const g1 = await app.inject({ method: 'POST', url: `/static-deployments/${deploymentId}/__access`, payload: { password: 'first' } });
    const g1Cookie = g1.cookies.find((c) => c.name === accessCookieName(deploymentId));
    if (!g1Cookie) throw new Error('access cookie was not set');
    const oldCookie = g1Cookie.value;

    // Rotate.
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'second' });
    const stale = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: oldCookie });
    expect(stale.statusCode).toBe(401);
  });

  it('switching back to public re-opens it', async () => {
    const { app, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    expect((await serve(app, deploymentId)).statusCode).toBe(401);

    const pub = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'public' });
    expect(pub.statusCode).toBe(200);
    const open = await serve(app, deploymentId);
    expect(open.statusCode).toBe(200);
    expect(open.body).toContain('SECRET CONTENT');
  });

  it('rejects mode=password without a password (400) and requires owner auth (401)', async () => {
    const { app, auth, projectId, deploymentId } = await setup();
    const noPw = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password' });
    expect(noPw.statusCode).toBe(400);
    const noAuth = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      payload: { mode: 'password', password: 'x1234' },
    });
    expect(noAuth.statusCode).toBe(401);
  });

  // ---- expert P0 security counter-audit (SEC-1..6) --------------------------

  it('SEC-2/3: every gated response is no-store (never public) with Vary: Cookie — no cache poisoning', async () => {
    const { app, store, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });

    // (a) the 401 gate must not be cacheable as public
    const anon = await serve(app, deploymentId);
    expect(anon.statusCode).toBe(401);
    const anonCache = String(anon.headers['cache-control'] ?? '');
    expect(anonCache).toContain('no-store');
    expect(anonCache).not.toContain('public');

    // (b) the AUTHORIZED 200 must ALSO be no-store + Vary: Cookie, so a shared
    // cache can never store it and replay to an anonymous visitor (poisoning).
    const dep = await store.getDeployment(projectId, deploymentId);
    const passwordHash = ((dep!.metadata as any).access as { passwordHash: string }).passwordHash;
    const valid = computeAccessToken(DEP_SECRET, deploymentId, passwordHash, Date.now() + 3_600_000);
    const ok = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: valid });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('SECRET CONTENT');
    const okCache = String(ok.headers['cache-control'] ?? '');
    expect(okCache).toContain('no-store');
    expect(okCache).not.toContain('public');
    expect(String(ok.headers['vary'] ?? '').toLowerCase()).toContain('cookie');

    // (c) cache-poisoning replay: after the authorized fetch, the SAME URL fetched
    // anonymously still leaks NO protected byte.
    const replay = await serve(app, deploymentId);
    expect(replay.statusCode).toBe(401);
    expect(replay.body).not.toContain('SECRET CONTENT');
  });

  /*
   * SEC-7 — LA TRANSITION LA PLUS DANGEREUSE : public + DÉJÀ MIS EN CACHE, puis
   * activation de la protection.
   *
   * Le test SEC-2/3 part d'un déploiement déjà protégé : il ne peut donc pas
   * voir ce cas. Ici le déploiement est d'abord PUBLIC, il est servi (donc
   * potentiellement stocké par un intermédiaire), PUIS protégé. L'origine ne
   * contrôle pas les caches tiers : elle ne peut pas purger ce qui est déjà
   * stocké. La seule défense correcte est d'avoir émis, DÈS la réponse publique,
   * une directive qui interdit toute réutilisation sans revalidation.
   */
  it("SEC-7 poison_replay: PUBLIC déjà mis en cache -> protégé -> le rejeu anonyme ne rend JAMAIS l'ancienne réponse", async () => {
    const { app, auth, projectId, deploymentId } = await setup();

    // (a) PUBLIC : la réponse est servie et pourrait être stockée par un cache.
    const publicHit = await serve(app, deploymentId);
    expect(publicHit.statusCode).toBe(200);
    expect(publicHit.body).toContain('SECRET CONTENT');

    /*
     * (b) LA propriété qui ferme la fenêtre : la réponse publique n'est jamais
     * réutilisable SANS revalidation. Avec `max-age=60`, un intermédiaire aurait
     * pu la resservir pendant une minute APRÈS l'activation de la protection —
     * un visiteur anonyme aurait alors obtenu le contenu désormais protégé.
     */
    const publicCache = String(publicHit.headers['cache-control'] ?? '');
    expect(publicCache).toContain('no-cache');
    expect(publicCache).toMatch(/must-revalidate/);
    // Aucune durée de fraîcheur non nulle : rien n'est servable sans revalider.
    expect(publicCache).not.toMatch(/max-age=[1-9]/);
    // La clé de cache dépend du cookie dès l'origine.
    expect(String(publicHit.headers['vary'] ?? '').toLowerCase()).toContain('cookie');

    // (c) Activation de la protection.
    const set = await setAccess(app, projectId, deploymentId, auth.token, {
      mode: 'password',
      password: 'letmein',
    });
    expect(set.statusCode).toBe(200);

    // (d) REJEU anonyme sur la MÊME URL : jamais 200, jamais l'ancien contenu.
    const replay = await serve(app, deploymentId);
    expect(replay.statusCode).toBe(401);
    expect(replay.body).not.toContain('SECRET CONTENT');
    const replayCache = String(replay.headers['cache-control'] ?? '');
    expect(replayCache).toContain('no-store');
    expect(replayCache).not.toContain('public');
  });

  it('SEC-7: le gate précède HEAD, Range, conditionnelle, asset secondaire et fallback SPA', async () => {
    const { app, auth, projectId, deploymentId } = await setup();

    // Public d'abord, pour qu'un cache ait pu voir passer chaque variante.
    expect((await serve(app, deploymentId)).statusCode).toBe(200);

    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });

    const base = `/static-deployments/${deploymentId}`;

    /*
     * Chaque variante est une façon différente de récupérer des octets. Le gate
     * doit s'appliquer AVANT toutes, sinon il suffirait de changer de méthode ou
     * d'en-tête pour contourner la protection.
     */
    const variants: Array<{ label: string; options: Record<string, unknown> }> = [
      { label: 'HEAD', options: { method: 'HEAD', url: `${base}/` } },
      { label: 'Range', options: { method: 'GET', url: `${base}/`, headers: { range: 'bytes=0-4' } } },
      {
        label: 'conditionnelle If-None-Match',
        options: { method: 'GET', url: `${base}/`, headers: { 'if-none-match': '"quelconque"' } },
      },
      {
        label: 'conditionnelle If-Modified-Since',
        options: {
          method: 'GET',
          url: `${base}/`,
          headers: { 'if-modified-since': new Date(Date.now() + 86_400_000).toUTCString() },
        },
      },
      { label: 'asset secondaire', options: { method: 'GET', url: `${base}/assets/app.js` } },
      { label: 'fallback SPA', options: { method: 'GET', url: `${base}/route/profonde` } },
      { label: 'index explicite', options: { method: 'GET', url: `${base}/index.html` } },
    ];

    for (const { label, options } of variants) {
      const response = await app.inject(options as never);

      // Jamais 200, et surtout jamais 304 : un 304 confirmerait à un cache que
      // son entrée publique est encore valide, donc l'autoriserait à la resservir.
      expect([401, 403, 404, 503], `${label} -> ${response.statusCode}`).toContain(response.statusCode);
      expect(response.statusCode, label).not.toBe(200);
      expect(response.statusCode, label).not.toBe(304);
      expect(response.body ?? '', label).not.toContain('SECRET CONTENT');

      const cache = String(response.headers['cache-control'] ?? '');
      expect(cache, label).toContain('no-store');
      expect(cache, label).not.toContain('public');
    }
  });

  it('SEC-7: après retour au public, la réponse reste non réutilisable sans revalidation', async () => {
    const { app, auth, projectId, deploymentId } = await setup();

    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    expect((await serve(app, deploymentId)).statusCode).toBe(401);

    // Retour au public : le contenu redevient accessible…
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'public' });
    const reopened = await serve(app, deploymentId);
    expect(reopened.statusCode).toBe(200);

    /*
     * …mais la directive reste `no-cache` : une nouvelle bascule vers protégé ne
     * rouvrirait pas de fenêtre de rejeu. La propriété est stable dans les DEUX
     * sens, pas seulement au premier passage.
     */
    const cache = String(reopened.headers['cache-control'] ?? '');
    expect(cache).toContain('no-cache');
    expect(cache).not.toMatch(/max-age=[1-9]/);
  });

  it('SEC-5: an EXPIRED (server-verified) token is refused even though the cookie is present', async () => {
    const { app, store, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    const dep = await store.getDeployment(projectId, deploymentId);
    const passwordHash = ((dep!.metadata as any).access as { passwordHash: string }).passwordHash;

    const expired = computeAccessToken(DEP_SECRET, deploymentId, passwordHash, Date.now() - 1_000);
    const res = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: expired });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('SECRET CONTENT');

    const valid = computeAccessToken(DEP_SECRET, deploymentId, passwordHash, Date.now() + 60_000);
    const ok = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: valid });
    expect(ok.statusCode).toBe(200);
  });

  it('SEC-1: a password deployment whose stored hash is gone is LOCKED (503), never public', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'lock@example.com', password: 'password123', name: 'L', organizationName: 'L Org' },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'L Project' },
    });
    const projectId = (proj.json() as { project: { id: string } }).project.id;
    // Corrupt/partial config: mode=password but NO hash.
    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
      metadata: { access: { mode: 'password' } },
    });
    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>SECRET CONTENT</body>', 'utf8');

    const res = await serve(app, deployment.id);
    expect(res.statusCode).toBe(503);
    expect((res.json() as { code: string }).code).toBe('DEPLOYMENT_ACCESS_LOCKED');
    expect(res.body).not.toContain('SECRET CONTENT');

    // The unlock endpoint also refuses (nothing to unlock).
    const gate = await app.inject({
      method: 'POST',
      url: `/static-deployments/${deployment.id}/__access`,
      payload: { password: 'anything' },
    });
    expect(gate.statusCode).toBe(503);
  });

  /*
   * SEC-1b — le fail-open relevé par le contre-audit, prouvé DE BOUT EN BOUT.
   *
   * `accessConfigFromMetadata` retombait sur `public` pour tout mode qui n'était
   * pas exactement `password`. Le cas le plus net est `locked` lui-même : la
   * décision fail-closed de SEC-1 ne survivait pas à un aller-retour en base — le
   * déploiement était reservi au monde entier au rechargement suivant.
   *
   * Chaque mode est vérifié sur la vraie route de service, avec du contenu réel
   * sur disque, pour que la preuve ne dépende pas d'un raisonnement sur le code.
   */
  const unknownAccessModes = ['private', 'locked', '123', 'password-protected', 'PASSWORD', 'future-mode'];

  for (const [index, mode] of unknownAccessModes.entries()) {
    it(`SEC-1b: mode d'accès inconnu ${JSON.stringify(mode)} -> 503 verrouillé, JAMAIS public`, async () => {
      const store = new TestApiStore();
      const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
      const reg = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `unknown-mode-${index}@example.com`,
          password: 'password123',
          name: 'U',
          organizationName: 'U Org',
        },
      });
      const auth = reg.json() as { token: string; organization: { id: string } };
      const proj = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/projects`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name: 'U Project' },
      });
      const projectId = (proj.json() as { project: { id: string } }).project.id;

      const deployment = await store.createDeployment({
        projectId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: 'https://example.test/x',
        metadata: { access: { mode } },
      });
      const dir = staticDeploymentSnapshotDir(deployment.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), '<!doctype html><body>SECRET CONTENT</body>', 'utf8');

      const res = await serve(app, deployment.id);

      expect(res.statusCode).toBe(503);
      expect(res.statusCode).not.toBe(200);
      expect((res.json() as { code: string }).code).toBe('DEPLOYMENT_ACCESS_LOCKED');

      // ZÉRO octet applicatif : c'est la propriété qui compte, pas le seul statut.
      expect(res.body).not.toContain('SECRET CONTENT');

      /*
       * Un état verrouillé est « gated » : sa réponse ne doit jamais être
       * réutilisable par un cache partagé pour un autre visiteur.
       */
      expect(res.headers['cache-control']).toContain('no-store');
      expect(String(res.headers.vary ?? '')).toContain('Cookie');

      // Et il n'existe aucun mot de passe capable de le déverrouiller.
      const gate = await app.inject({
        method: 'POST',
        url: `/static-deployments/${deployment.id}/__access`,
        payload: { password: 'anything' },
      });
      expect(gate.statusCode).toBe(503);
    });
  }

  /*
   * SEC-8 — the DEPLOY-TIME activation interlock.
   *
   * Context: an api build from before the P104 cutover answered a public static
   * deployment with `Cache-Control: public, max-age=60`, reusable from a shared
   * cache for 60s with no revalidation and unpurgeable from the origin. Turning on
   * password protection inside that window protects the origin only — anonymous
   * visitors keep getting the cached public copy. The deploy workflow therefore
   * rolls the new code with activation CLOSED, waits for every pre-cutover pod to
   * disappear plus the full legacy max-age, and only then arms this flag
   * (.github/workflows/deploy-main.yml; barrier in scripts/deploy-cache-window.mjs).
   *
   * What must hold in the code, and is proven here:
   *   - activation refuses, fail-closed, on ANY value that is not exactly '1';
   *   - ENFORCEMENT never depends on the flag (that would be a far worse bug than
   *     the one being fixed: disarming would UNPROTECT live deployments);
   *   - un-protecting stays available at '0' — the interlock must not trap owners.
   */
  describe('SEC-8 deploy-time activation interlock', () => {
    for (const value of ['0', '', 'true', 'yes', undefined] as const) {
      it(`refuses to ACTIVATE protection when the flag is ${value === undefined ? 'absent' : `'${value}'`} (fail-closed)`, async () => {
        const { app, auth, projectId, deploymentId } = await setup();

        if (value === undefined) {
          delete process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
        } else {
          process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = value;
        }

        const res = await setAccess(app, projectId, deploymentId, auth.token, {
          mode: 'password',
          password: 'letmein',
        });

        expect(res.statusCode).toBe(503);
        expect((res.json() as { code: string }).code).toBe('DEPLOYMENT_ACCESS_ACTIVATION_DISABLED');

        /*
         * And it genuinely did not half-apply: the deployment is still public, so
         * the owner is never left believing it is protected when it is not.
         */
        const still = await serve(app, deploymentId);
        expect(still.statusCode).toBe(200);
        expect(still.body).toContain('SECRET CONTENT');
      });
    }

    it("activates normally once the flag is exactly '1'", async () => {
      const { app, auth, projectId, deploymentId } = await setup();

      process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '0';
      expect((await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' })).statusCode).toBe(503);

      process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
      const ok = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
      expect(ok.statusCode).toBe(200);
      expect((ok.json() as { accessMode: string }).accessMode).toBe('password');
      expect((await serve(app, deploymentId)).statusCode).toBe(401);
    });

    it('does NOT gate ENFORCEMENT — an already-protected deployment stays gated when the flag is disarmed', async () => {
      const { app, auth, projectId, deploymentId } = await setup();

      // Armed: protect it (this is the state prod is in after a normal deploy).
      process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
      expect((await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' })).statusCode).toBe(200);

      /*
       * Now disarm — a chart rollback to a pre-cutover revision, a dropped value,
       * a phase-1 redeploy. THE CONTENT MUST STAY PROTECTED. If the interlock ever
       * gated enforcement, this deploy-time flag would silently world-open every
       * password-protected deployment: strictly worse than the cache window it
       * exists to close.
       */
      process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '0';

      const anon = await serve(app, deploymentId);
      expect(anon.statusCode).toBe(401);
      expect(anon.body).not.toContain('SECRET CONTENT');

      // And the gate still works for someone who knows the password.
      const gate = await app.inject({
        method: 'POST',
        url: `/static-deployments/${deploymentId}/__access`,
        payload: { password: 'letmein' },
      });
      expect(gate.statusCode).toBe(200);

      const cookie = gate.cookies.find((c) => c.name === accessCookieName(deploymentId));

      if (!cookie) {
        throw new Error('access cookie was not set');
      }

      const unlocked = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: cookie.value });
      expect(unlocked.statusCode).toBe(200);
      expect(unlocked.body).toContain('SECRET CONTENT');
    });

    it('still allows UN-protecting while disarmed — the interlock must not trap an owner', async () => {
      const { app, auth, projectId, deploymentId } = await setup();

      process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
      expect((await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' })).statusCode).toBe(200);

      process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '0';

      // mode=public only ever de-escalates, so it is never blocked.
      const opened = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'public' });
      expect(opened.statusCode).toBe(200);
      expect((opened.json() as { accessMode: string }).accessMode).toBe('public');

      const res = await serve(app, deploymentId);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('SECRET CONTENT');
    });

    it('keeps the post-cutover cache headers that make the interlock terminal', async () => {
      /*
       * The barrier only has to run ONCE because the code it gates emits
       * `no-cache, must-revalidate` on public deployments: every reuse revalidates
       * through the gate, so no future activation can be defeated by a cache. If
       * this assertion ever fails, the one-shot cutover reasoning in
       * deploy-main.yml is void and the barrier would have to run on every deploy.
       */
      const { app, deploymentId } = await setup();
      const res = await serve(app, deploymentId);

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.headers['cache-control']).toContain('must-revalidate');
      expect(res.headers['cache-control']).not.toContain('max-age=60');
    });
  });
});

/*
 * SEC-11 — password protection must never be claimed where it is not enforced.
 *
 * Enforcement lives ONLY on the `/static-deployments/:id/*` route. A `server`
 * deployment is served from its own host (`d-<id>.<previewDomain>`), and a
 * vercel/netlify/pages/run/docker deployment from the provider's own domain —
 * none of those paths consult `metadata.access` at all.
 *
 * So accepting `mode=password` for them stored a hash, returned 200 and showed
 * the deployment as protected in the product, while the URL stayed world-open:
 * PHANTOM PROTECTION, which is worse than refusing, because the owner stops
 * looking. Refuse fail-closed instead; real per-provider enforcement is a
 * separate piece of work.
 */
describe('SEC-11 password activation is refused where it cannot be enforced', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevActivation = process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'pwd-prov-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    if (prevActivation === undefined) delete process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
    else process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = prevActivation;
    await rm(storageDir, { recursive: true, force: true });
  });

  async function setupProvider(provider: string) {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `p-${provider}@example.com`, password: 'password123', name: 'P', organizationName: 'P Org' },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'P Project' },
    });
    const projectId = (proj.json() as { project: { id: string } }).project.id;

    const deployment = await store.createDeployment({
      projectId,
      provider: provider as never,
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
    });

    return { app, store, auth, projectId, deploymentId: deployment.id };
  }

  const setAccessFor = (app: any, projectId: string, deploymentId: string, token: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  for (const provider of ['server', 'vercel', 'netlify', 'github-pages', 'cloudflare-pages', 'google-cloud-run', 'docker']) {
    it(`refuses mode=password for provider "${provider}" and stores NOTHING`, async () => {
      const { app, store, auth, projectId, deploymentId } = await setupProvider(provider);

      const res = await setAccessFor(app, projectId, deploymentId, auth.token, {
        mode: 'password',
        password: 'letmein',
      });

      expect(res.statusCode).toBe(409);
      expect((res.json() as { code: string }).code).toBe('DEPLOYMENT_ACCESS_UNSUPPORTED_PROVIDER');

      /*
       * The decisive part: no half-applied state. A stored hash with no
       * enforcement is exactly the phantom the refusal exists to prevent.
       */
      const after = await store.getDeployment(projectId, deploymentId);
      expect((after?.metadata as Record<string, unknown> | undefined)?.access).toBeUndefined();
    });
  }

  it('still allows mode=password for static (the provider that IS enforced)', async () => {
    const { app, auth, projectId, deploymentId } = await setupProvider('static');

    const res = await setAccessFor(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { accessMode: string }).accessMode).toBe('password');
  });

  it('still allows mode=public everywhere — un-protecting must never be trapped', async () => {
    for (const provider of ['server', 'vercel', 'static']) {
      const { app, auth, projectId, deploymentId } = await setupProvider(provider);
      const res = await setAccessFor(app, projectId, deploymentId, auth.token, { mode: 'public' });

      expect(res.statusCode, provider).toBe(200);
    }
  });
});
