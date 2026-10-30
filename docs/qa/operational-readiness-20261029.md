# Blocages commerciaux et opérationnels — vérification du 29 octobre 2026

Base distante vérifiée : `fe790924209dbbd79d11eeb73b82cb9c315fe401` (#852).
Livraison 40897035622 réussie à 15:41:16 UTC : scans exacts, signatures, Helm,
rollout, imageIDs et interlock verts. Cette preuve ne certifie ni un paiement,
ni une restauration de données, ni le parcours utilisateur complet. La recette
Aster est menée séparément par le navigateur ; aucun appel IA n'est effectué
dans cet audit.

## Paiements, catalogue et quotas

| Point | Fait actuel vérifiable | Limite et prochaine action |
|---|---|---|
| Prix annuel | `app.ts` checkout n'utilise que `stripePriceAnnualId` pour l'annuel et exige un identifiant `price_…`. L'absence de prix annuel provoque un refus avant Stripe. | L'ancien fallback mensuel est corrigé ; l'existence, le montant et la devise du prix Stripe actuel ne sont pas prouvés. Lire le catalogue effectif depuis `/upgrade` ou `/admin/stripe`, sans soumettre de checkout. |
| Catalogue commercial | Marketing/public : Pro 29/mois, Team 99/mois ; Core sur devis. Le checkout accepte les clés historiques pro/team ; Free est refusé et Enterprise passe par contact commercial. Les lignes Plan persistées sont prioritaires sur les variables d'amorçage. | L'ancienne décision Core25/Pro100 et le catalogue de crédits ne doivent pas être assimilés au checkout actuel. Une réconciliation commerciale et du catalogue effectif reste nécessaire ; aucune conversion de noms ni modification de prix faite ici. |
| Clé Stripe | Les documents historiques rapportent une clé expirée. Aucune nouvelle requête fournisseur ne confirme cette situation aujourd'hui. | `/admin/stripe` ne retourne que présence/configuration et IDs de catalogue, jamais les clés. `/admin/stripe-health` effectue un ping distinct avec l'intégration existante ; son succès ne prouve pas un paiement ni une livraison webhook. Ne pas sauvegarder/rejouer depuis l'UI lors de la lecture. |
| Packs | Contre-épreuve sur main : audit échoué après octroi → HTTP500 et un pack ; retry du même webhook signé → HTTP200 et deux packs. | Correctif transactionnel d'idempotence préparé dans ce lot ; aucune transaction Stripe réelle. Revue, PostgreSQL isolé et CI exacte nécessaires avant livraison. |
| Quotas | 54 tests existants quotas/packs/catalogue réussis sans omission. Le correctif de fenêtre mensuelle pour abonnement annuel est déjà intégré (#738) ; son exercice PostgreSQL historique reste une preuve distincte. | Ne prouve pas les transitions d'un abonnement Stripe réel. Exercice requis sur intégration de test autorisée : facture, renouvellement annuel, impayé, changement de plan, annulation, redelivery concurrente ; aucun débit réel autorisé dans cette tâche. |
| Diagnostic de préparation | Le groupe `stripe-catalog` du validateur accepte l'ancien seed mensuel sans annuel et refuse un seed pro/team monthly+annual sans prix Free/Enterprise. Reproduction CLI isolée, sans dotenv ni réseau. | Ce groupe ne lit pas les Plan DB prioritaires. Une tentative locale de correction imposait à tort l'annuel : retirée après revue. Le validateur est conservé identique à main ; il faut séparer preuve de seed, catalogue DB effectif et preuve fournisseur, sans retirer de gate. |

Surfaces de lecture existantes : `GET /billing/:orgId` (catalogue DB, `billing:read`),
`GET /orgs/:orgId/billing` (plan/abonnement effectifs), `GET /admin/stripe-config`
(administrateur), `GET /admin/stripe/webhook-failures` (métadonnées uniquement).
La présence d'une clé ou d'un ID de prix ne certifie pas sa validité fournisseur.
Le ping de santé lit uniquement `GET /v1/balance` avec l'intégration existante et
ne retourne que l'état/mode au navigateur ; aucun checkout ni débit n'est créé.
Il n'a pas été exécuté dans cet audit.

## Restauration et sécurité

Les PR [#793](https://github.com/openaxcloud/vibecore/pull/793) et
[#794](https://github.com/openaxcloud/vibecore/pull/794) sont ouvertes, brouillon,
non fusionnées lors de cette vérification. Leurs anciens résultats CI sont des
preuves de leurs têtes, pas des capacités livrées. Aucune promotion ni migration
de ces lots n'a été tentée.

Main n'injecte aucun `DatabaseRestoreCoordinator` depuis `server.ts`. Les deux
POST de restauration refusent `503 RESTORE_APPLICATION_CUTOVER_UNAVAILABLE`
avant admission ; `database-provisioner.ts` conserve `restoreAvailable=false`.
Le préflight rend `archiveVerified:false` et `walContinuityVerified:false`.
Un cluster CNPG sain ne devient plus une restauration applicative terminée.

Prérequis exacts avant activation : vérification des octets archive/WAL et
attestation source/cible ; registre exhaustif des consommateurs et exclusion
distribuée ; drainage et preuve d'arrêt y compris anciennes tentatives ;
raccordement API/workspace-manager ; recette isolée CNPG/GCS et reprise après
panne. Un bail expiré ou un participant QA coopérant ne prouve pas l'arrêt de
tous les consommateurs. RPO/RTO commerciaux non établis.

Rejoué maintenant : 82 tests synthétiques sans réseau (exécuteur33, source15,
provisionneur34), aucun ignoré. Les anciennes preuves PostgreSQL/HTTP/IPC et
physiques ne sont pas rejouées et ne constituent pas une restauration production.
Les six fichiers produit de restauration ont été comparés par hash Git aux blobs
de main ; correspondance exacte. Aucun défaut nouveau de faux succès démontré.

Les scans d'images/signatures/rollouts récents sont verts. Cela ne remplace pas
une preuve d'isolation réseau, un exercice de restauration ou un test de charge.
Aucun changement de permission, de réseau, de clé ni de ressource effectué.

## Configuration du parcours complet

`GET /projects/:projectId/deployments/providers` exige `projects:read` et retourne
les noms de variables manquantes, jamais leurs valeurs. Static n'exige aucun
hook fournisseur ; Server exige `WORKSPACE_MANAGER_URL` et
`WORKSPACE_MANAGER_SHARED_SECRET`. Vercel/Netlify/Cloudflare requièrent leurs
hooks ; GitHub Pages requiert token, dépôt et workflow ; Cloud Run/Docker leurs
triggers et intégration existante. Un état `configured` reste une preuve de
présence, pas d'exécution réussie.

16 tests de gardes fournisseurs réussis sans omission, sans appel fournisseur.
Une première invocation avec mauvais cwd n'a trouvé aucun test ; corrigée en
exécutant depuis `services/api`, sans modification d'assertion.

Prochaines preuves utilisables : recette Aster séparée (génération réelle, code,
preview/vignette privée, GitHub, publication et réouverture), lecture du catalogue
et de la santé Stripe avec les accès existants, puis exercices financiers en
mode test et restauration isolée expressément coordonnés. Les anciens rapports
de mai/octobre sont des historiques datés, pas des mesures de configuration live
du 29 octobre. Aucune nouvelle consommation IA ni action OAuth dans ce lot.
