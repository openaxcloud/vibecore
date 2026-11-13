# Admission dormante avant les migrations au Publish

Lot construit au-dessus de PR920, sans activation production ni levée du503.

Le chemin Publish branche désormais l'option d'admission existante avant la
création du journal de migration, la demande de snapshot au fournisseur et le
premier DDL. Il ne suffit pas de protéger uniquement la connexion SQL : le
snapshot est déjà un effet externe dont l'achèvement peut devenir incertain.

Le runner expose beforeEffects pour cette intégration. Un refus ou acquittement
incertain interrompt le chemin avant ces effets, sans le convertir en succès.
Un replay déjà enregistré ne crée pas de nouvelle opération ni de nouveau ticket.
La classification correcte des anciens états de replay et des erreurs de COMMIT
est traitée dans un lot séparé, pas présumée résolue ici.

L'instance production et son secret sont vérifiés par le même mécanisme que les
routes SQL de PR920. Le runner copie l'entrée et les instructions avant ses await,
afin que la cible/SQL utilisés restent ceux soumis à l'admission. Aucun ticket
n'est réglé automatiquement après le backup, le DDL, une erreur ou une réponse.
L'option reste absente des configurations de serveur production.

Tests : attente/refus avant tout journal/backup/SQL, cible et SQL stables malgré
mutation de l'appelant, replay commité sans nouvelle admission ; routage HTTP
Publish réel avec ports de test ; PostgreSQL réel + HTTP manager contrôlé pour
succès, fermeture par restauration et erreur SQL, avec vérification de la dette,
du nombre de snapshots et du schéma réellement écrit.

Ce branchement ne couvre pas encore toutes les écritures des runtimes, clients
tiers, tâches planifiées ou outils agent, ni leur clôture d'effets externes.
L'exhaustivité et le lifecycle des tickets restent préalables à toute activation.

Un conflit du verrou de migration après admission conserve volontairement son
ticket même sans journal créé. Le lien ticket/exécution et le rapprochement de
ces admissions orphelines restent à implémenter avant récupération automatique ;
aucune expiration n'est utilisée pour masquer cette limite.
