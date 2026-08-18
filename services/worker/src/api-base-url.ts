/**
 * Résolution UNIQUE de l'URL interne de l'API, partagée par tous les jobs.
 *
 * Il y avait deux résolutions divergentes dans ce service :
 *   * `deploy-jobs.ts` essayait quatre variables ;
 *   * `index.ts` n'en essayait que DEUX (`API_INTERNAL_URL`, `API_URL`).
 *
 * La production ne définit ni l'une ni l'autre de ces deux-là — elle fournit
 * `SAAS_API_URL` et `API_BASE_URL`. Résultat mesuré dans les journaux du worker
 * de prod : `metering.databaseStorage` et `database.maintenance` échouaient à
 * CHAQUE déclenchement sur « API_INTERNAL_URL (or API_URL) is required », et
 * `inactivity.gc` comme `metering.objectStorage` étaient dans le même cas.
 * Les CronJobs, eux, restaient « Complete » : ils ne font qu'empiler le job,
 * l'échec se produit côté worker et ne remonte nulle part.
 *
 * Conséquence : plus aucun métrage stockage/base depuis des semaines, et la
 * maintenance base à l'arrêt.
 *
 * L'ordre ci-dessous est celui de `deploy-jobs.ts`, conservé délibérément :
 *   1. `API_INTERNAL_URL`, `API_URL` — surcharges explicites, prioritaires ;
 *   2. `SAAS_API_URL` — l'URL de Service interne fournie par le configmap ;
 *   3. `API_BASE_URL` — en dernier recours.
 *
 * Le commentaire historique justifiait ce dernier rang par un `API_BASE_URL`
 * pointant sur `svc:80`, port sur lequel le Service n'écoute pas, d'où un
 * timeout. Vérifié en réel depuis le pod worker de production : les deux valent
 * aujourd'hui `http://…-api.vibecore.svc.cluster.local:3001` et répondent
 * **HTTP 200** sur `/health` et `/ready`. L'avertissement n'est donc plus exact
 * pour cet environnement — mais l'ordre est gardé, car il ne coûte rien et
 * protège les environnements où les deux divergeraient encore.
 */
export function resolveApiBaseUrl(): string | undefined {
  /*
   * On filtre les valeurs VIDES, on ne se contente pas de `??`.
   *
   * `??` ne court-circuite que `null`/`undefined` : une variable présente mais
   * vide — ce que produit un template Helm dont la valeur source n'est pas
   * renseignée (`API_INTERNAL_URL: ""`) — l'emporterait sur les suivantes et
   * rendrait la chaîne inopérante, avec en prime une URL vide passée à `fetch`.
   * C'est un piège d'autant plus vicieux qu'il ne se voit qu'au déploiement.
   */
  const candidates = [
    process.env.API_INTERNAL_URL,
    process.env.API_URL,
    process.env.SAAS_API_URL,
    process.env.API_BASE_URL,
  ];

  return candidates.map((value) => value?.trim()).find((value) => !!value) || undefined;
}

/** Variante qui échoue explicitement, avec le nom du job dans le message. */
export function requireApiBaseUrl(jobName: string): string {
  const baseUrl = resolveApiBaseUrl();

  if (!baseUrl) {
    throw new Error(
      `API_INTERNAL_URL, API_URL, SAAS_API_URL or API_BASE_URL is required to trigger ${jobName}`,
    );
  }

  return baseUrl;
}
