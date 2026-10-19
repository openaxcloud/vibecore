# Restauration : relecture du main actuel

Relecture du 18 octobre 2026, arbre de `c6439da55bebf180fe43dce65dbc5c32e6a9fa0a`
identique à la tête testée `1d2755086`. Ces constats sont de code ; aucun
exercice Cloud SQL, CNPG, GCS ou PVC n'est exécuté ici.

- **Fin de restauration DB sans bascule prouvée.** La [maintenance API](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/app.ts#L34017)
  marque `COMPLETED` dès `progress.ready`. Le [provisioner](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/database-provisioner.ts#L746)
  ne lit que la santé du cluster restauré ; la [mise à jour du store](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/prisma-store.ts#L3247)
  ne modifie que statut, erreur et dates. Ce chemin ne bascule pas la connexion
  de l'application. Un cluster sain n'atteste ni les données attendues ni leur utilisation.
- **Environnement production perdu.** La [route](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/app.ts#L36010)
  sélectionne l'instance avec `body.environment`, puis [startRestore](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/app.ts#L36085)
  ne le reçoit pas. Le [manifeste de récupération](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/database-provisioner.ts#L411)
  choisit donc le nom de cluster par défaut ; le Backup à la demande fait de même.
- **Convergence vers le Pod non attestée.** La [synchronisation](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/app.ts#L16507)
  n'envoie que `path` et `content` et absorbe les erreurs d'écriture/suppression.
  Les [fichiers binaires](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/project-storage.ts#L64)
  ont pourtant `encoding=base64`. La [réponse de restauration](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/app.ts#L28817)
  peut ainsi confirmer le stockage API sans confirmer les octets ni l'état du Pod.
  La correction bornée de l'encodage est en préparation dans la branche dédiée ;
  la politique de convergence reste distincte et non corrigée.
- **Inventaire de sauvegardes distinct de leur succès physique.** La [maintenance](https://github.com/openaxcloud/vibecore/blob/c6439da55bebf180fe43dce65dbc5c32e6a9fa0a/services/api/src/app.ts#L33994)
  crée sa ligne snapshot avant la soumission CNPG et absorbe une erreur de soumission.
  Les fenêtres calculées à partir de la rétention du plan ne prouvent pas la disponibilité des WAL.

Le [candidat de refus runtime honnête](2026-10-18-candidats-valides.md) ferme un
contrat distinct : création sans archive et restauration par identifiant annoncées
à tort réussies. Ses tests locaux ne ferment aucun des besoins d'exploitation
ci-dessus. Pour clôturer le lancement : restauration isolée autorisée, comparaison
des données/octets, bascule et reconnexion vérifiées, mesures RPO/RTO et retour
arrière. Les durées des runbooks sont des objectifs tant que cet exercice manque.

## Contre-épreuve du 19 octobre — sources main vérifiées

[Preuve structurée et limites](mesures/2026-10-19-restore-contract-reproduction.json) :
deux passages, chacun deux témoins verts et deux contrats rouges, durées
20,95 s et 12,93 s. L'environnement production disparaît de `startRestore` ;
le manifeste sans suffixe production est observé. Un simple statut CNPG prêt
fait aussi passer `RUNNING` à `COMPLETED`, sans écriture de secret applicatif ni
lecture du secret de connexion manager. La comparaison des secrets porte sur
leurs métadonnées seulement. Fastify et provisionneur réels, HTTP loopback avec
fixtures explicites, store mémoire ; aucun PostgreSQL/GCS/CNPG/PVC physique.
Aucun appel distant et quatre serveurs fermés à chaque passage. Les défauts
restent ouverts, distincts de la correction binaire #737 maintenant fusionnée.
