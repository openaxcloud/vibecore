import { localOrigin } from './gateway.js';

export function browserDestinationAllowed(value: string, origin: string, previewOrigin?: string) {
  localOrigin(origin);

  if (previewOrigin) {
    localOrigin(previewOrigin);
  }

  const url = new URL(value);
  const normalizedOrigin = url.origin.replace(/^ws:/, 'http:');

  if (!['http:', 'ws:'].includes(url.protocol) || url.username || url.password) {
    return false;
  }

  if (/^\/api\/(chat|generate|agent|llm|ai|completion|completions)(\/|-|$)/.test(url.pathname)) {
    return false;
  }

  return (
    normalizedOrigin === origin || (normalizedOrigin === previewOrigin && /^\/p\/[^/]+\/\d+(\/|$)/.test(url.pathname))
  );
}
