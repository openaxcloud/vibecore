/**
 * Réécrit une URL d'hôte de preview vers la route CHEMIN du preview-proxy :
 *
 *   http(s)://<ws>-<port>.<previewDomain>/<chemin>?<query>
 *     ->  http://<proxy>/p/<ws>/<port>/<chemin>?<query>
 *
 * Pourquoi le chemin et pas `Host` : `Host` est un en-tête interdit à la
 * modification, recalculé par le navigateur quand l'URL change (vérifié avec un
 * vrai Chromium : l'amont recevait `Host: 127.0.0.1:<port>`). Le chemin, lui,
 * traverse intact.
 *
 * La sémantique d'extraction reproduit `parsePreviewHost` de
 * services/preview-proxy/src/app.ts — LA référence, qui est aussi le
 * consommateur : un seul label de sous-domaine, `<ws>-<port>`, port sur 1 à 5
 * chiffres dans 1..65535. Renvoie null quand l'hôte ne s'y conforme pas, pour ne
 * jamais deviner une cible de routage.
 */
export function previewProxyPathUrl(proxy: URL, requestUrl: URL, previewHostSuffixes: string[]): string | null {
  const host = requestUrl.hostname.toLowerCase();

  const suffix = previewHostSuffixes
    .map((raw) => raw.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
    .map((clean) => `.${clean}`)
    .find((candidate) => host.endsWith(candidate));

  if (!suffix) {
    return null;
  }

  const label = host.slice(0, host.length - suffix.length);

  // Un hôte de preview est UN seul label de sous-domaine.
  if (!label || label.includes('.')) {
    return null;
  }

  const match = /^(.+)-(\d{1,5})$/.exec(label);

  if (!match) {
    return null;
  }

  const port = Number(match[2]);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  const workspaceId = match[1];
  // `pathname` commence toujours par '/', donc la concaténation ne colle pas les
  // segments : /p/<ws>/<port> + /assets/x.js.
  const path = `/p/${encodeURIComponent(workspaceId)}/${port}${requestUrl.pathname}`;

  return `${proxy.protocol}//${proxy.host}${path}${requestUrl.search}`;
}
