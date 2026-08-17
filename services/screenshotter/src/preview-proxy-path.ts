/**
 * Réécrit une URL d'hôte de preview vers la route CHEMIN du preview-proxy :
 *
 *   http(s)://<ws>-<port>.<previewDomain>/<chemin>?<query>
 *     ->  http://<proxy>/p/<ws>/<port>/<chemin>?<query>
 *   http(s)://d-<id>.<previewDomain>/<chemin>   ->  http://<proxy>/d/<id>/<chemin>
 *   http(s)://s-<id>.<previewDomain>/<chemin>   ->  http://<proxy>/s/<id>/<chemin>
 *
 * Les deux dernières formes existent parce que l'API planifie AUSSI les vignettes
 * des publications : ne couvrir que `<ws>-<port>` laissait ces captures partir avec
 * un Host que le proxy ne route pas.
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

  /*
   * Publications : `d-<id>` (déploiement serveur) et `s-<id>` (statique). Même
   * grammaire que `parseDeployHost` / `parseStaticDeployHost` côté proxy —
   * l'identifiant est un cuid, `[a-z0-9]{6,}`, et ces formes ne portent PAS de
   * `-<port>` final, donc elles ne peuvent pas collisionner avec `<ws>-<port>`.
   * Le test d'abord : sinon `d-abc123` serait vu comme workspace `d` port… rien,
   * et un `s-1234` comme un port.
   */
  const publication = /^([ds])-([a-z0-9]{6,})$/.exec(label);

  if (publication) {
    const path = `/${publication[1]}/${encodeURIComponent(publication[2])}${requestUrl.pathname}`;

    return `${proxy.protocol}//${proxy.host}${path}${requestUrl.search}`;
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
