import { randomBytes } from 'node:crypto';

import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import {
  deploymentAccessExchangeCopy,
  type DeploymentAccessExchangeLanguage,
} from '~/lib/i18n/catalogs/deployment-access-exchange';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

type TicketResponse = {
  ticket: string;
  expiresAt: string;
  exchangeUrl: string;
  deploymentUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validDedicatedOrigin(url: URL, deploymentId: string): boolean {
  const hostname = url.hostname.toLowerCase();

  const configuredDomain = process.env.PREVIEW_DOMAIN?.trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');
  const expectedHosts = new Set(
    [`s-${deploymentId}`, `d-${deploymentId}`].map((label) =>
      configuredDomain ? `${label.toLowerCase()}.${configuredDomain}` : label.toLowerCase(),
    ),
  );

  if (process.env.NODE_ENV === 'production' && !configuredDomain) {
    return false;
  }

  return (
    (configuredDomain ? expectedHosts.has(hostname) : expectedHosts.has(hostname.split('.')[0])) &&
    (process.env.NODE_ENV === 'production' ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol))
  );
}

function localizedError(message: string, status: number, language: DeploymentAccessExchangeLanguage): Response {
  return new Response(message, {
    status,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      'content-language': language,
      pragma: 'no-cache',
    },
  });
}

/**
 * Authenticated identity handoff to a deployment's isolated origin. The raw
 * one-shot ticket exists only in this no-store response body and the following
 * POST body — never in a URL, redirect Location, Referer, log field or cache key.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const deploymentId = String(params.deploymentId ?? '').trim();
  const language = resolveRequestLocale(request).language === 'fr' ? 'fr' : 'en';
  const copy = deploymentAccessExchangeCopy[language];

  if (!/^[A-Za-z0-9_-]{1,80}$/.test(deploymentId)) {
    throw localizedError(copy.invalidDeployment, 400, language);
  }

  const ticket = await apiRequest<TicketResponse>(
    request,
    `/deployment-access/${encodeURIComponent(deploymentId)}/ticket`,
    {
      method: 'POST',
    },
  );

  if (
    !ticket ||
    typeof ticket.ticket !== 'string' ||
    !/^[A-Za-z0-9_-]{20,512}$/.test(ticket.ticket) ||
    typeof ticket.exchangeUrl !== 'string' ||
    typeof ticket.deploymentUrl !== 'string'
  ) {
    throw localizedError(copy.exchangeUnavailable, 502, language);
  }

  let exchange: URL;
  let deployment: URL;

  try {
    exchange = new URL(ticket.exchangeUrl);
    deployment = new URL(ticket.deploymentUrl);
  } catch {
    throw localizedError(copy.exchangeUnavailable, 502, language);
  }

  if (
    !validDedicatedOrigin(deployment, deploymentId) ||
    exchange.origin !== deployment.origin ||
    exchange.pathname !== '/__vibecore/access/exchange' ||
    exchange.search ||
    exchange.hash
  ) {
    throw localizedError(copy.exchangeUnavailable, 502, language);
  }

  const requestedTarget = new URL(request.url).searchParams.get('returnTo');

  let returnTo = '/';

  if (requestedTarget && requestedTarget.length <= 2048) {
    try {
      const target = new URL(requestedTarget);

      if (target.origin === deployment.origin) {
        returnTo = `${target.pathname}${target.search}${target.hash}`;
      }
    } catch {
      // Invalid or cross-origin targets resolve to the deployment root.
    }
  }

  const nonce = randomBytes(18).toString('base64url');
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><style nonce="${nonce}">:root{color-scheme:dark light;font-family:Inter,ui-sans-serif,system-ui;background:#080b12;color:#f8fafc}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 0,#24345f,transparent 48%),#080b12}main{width:min(100%,460px);padding:36px;border:1px solid #293246;border-radius:20px;background:#0f141f;box-shadow:0 28px 90px #0007}h1{font-size:clamp(25px,6vw,34px);margin:0 0 12px;letter-spacing:-.025em}p{color:#aeb8ca;line-height:1.6;margin:0 0 24px}button{width:100%;min-height:48px;border:0;border-radius:11px;background:#6d5dfc;color:#fff;font:inherit;font-weight:750;padding:10px 16px;cursor:pointer}button:focus-visible{outline:3px solid #c7d2fe;outline-offset:3px}@media(max-width:480px){body{padding:12px}main{padding:24px;border-radius:16px}}</style></head><body><main><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.body)}</p><form id="exchange" method="post" action="${escapeHtml(exchange.toString())}"><input type="hidden" name="ticket" value="${escapeHtml(ticket.ticket)}"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><button type="submit">${escapeHtml(copy.button)}</button></form></main><script nonce="${nonce}">document.getElementById('exchange').submit()</script></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'content-language': language,
      pragma: 'no-cache',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action ${exchange.origin}; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}
