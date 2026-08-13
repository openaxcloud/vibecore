/*
 * BUG-RUNTIME-DIVERGENCE — le signal « un port sert » vient du SERVEUR, plus du
 * magasin client.
 *
 * Mesuré à l'écran, à l'instant exact de la décision de reattach :
 *
 *   reused:true  seededThisSession:true  portProbeSucceeded:true  ports: Array(0)
 *
 * pendant que le serveur répondait, en continu et au même moment :
 *
 *   [{ port: 5173, type:'open', processId:'…', serving: true }]
 *
 * Le magasin `previews` est donc VIDE au montage alors que le port sert
 * réellement. C'est un défaut d'hydratation propre au client : `setRuntime()`
 * remet `previews` à `[]` à chaque configuration de l'adaptateur, la
 * (re)connexion du flux `watchPorts` est lancée en fire-and-forget, et la
 * décision est prise dans cette fenêtre. Faire dépendre une opération
 * DESTRUCTRICE — effacer l'espace de travail — de l'état d'hydratation d'un
 * magasin client est fragile par construction : la fenêtre se rouvrira au
 * moindre changement d'ordonnancement.
 *
 * La décision interroge donc la source d'autorité. La route panneau est
 * résolue côté serveur (loader Remix → API), ce qui la rend indépendante du
 * moment où le client a fini de s'hydrater.
 */

/** Vrai si au moins un port sert vraiment, d'après le serveur. */
export function anyPortServing(ports: ReadonlyArray<{ ready?: unknown; serving?: unknown }>): boolean {
  return ports.some((port) => {
    /*
     * `serving` (le port répond ET un processus vivant le détient) est la
     * réponse exacte à la question d'adoption. `ready` y ajoute le statut
     * manager et le compte rendu de rendu du client, tous deux hors sujet ici —
     * et le premier retarde notoirement à la réouverture.
     */
    if (typeof port.serving === 'boolean') {
      return port.serving;
    }

    return port.ready !== false;
  });
}

/**
 * Interroge le serveur : un port de ce projet sert-il ?
 *
 * Rend `undefined` — et non `false` — quand la réponse est inexploitable. La
 * distinction compte : « le serveur dit qu'aucun port ne sert » et « je n'ai pas
 * pu demander » ne doivent pas mener à la même conclusion, sous peine de
 * reproduire le défaut d'origine où un échec silencieux se lisait comme « rien
 * ne tourne ».
 */
export async function fetchAnyPortServing(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | undefined> {
  try {
    const response = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/ports`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { data?: { ports?: unknown } };
    const ports = body?.data?.ports;

    if (!Array.isArray(ports)) {
      return undefined;
    }

    return anyPortServing(ports as ReadonlyArray<{ ready?: unknown; serving?: unknown }>);
  } catch {
    return undefined;
  }
}
