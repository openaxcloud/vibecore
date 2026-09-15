import { data as json } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { acceptLanguageFor, safeFetch, type WebFetchErrorCode } from '~/lib/.server/web/safe-fetch';
import {
  formatApiRuntimeRoutesCopy,
  getApiRuntimeRoutesCopy,
  type ApiRuntimeRoutesKey,
} from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { extraireContenuLisible } from '~/lib/web/contenu-lisible';

const MAX_CONTENT_LENGTH = 8000;

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);

  if (match) {
    return match[1].trim();
  }

  // Try reverse attribute order
  const altMatch = html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  return altMatch ? altMatch[1].trim() : '';
}

/*
 * The SSRF guard + redirect-validated GET live in `~/lib/.server/web/safe-fetch`
 * (shared with the agent's automatic <web_reference>, BUG-AGENT-WEBCLONE-001).
 * This route only maps its error codes to localized copy.
 */
const WEB_FETCH_ERROR_KEYS: Readonly<Record<WebFetchErrorCode, ApiRuntimeRoutesKey>> = {
  FETCH_FAILED: 'apiRuntime.web.fetchFailed',
  HOST_UNRESOLVED: 'apiRuntime.web.hostUnresolved',
  INTERNAL_ADDRESS: 'apiRuntime.web.internalAddress',
  PAGE_TOO_LARGE: 'apiRuntime.web.pageTooLarge',
  TIMEOUT: 'apiRuntime.web.timeout',
  TOO_MANY_REDIRECTS: 'apiRuntime.web.tooManyRedirects',
  URL_NOT_ALLOWED: 'apiRuntime.web.urlNotAllowed',
};

export async function action({ request }: ActionFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  const localizedJson = (data: unknown, init?: Parameters<typeof json>[1]) => {
    const responseInit = typeof init === 'number' ? { status: init } : init;

    return json(data, {
      ...responseInit,
      headers: localeResponseHeaders(request, localeResolution),
    });
  };

  if (request.method !== 'POST') {
    return localizedJson(
      { error: copy['apiRuntime.generic.methodNotAllowed'], code: 'METHOD_NOT_ALLOWED' },
      { status: 405 },
    );
  }

  try {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return localizedJson({ error: copy['apiRuntime.generic.invalidJson'], code: 'INVALID_JSON' }, { status: 400 });
    }

    const { url } = (payload ?? {}) as { url?: string };

    if (!url || typeof url !== 'string') {
      return localizedJson({ error: copy['apiRuntime.web.urlRequired'], code: 'URL_REQUIRED' }, { status: 400 });
    }

    const fetched = await safeFetch(url, acceptLanguageFor(localeResolution.language));

    if (!fetched.ok) {
      return localizedJson(
        { error: copy[WEB_FETCH_ERROR_KEYS[fetched.code]], code: fetched.code },
        { status: fetched.status },
      );
    }

    if (fetched.status < 200 || fetched.status >= 300) {
      return localizedJson(
        {
          error: formatApiRuntimeRoutesCopy(copy['apiRuntime.web.httpFailure'], { status: fetched.status }),
          code: 'UPSTREAM_HTTP_ERROR',
        },
        { status: 502 },
      );
    }

    if (!fetched.contentType.includes('text/html') && !fetched.contentType.includes('text/plain')) {
      return localizedJson(
        { error: copy['apiRuntime.web.unsupportedContent'], code: 'UNSUPPORTED_CONTENT_TYPE' },
        { status: 400 },
      );
    }

    const html = fetched.html;

    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const content = extraireContenuLisible(html);

    return localizedJson({
      success: true,
      data: {
        title,
        description,
        content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) + '...' : content,
        sourceUrl: url,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return localizedJson({ error: copy['apiRuntime.web.timeout'], code: 'TIMEOUT' }, { status: 504 });
    }

    console.error('Web search error:', error);

    return localizedJson({ error: copy['apiRuntime.web.fetchFailed'], code: 'FETCH_FAILED' }, { status: 500 });
  }
}
