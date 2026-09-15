/**
 * UNE SEULE CRÉATION À LA FOIS, partagée entre tous ceux qui l'attendent.
 *
 * `ensureProjectAiConversation` créait une conversation à chaque appel tant
 * qu'aucune n'était encore connue. Deux appelants concurrents — l'effacement
 * du fil et la boucle de persistance — envoyaient donc DEUX `POST` ; mesuré le
 * 14/09 en local avec 2,5 s de retard réseau : deux conversations neuves, et
 * l'identifiant courant fixé par celle qui répondait en dernier. L'une des
 * deux restait orpheline.
 *
 * Le second appelant reçoit la promesse du premier. Une création qui échoue
 * libère la porte pour que l'appel suivant puisse réessayer.
 */
export function partagerLaCreation<T>(porte: { current: Promise<T> | null }, creer: () => Promise<T>): Promise<T> {
  if (porte.current) {
    return porte.current;
  }

  const creation = creer().finally(() => {
    if (porte.current === creation) {
      porte.current = null;
    }
  });

  porte.current = creation;

  return creation;
}
