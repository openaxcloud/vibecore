# Horodatage et rejeu des logs runtime

Le flux `/api/runtime/workspaces/:workspaceId/logs` et son `/snapshot` conservent
l'heure fournie par Kubernetes (`kubectl logs --timestamps --tail=500`). La précision
nanoseconde est conservée dans la chaîne ; elle n'est pas arrondie par `Date`.
`receivedAt` indique séparément la réception du buffer. En l'absence d'une heure
source, `timestamp` vaut `''`, `timestampSource` vaut `unknown` et aucun identifiant
stable n'est inventé. Les formateurs existants n'affichent pas de date pour `''` ;
le fallback `??` de l'export IDE ne substitue pas l'heure courante à cette valeur.

Pour les lignes horodatées, `eventId` est un SHA-256 du workspace, de l'horodatage
source exact, du contenu et du rang parmi les occurrences identiques du buffer.
Deux lignes au même texte mais à des instants différents restent distinctes ; deux
occurrences identiques dans un même buffer sont aussi conservées. Le serveur filtre
les identifiants déjà envoyés sur une connexion, et `watchLogs` les filtre entre les
reconnexions d'un même abonnement. Chaque ensemble est borné à 2 000 identifiants.
Le polling est sérialisé et s'arrête à la fermeture, y compris pendant la première
lecture. Une fenêtre de 500 lignes qui glisse conserve donc les nouveaux événements,
même si sa longueur reste constante. Aucun texte seul ne sert d'identité stable.

## Limites explicites

- Un nouvel abonnement ou un rechargement complet reçoit l'historique, avec ses
  heures source, et non une preuve de nouvelles pannes.
- Les managers anciens qui ne fournissent pas les timestamps gardent le suivi
  positionnel historique. Leur rejeu peut se répéter et une fenêtre ancienne de
  taille constante reste ambiguë ; aucune déduplication fiable n'est prétendue.
- Si plusieurs lignes ont exactement les mêmes octets ET la même nanoseconde et
  que le buffer coupe ce groupe, le rang d'occurrence peut changer. Le protocole
  Kubernetes tail ne fournit pas de curseur durable permettant un exactly-once.
- Plus de 500 événements entre deux lectures peuvent dépasser la fenêtre collectée.
  La borne mémoire implique aussi qu'un événement ancien évincé peut être réémis.
- Le fallback local sans manager conserve son contrat antérieur ; ce lot traite les
  logs Kubernetes. Les événements stdout/stderr des commandes ne changent pas.

## Validation isolée

- Helper API : source/receivedAt, timestamps inconnus, portée workspace, occurrences,
  rejeu, rotation à longueur constante et borne mémoire.
- Vraie route API avec HTTP et WebSockets loopback ; manager et identité en fixtures :
  snapshot, reconnexion et nouvelle ligne dans une fenêtre de taille constante ;
  fermeture pendant la première lecture et absence de polling concurrent quand
  le manager dépasse trois secondes, sans livraison tardive après fermeture.
- Adaptateur remote : reconnexion de socket et déduplication par identifiant,
  conservation des événements inconnus et des textes identiques d'identités distinctes.
- Vrai processus temporaire à la frontière kubectl : refuse l'appel sans
  `--timestamps`, retourne un timestamp nanoseconde intact. Aucun cluster contacté.
- Formateurs web : absence d'heure inventée pour une chaîne timestamp vide.

Ces tests ne constituent pas une recette production ni une preuve de déploiement.
