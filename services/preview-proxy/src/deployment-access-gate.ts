import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const ACCESS_PASSWORD_PATH = '/__vibecore/access/password';
export const ACCESS_EXCHANGE_PATH = '/__vibecore/access/exchange';

const MAX_GATE_BODY_BYTES = 16 * 1024;

export type DeploymentAccessVerdict =
  | {
      decision: 'allow';
      mode: 'PUBLIC' | 'PASSWORD_PROTECTED' | 'WORKSPACE_ONLY' | 'INVITE_ONLY';
      cookieName: string;
    }
  | { decision: 'password-required'; mode: 'PASSWORD_PROTECTED'; cookieName: string }
  | { decision: 'sign-in-required'; mode: 'WORKSPACE_ONLY' | 'INVITE_ONLY'; cookieName: string; signInUrl: string }
  | { decision: 'locked'; mode: 'INVITE_ONLY'; cookieName: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function deploymentAccessCookieName(deploymentId: string): string {
  return `vc_dep_${deploymentId}`;
}

export function readNamedCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader || cookieHeader.length > 16_384) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const equals = part.indexOf('=');

    if (equals < 1 || part.slice(0, equals).trim() !== name) {
      continue;
    }

    const value = part.slice(equals + 1).trim();

    return value.length <= 4096 ? value : undefined;
  }

  return undefined;
}

/** Remove only the platform gate proof; user-application cookies remain intact. */
export function stripDeploymentAccessCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const kept = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const equals = part.indexOf('=');
      return equals < 1 || part.slice(0, equals).trim() !== name;
    });

  return kept.length ? kept.join('; ') : undefined;
}

export function sanitizeSameOriginReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  try {
    const url = new URL(value, 'https://deployment.invalid');
    return url.origin === 'https://deployment.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

function french(request: FastifyRequest): boolean {
  const languageCookie = readNamedCookie(request.headers.cookie, 'vibecore_lang');

  if (languageCookie === 'fr') {
    return true;
  }

  if (languageCookie === 'en') {
    return false;
  }

  return String(request.headers['accept-language'] ?? '')
    .toLowerCase()
    .startsWith('fr');
}

function gateCopy(request: FastifyRequest) {
  return french(request)
    ? {
        passwordEyebrow: 'Accès protégé',
        passwordTitle: 'Ce déploiement est privé',
        passwordBody: 'Saisissez le mot de passe défini par votre administrateur pour continuer.',
        passwordLabel: 'Mot de passe du déploiement',
        passwordAction: 'Continuer',
        privateEyebrow: 'Espace sécurisé',
        privateTitle: 'Connexion requise',
        workspaceBody: 'Connectez-vous avec un compte membre actif de cet espace de travail.',
        inviteBody: 'Connectez-vous avec le compte qui a reçu l’accès à ce déploiement.',
        privateAction: 'Se connecter en toute sécurité',
        lockedEyebrow: 'Protection active',
        lockedTitle: 'Accès temporairement indisponible',
        lockedBody: 'Le contrôle d’accès ne peut pas être vérifié. Aucun contenu de l’application n’a été servi.',
        retry: 'Réessayer',
      }
    : {
        passwordEyebrow: 'Protected access',
        passwordTitle: 'This deployment is private',
        passwordBody: 'Enter the password set by your administrator to continue.',
        passwordLabel: 'Deployment password',
        passwordAction: 'Continue',
        privateEyebrow: 'Secure workspace',
        privateTitle: 'Sign in required',
        workspaceBody: 'Sign in with an active member account for this workspace.',
        inviteBody: 'Sign in with the account that was granted access to this deployment.',
        privateAction: 'Sign in securely',
        lockedEyebrow: 'Protection active',
        lockedTitle: 'Access temporarily unavailable',
        lockedBody: 'Access could not be verified. No application content was served.',
        retry: 'Try again',
      };
}

function document(input: {
  language: 'fr' | 'en';
  eyebrow: string;
  title: string;
  body: string;
  content: string;
}): string {
  return `<!doctype html>
<html lang="${input.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title><style>
:root{color-scheme:dark light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080b12;color:#f8fafc}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:radial-gradient(circle at 50% -20%,#21345b 0,transparent 45%),#080b12;display:grid;place-items:center;padding:24px}
main{width:min(100%,460px);background:rgba(15,20,31,.96);border:1px solid #293246;border-radius:20px;box-shadow:0 28px 90px rgba(0,0,0,.45);padding:clamp(24px,6vw,40px)}
.mark{width:48px;height:48px;border-radius:14px;background:linear-gradient(145deg,#7c3aed,#2563eb);display:grid;place-items:center;font-weight:800;font-size:20px;margin-bottom:24px}.eyebrow{color:#a5b4fc;font-size:12px;font-weight:750;letter-spacing:.12em;text-transform:uppercase;margin:0 0 10px}h1{font-size:clamp(26px,7vw,34px);line-height:1.12;letter-spacing:-.025em;margin:0 0 12px}p{color:#aeb8ca;font-size:15px;line-height:1.6;margin:0 0 26px}label{display:block;color:#dbe3f0;font-size:14px;font-weight:650;margin-bottom:8px}input{width:100%;min-height:48px;border:1px solid #3b465d;border-radius:11px;background:#090d16;color:#fff;padding:0 14px;font:inherit;outline:none}input:focus{border-color:#818cf8;box-shadow:0 0 0 3px rgba(129,140,248,.22)}button,a.button{width:100%;min-height:48px;border:0;border-radius:11px;background:#6d5dfc;color:white;display:flex;align-items:center;justify-content:center;font:inherit;font-weight:750;text-decoration:none;cursor:pointer;margin-top:14px;padding:10px 16px}button:hover,a.button:hover{background:#7c6cff}button:focus-visible,a.button:focus-visible{outline:3px solid #c7d2fe;outline-offset:3px}.foot{margin:24px 0 0;text-align:center;color:#657086;font-size:12px}@media(max-width:480px){body{padding:12px}main{border-radius:16px;padding:24px}}
@media(prefers-color-scheme:light){:root{background:#f5f7fb;color:#111827}body{background:radial-gradient(circle at 50% -20%,#dce5ff 0,transparent 48%),#f5f7fb}main{background:rgba(255,255,255,.97);border-color:#dbe1ec;box-shadow:0 24px 70px rgba(31,41,55,.14)}h1{color:#111827}p{color:#536077}label{color:#273248}input{background:#fff;color:#111827;border-color:#b9c2d2}}
</style></head><body><main><div class="mark" aria-hidden="true">E</div><p class="eyebrow">${escapeHtml(input.eyebrow)}</p><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.body)}</p>${input.content}<div class="foot">E-Code · Secure deployment access</div></main></body></html>`;
}

function securityHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'private, no-store, max-age=0');
  reply.header('pragma', 'no-cache');
  reply.header('vary', 'Cookie, Accept-Language');
  reply.header('referrer-policy', 'no-referrer');
  reply.header('x-content-type-options', 'nosniff');
  reply.header('x-frame-options', 'DENY');
  reply.header(
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
}

export function sendDeploymentAccessGate(
  request: FastifyRequest,
  reply: FastifyReply,
  verdict: Exclude<DeploymentAccessVerdict, { decision: 'allow' }>,
): unknown {
  const copy = gateCopy(request);
  const language = french(request) ? 'fr' : 'en';
  const returnTo = sanitizeSameOriginReturnTo(request.url);
  securityHeaders(reply);
  reply.type('text/html; charset=utf-8');

  if (verdict.decision === 'password-required') {
    const content = `<form method="post" action="${ACCESS_PASSWORD_PATH}"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><label for="deployment-password">${escapeHtml(copy.passwordLabel)}</label><input id="deployment-password" name="password" type="password" autocomplete="current-password" required maxlength="256" autofocus><button type="submit">${escapeHtml(copy.passwordAction)}</button></form>`;
    return reply.code(401).send(
      document({
        language,
        eyebrow: copy.passwordEyebrow,
        title: copy.passwordTitle,
        body: copy.passwordBody,
        content,
      }),
    );
  }

  if (verdict.decision === 'sign-in-required') {
    let signIn = '#';

    try {
      const url = new URL(verdict.signInUrl);
      url.searchParams.set('returnTo', `https://${request.headers.host ?? ''}${returnTo}`);
      signIn = url.toString();
    } catch {
      return sendDeploymentAccessGate(request, reply, {
        decision: 'locked',
        mode: 'INVITE_ONLY',
        cookieName: verdict.cookieName,
      });
    }

    const body = verdict.mode === 'WORKSPACE_ONLY' ? copy.workspaceBody : copy.inviteBody;

    return reply.code(401).send(
      document({
        language,
        eyebrow: copy.privateEyebrow,
        title: copy.privateTitle,
        body,
        content: `<a class="button" href="${escapeHtml(signIn)}">${escapeHtml(copy.privateAction)}</a>`,
      }),
    );
  }

  return reply
    .code(503)
    .header('retry-after', '5')
    .send(
      document({
        language,
        eyebrow: copy.lockedEyebrow,
        title: copy.lockedTitle,
        body: copy.lockedBody,
        content: `<a class="button" href="${escapeHtml(returnTo)}">${escapeHtml(copy.retry)}</a>`,
      }),
    );
}

export async function readBoundedGateBody(request: FastifyRequest): Promise<URLSearchParams> {
  const stream = request.raw as unknown as Readable;
  const chunks: Buffer[] = [];

  let size = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > MAX_GATE_BODY_BYTES) {
      throw Object.assign(new Error('Gate request body too large.'), { statusCode: 413 });
    }

    chunks.push(buffer);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
