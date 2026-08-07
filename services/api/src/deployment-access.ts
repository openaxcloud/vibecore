/*
 * P104 — password-protected deployments (Replit-parity "password protection";
 * the pricing page advertises "Private / password-protected deployments"). A
 * published deployment can be gated behind a password so it is NOT world-open.
 *
 * This is the pure, unit-testable core: the access config shape, an expiring
 * proof-of-password cookie token (server-verified), and its rotation-aware check.
 * No I/O. The config lives in Deployment.metadata.access (no schema migration),
 * enforcement in the /static-deployments serve route, hashing via @vibecore/auth.
 *
 * Cookie token = base64url(expiresAtMs) "." HMAC(secret, id ∥ hash ∥ expiresAtMs),
 * bound to the CURRENT passwordHash, so rotating (or clearing) the password
 * invalidates every previously-issued cookie for free — no session store needed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

// public: world-readable. password (P104): behind a shared password. locked
// (SEC-1): password-gated but its stored hash is missing/corrupt — serves NOTHING
// (fail-closed), never falls back to public.
export type DeploymentAccessMode = 'public' | 'password' | 'locked';

export interface DeploymentAccessConfig {
  mode: DeploymentAccessMode;
  /** bcrypt/scrypt hash of the access password; present iff mode === 'password'. */
  passwordHash?: string;
}

/** Default lifetime of an unlock cookie/token (server-verified expiry, SEC-5). */
export const ACCESS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Domain-separation label so a deployment-access key derived from a shared base
 * secret is DISTINCT key material from every other use of that base (SEC-6).
 */
export const DEPLOYMENT_ACCESS_SECRET_LABEL = 'vibecore.deployment-access.v1';

/**
 * Derive a DEDICATED deployment-access HMAC key from a base platform secret. The
 * derived key can never coincide with the base secret's other uses (chat-share,
 * sessions), so a deployment-access token is not a valid token anywhere else and
 * vice-versa — a dedicated, rotatable key even when no explicit one is set (SEC-6).
 */
export function deriveDeploymentAccessSecret(baseSecret: string): string {
  return createHmac('sha256', baseSecret).update(DEPLOYMENT_ACCESS_SECRET_LABEL).digest('base64url');
}

/**
 * Read the access config off a deployment's metadata JSON.
 *
 * SEC-1 (fail-closed) — ALLOW-LIST, not deny-list. Only two states may serve
 * content publicly, and both must be recognised POSITIVELY:
 *
 *   1. `access` totally absent (or null)  → public — the legitimate default for
 *      a deployment that was never gated.
 *   2. `mode === 'public'` explicitly     → public — the owner said so.
 *   3. `mode === 'password'` + non-empty string hash → password.
 *   4. ANYTHING ELSE                      → locked (serves nothing, 503).
 *
 * The previous shape was `if (mode === 'password') {…} return public`, which
 * made public the fallback for every unrecognised state: an unknown or future
 * mode, a non-string mode, a partially-applied migration, corrupted JSON — all
 * silently world-readable. Worst of all it did not survive its own round-trip:
 * a deployment this very function had classified `locked` was read back as
 * PUBLIC, so the SEC-1 fail-closed decision leaked open the moment it was
 * persisted and re-read.
 *
 * Rule of thumb encoded here: an access config we cannot fully understand is
 * evidence that SOMETHING was configured. Refusing to serve is recoverable
 * (the owner re-sets the password); serving is not (the content is out).
 */
export function accessConfigFromMetadata(metadata: unknown): DeploymentAccessConfig {
  const container = metadata as { access?: unknown } | null | undefined;
  const access = container && typeof container === 'object' ? container.access : undefined;

  // 1. Jamais configuré → public. C'est le seul défaut ouvert légitime.
  if (access === undefined || access === null) {
    return { mode: 'public' };
  }

  /*
   * Une configuration PRÉSENTE mais inexploitable (chaîne, nombre, tableau) ne
   * peut pas être traitée comme « pas de configuration » : quelqu'un a écrit
   * quelque chose là, et on ne sait pas quoi.
   */
  if (typeof access !== 'object' || Array.isArray(access)) {
    return { mode: 'locked' };
  }

  const { mode, passwordHash } = access as { mode?: unknown; passwordHash?: unknown };

  // 2. Ouverture EXPLICITE — reconnue positivement, jamais par défaut.
  if (mode === 'public') {
    return { mode: 'public' };
  }

  // 3. Protégé : n'est exploitable qu'avec un hash réellement utilisable.
  if (mode === 'password') {
    if (typeof passwordHash === 'string' && passwordHash.length > 0) {
      return { mode: 'password', passwordHash };
    }

    return { mode: 'locked' };
  }

  /*
   * 4. Tout le reste — `locked` relu depuis la base, mode inconnu ou futur,
   * mode non-string, valeur corrompue. On refuse de servir.
   */
  return { mode: 'locked' };
}

/** One cookie per deployment so unlocking one app never unlocks another sharing a host. */
export function accessCookieName(deploymentId: string): string {
  return `vc_dep_${deploymentId}`;
}

/**
 * Proof-of-password token: `base64url(expiresAtMs) "." HMAC(secret, id ∥ hash ∥
 * expiresAtMs)`. The expiry is EMBEDDED and signed, so the server verifies it on
 * every request (SEC-5) — a tampered/extended cookie Max-Age can't outlive it.
 * Bound to the passwordHash ⇒ changing/clearing the password invalidates it.
 */
export function computeAccessToken(
  secret: string,
  deploymentId: string,
  passwordHash: string,
  expiresAtMs: number,
): string {
  const payload = String(Math.floor(expiresAtMs));
  const sig = createHmac('sha256', secret).update(`${deploymentId} ${passwordHash} ${payload}`).digest('base64url');

  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

/**
 * Constant-time signature check against ANY accepted secret (key rotation, SEC-6).
 * Returns the embedded expiry (ms) on a valid signature, else undefined. Does NOT
 * apply expiry itself — {@link isAccessTokenValid} does, so an authentic-but-expired
 * token is distinguishable from a forged one.
 */
export function verifyAccessTokenSignature(
  secrets: readonly string[],
  deploymentId: string,
  passwordHash: string,
  token: string | undefined | null,
): number | undefined {
  if (!token || typeof token !== 'string') {
    return undefined;
  }

  const dot = token.indexOf('.');

  if (dot <= 0 || dot === token.length - 1) {
    return undefined;
  }

  let payload: string;

  try {
    payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  } catch {
    return undefined;
  }

  if (!/^\d{1,18}$/.test(payload)) {
    return undefined;
  }

  const providedSig = Buffer.from(token.slice(dot + 1));

  for (const secret of secrets) {
    const expected = Buffer.from(
      createHmac('sha256', secret).update(`${deploymentId} ${passwordHash} ${payload}`).digest('base64url'),
    );

    if (providedSig.length === expected.length && timingSafeEqual(providedSig, expected)) {
      return Number(payload);
    }
  }

  return undefined;
}

/**
 * Valid iff the token is authentically signed by a current/rotated secret AND its
 * server-embedded expiry is still in the future (SEC-5). No stored session.
 */
export function isAccessTokenValid(
  secrets: readonly string[],
  deploymentId: string,
  passwordHash: string,
  token: string | undefined | null,
  nowMs: number = Date.now(),
): boolean {
  const expiresAtMs = verifyAccessTokenSignature(secrets, deploymentId, passwordHash, token);

  if (expiresAtMs === undefined) {
    return false;
  }

  return nowMs < expiresAtMs;
}

/**
 * The scoped CSP to send with the gate page: it needs its own inline style +
 * inline script (to POST the password as JSON — there is no form-body parser) and
 * to fetch the relative `__access` endpoint. Nothing else is allowed.
 */
export const ACCESS_GATE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'";

/**
 * Minimal HTML gate for browser visitors (a JSON 401 is returned to non-HTML
 * clients). Submits the password as JSON to the relative `__access` endpoint,
 * which sets the access cookie; on success it reloads the page (now served). No
 * external assets and nothing user-controlled is interpolated. Serve it with
 * ACCESS_GATE_CSP.
 */
export function accessGateHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Password required</title></head><body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0f;color:#e8e8ea;display:flex;min-height:100vh;align-items:center;justify-content:center"><form id="g" style="width:min(92vw,360px);background:#16161d;border:1px solid #2a2a35;border-radius:14px;padding:28px"><h1 style="font-size:18px;margin:0 0 6px">This deployment is protected</h1><p style="margin:0 0 18px;color:#a0a0aa;font-size:14px">Enter the password to view this app.</p><p id="e" role="alert" style="display:none;color:#e0555f;margin:0 0 12px;font-size:14px">Incorrect password. Try again.</p><input id="p" type="password" autocomplete="current-password" autofocus required placeholder="Password" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #33333f;background:#0e0e13;color:#fff;font-size:15px;margin-bottom:14px"><button type="submit" style="width:100%;padding:11px;border:0;border-radius:9px;background:#635bff;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Unlock</button></form><script>document.getElementById('g').addEventListener('submit',async function(ev){ev.preventDefault();var r=await fetch('__access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});if(r.ok){location.reload();}else{document.getElementById('e').style.display='block';}});</script></body></html>`;
}
