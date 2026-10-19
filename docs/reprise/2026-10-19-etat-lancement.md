# État du lancement — 19 octobre 2026

Relevé arrêté à **03:50 UTC** : les exécutions liées ci-dessous peuvent évoluer
après ce constat. Une fusion ou une construction ne vaut pas preuve de livraison.

**Commercialisation complète non validée.** Des défauts ont été corrigés et
fusionnés ; les preuves indispensables de restauration et de parcours réel
restent manquantes. Ce verdict ne signifie pas que tous les parcours échouent
en production.

## Code intégré et livraison

Main est `bbbcf3239296dfa55d60160aba8e19742136a111`, après fusion protégée
de [#738](https://github.com/openaxcloud/vibecore/pull/738) à **03:13:44 UTC**.
Son arbre est identique à la tête validée `816e62ec2` : 23 contrôles réussis,
deux sauts conditionnels ; 9 760 tests racine et 2 463 API passent. E2E :
456 cas rapportés, zéro échec persistant/zéro flaky Chromium, six exemptions
inchangées, 75/75 fichiers. WebKit séparé : 16 classés passés, un flaky,
trois sauts. [Fichiers exacts et résultats](mesures/2026-10-19-pr738-result.json).

Les contrôles du nouveau main passent : CI à **03:27:16 UTC**, E2E à
**03:39:59 UTC**, 456 cas rapportés, zéro échec persistant, **cinq cas réussis
après reprise**, six exemptions inchangées et 75/75 fichiers. Les quatre cas
DB examinés passent au premier essai. WebKit séparé : 16 classés passés, un
flaky et trois sauts. [Preuves main](mesures/2026-10-19-main738-validation.json).
Sa [livraison](https://github.com/openaxcloud/vibecore/actions/runs/39193686200)
attend celle de #741. Le dernier déploiement réussi attesté reste `c6439da55`,
le 18 octobre à 21:35 UTC. **Aucune nouvelle version servie n'est déduite de
la fusion.**

[#741](https://github.com/openaxcloud/vibecore/pull/741), fusionnée à
**02:38:54 UTC** dans `9d7ff755c`, conserve le contexte Database et sa
récupération pendant un poll après erreur. Sa CI de main passe ; le verdict
E2E à **03:04:13 UTC** rapporte 456 cas, zéro échec persistant, trois
instabilités, six exemptions inchangées et 75/75 fichiers. Les quatre cas DB
examinés passent au premier essai. WebKit de ce main : 17 passent, trois
sauts. [Preuves main](mesures/2026-10-19-main741-validation.json).
Sa livraison a franchi ses barrières ; la construction du runtime réussit à
**03:35:19 UTC** après 29 min 28 s, celle du web à **03:44:43 UTC** et celle
de l'agent à **03:47:22 UTC**. La construction de l'administration reste en cours
à **03:50 UTC** ; aucun rollout réussi n'est encore attesté.

Les correctifs #736 (indicateurs honnêtes), #737 (archives runtime et octets
binaires) et #740 (palette, Retry et build Desktop) sont également fusionnés.
Leurs précédentes livraisons ont été refusées par les E2E de main. Leur
présence dans une future livraison doit être confirmée par le pipeline et le
manifeste, pas par leur seule présence dans Git.

## Cinq conditions indispensables

| Condition | État établi et preuve restant nécessaire |
| --- | --- |
| Compte neuf → agent → exécution → persistance → publication accessible | Aucun parcours complet réussi sur la version servie n'est établi. Il faut une identité QA et une boîte mail autorisées, une génération réelle avec budget explicite, l'écriture/réouverture des fichiers puis une URL publiée utilisable depuis une autre session. Les E2E bloquants excluent `@runtime`. |
| Ressources, quotas et isolation | Les correctifs d'admission sont intégrés ; la dernière livraison réussie a passé sa garde ConfigMap. V2 reste désactivé. Inventaire/réconciliation legacy et drainage restent requis avant toute activation. Les refus inter-organisations locaux ne prouvent pas l'isolation réseau/GCS/PVC réelle. |
| Facturation cohérente | #738 corrige la fenêtre mensuelle des allocations dans une période longue sans déplacer les fenêtres financières/PAYG. Fusion prouvée, livraison encore à établir. Le test PostgreSQL local utilise un webhook synthétique signé ; il ne remplace pas Stripe TEST : catalogue, mensuel/annuel, idempotence, droits, refus, annulation et changement de formule. |
| Sauvegarde et restauration | Deux P1 reproduits restent non corrigés : perte de l'environnement production et `COMPLETED` fondé sur la seule santé du cluster. Il faut une origine d'archive vérifiable, une bascule applicative durable, puis une restauration isolée PostgreSQL/GCS/PVC avec intégrité et durées mesurées. Aucun RPO/RTO validé. |
| Mobile, Safari et erreurs honnêtes | Les contrôles locaux et CI bornent plusieurs corrections. Il reste le parcours critique authentifié sur HTTPS, petits écrans et Safari : clavier, navigation, reconnexion, sauvegarde, publication et récupération d'erreur, sur la version effectivement servie. |

La [preuve navigateur complémentaire du poll à 60 secondes](mesures/2026-10-19-database-real-60s-poll.json)
utilise une erreur initiale HTTP explicitement injectée, sans modifier l'horloge.
Le poll réel arrive après **59 985 ms** ; titre, alerte et Retry restent visibles.
Retry lance le troisième GET réel et affiche les **128 tables** du PostgreSQL QA
local. Quatre captures inspectées indépendamment ; liaison DB et projet supprimés,
aucun serveur possédé encore actif. La requête du poll est annulée dans le navigateur :
la libération tardive de son handler ne prouve pas que cette réponse a été consommée.
Ce test n'est ni une panne de production ni une preuve Safari.

## Dépendances et limites d'accès

À **02:12:23 UTC**, HEAD sur `e-code.ai`, `app.e-code.ai` et `api.e-code.ai`
est refusé par le proxy : CONNECT 403, origine non atteinte. La disponibilité
publique et le SHA réellement servi restent inconnus.
[Relevé HTTPS](mesures/2026-10-19-public-https-access.json).
L'accès GitHub permet les lectures, PR et fusions protégées ; l'accès opérateur
GCP/Kubernetes, les identités QA/mailbox et Stripe TEST restent indisponibles ici.
Aucune donnée client, aucun paiement ni nouvelle ressource QA payante n'a été utilisé.

La restauration ne peut pas être corrigée par le seul passage de `environment` :
les anciennes lignes de snapshot ne lient pas une archive source vérifiée, et
la connexion recalcule le cluster d'origine au lieu d'une cible active durable.
Une fermeture honnête du parcours automatique doit traiter aussi ses capacités,
ses erreurs visibles et les opérations déjà lancées, avec coordination opérateur.
Les preuves temporaires de contrat ne sont pas entièrement contre-auditables
depuis GitHub et n'ajoutent aucune garde CI. La future correction doit versionner
sa reproduction propre et ses régressions avec le correctif, sans ajouter de
tests connus rouges à main.

L'audit dépendances conserve **242 alertes**, dont quatre lignes critiques
correspondant à trois avis. Capacitor natif doit être corrigé avant distribution
native ; les deux avis Tinypool concernent l'outillage de tests et exigent une
pollution préalable du prototype dans les vecteurs documentés. Aucun exploit
web/API n'est établi. Les SBOM des images servies et les 92 alertes élevées
restent à vérifier. [Revue ciblée](mesures/2026-10-19-critical-advisories-review.json).

## Travaux reportables et estimation

Seulement si exclus explicitement de l'offre : natif/Desktop, SSO Enterprise,
connecteurs secondaires, parité visuelle exhaustive et optimisation de durée CI.
Les cinq conditions ci-dessus restent indispensables à une annonce de lancement
complet. Aucun délai global fiable n'est établi : il dépend des accès et des
résultats réels Stripe, génération/publication et restauration.

Les [22 PR anciennes en brouillon](mesures/2026-10-19-old-pr-deletions.json)
ont été relues pour leurs suppressions de fichiers. Seule #324 en propose :
26 suppressions, dont cinq chemins encore présents dans main. Les branches
restent intactes ; cette vérification ne vaut pas revue sémantique ni accord de fusion.
