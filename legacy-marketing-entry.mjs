/**
 * Retire the imported SPA entry, whose error fallbacks fabricate availability.
 * Keep its assets: native marketing pages still use those images and styles.
 * Shared by Node, Vite and the secondary Pages adapter, before static serving.
 * @param {string} requestUrl
 * @returns {string | null}
 */
export function legacyMarketingRedirect(requestUrl) {
  // A Node request-target starting with // is a path, not a protocol-relative host.
  const url = new URL(requestUrl.startsWith('/') ? `http://localhost${requestUrl}` : requestUrl, 'http://localhost');

  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
  } catch {
    return null;
  }

  // Static serving resolves dot segments after decoding; URL alone does it before decoding.
  const segments = [];

  for (const segment of pathname.split('/')) {
    if (segment === '..') {
      segments.pop();
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment);
    }
  }

  pathname = `/${segments.join('/')}`;

  if (!/^\/ecode-static(?:\/(?:index(?:\.html)?)?)?\/?$/.test(pathname)) {
    return null;
  }

  return `/${url.search}`;
}

/** @type {import('connect').NextHandleFunction} */
export function redirectLegacyMarketingEntry(request, response, next) {
  const destination = legacyMarketingRedirect(request.url ?? '/');

  if (destination === null) {
    next();
    return;
  }

  response.statusCode = 302;
  response.setHeader('Location', destination);
  response.setHeader('Cache-Control', 'no-store');
  response.end();
}
