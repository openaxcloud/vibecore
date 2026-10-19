---
id: BUG-BILLING-ANNUAL-MONTHLY-QUOTA-001
section: "2026-10-18 — Vérification avant commercialisation"
---

# BUG-BILLING-ANNUAL-MONTHLY-QUOTA-001 — Quotas mensuels bloqués pendant l'année payée

## Bug

P1 — L'offre actuellement routée `/pricing` annonce des messages et déploiements **par mois**, y compris avec paiement annuel. Sur `main` `b827b12255d423ffb96143c39c1d2a3917ffc5e2`, le webhook conserve correctement les bornes annuelles, mais `resolveUsagePeriodStart` réutilise le début annuel pour toutes les allocations mensuelles. Exemple : abonnement Pro du 15 janvier 2026 au 15 janvier 2027, 1 000 messages et 50 déploiements en janvier ; au 15 février, zéro consommation du nouveau mois mais quota toujours épuisé.

## 📤 Dispatché

☑ — 18/10/2026, correctif borné autorisé dans un worktree distinct.

## 💻 Codé

☑ — Fusion protégée de #738 le 19 octobre 2026 à **03:13:44 UTC**, main `bbbcf3239`, tête validée `816e62ec2`. [Preuves exactes](../reprise/mesures/2026-10-19-pr738-result.json). Livraison encore en attente au relevé de fusion ; aucune preuve Stripe réelle.

Une résolution mensuelle dédiée s'applique uniquement aux allocations de messages, jetons, appels d'outils, previews publiques, déploiements et instantanés. La résolution historique reste utilisée par les vues financières, `/credits`, les alertes PAYG et les plafonds de dépense par membre ; leurs agrégations et dates de facturation ne changent pas. Les jauges de projets, membres, espaces actifs, stockage et terminaux gardent leurs mécanismes existants. Aucun montant, plan, checkout, webhook, statut d'abonnement, crédit prépayé ou donnée persistée n'est changé.

Le contrat stocké ne contient pas l'intervalle de paiement. Le correctif subdivise seulement une période valide **strictement supérieure à 45 jours**. Ce seuil conservateur distingue les périodes longues des cycles mensuels de 28 à 31 jours, avec marge pour les décalages d'heure ou de calendrier. Il ne prétend pas identifier un prix Stripe annuel. Les périodes courtes, absentes ou invalides conservent leur comportement ; un webhook mensuel en retard ne crée pas de renouvellement implicite.

L'ancrage retenu est le jour et l'heure **UTC du début de période**. Chaque anniversaire est recalculé depuis cet ancrage : 31 janvier → 28/29 février → 31 mars, sans dérive vers le 28. La borne est inclusive. La date d'observation est plafonnée à la fin connue moins une milliseconde : sans nouveau webhook, aucune allocation supplémentaire n'est créée au-delà de l'échéance annuelle. Une réactivation des droits reprend le même ancrage ; un nouveau début de période fourni par webhook devient le nouvel ancrage. Les statuts sans droits utilisent toujours le mois civil UTC gratuit.

## Contre-épreuves locales

- Extraction initiale de la vraie logique de production, sans changement de comportement : 14 cas rouges et 16 verts parmi les 30 premiers cas calendaires (`/tmp/vibecore-annual-quota-red.log`). Les deux cas supplémentaires couvrent début futur et réactivation.
- Vrais handlers Fastify via injection locale (`app.inject`), webhook signé localement → usage, avec `TestApiStore` en mémoire et horloge déterministe : abonnement annuel rouge ; témoins mensuel renouvelé et mensuel avec webhook tardif verts (`/tmp/vibecore-annual-quota-http-red.log`). Le refus utilise le vrai `assertQuota`. Le candidat final ajoute les appels au vrai `POST /projects/:projectId/ai/check-quota` : 429 avant la borne, 200 après renouvellement, puis 429 au plafond de février. Il conserve aussi la dépense PAYG de janvier dans la fenêtre annuelle et son plafond personnel, ainsi que la paire début/fin de `/credits`. Aucun appel au service Stripe et aucun paiement. La signature est créée avec un secret de test explicite.
- Les cas couvrent le passage janvier/février, la milliseconde avant la borne et la borne exacte, la consommation au plafond dans le nouveau mois, les fins de mois, année bissextile, décembre/janvier, plafond à la fin annuelle, statuts avec/sans droits, début futur, fin absente/invalide et périodes mensuelles inchangées.

Validation locale sur la base `b827b122` :

- **68/68 tests API**, huit fichiers, zéro skip, un worker, 26,31 s ; `/tmp/vibecore-annual-quota-tests-final.log`. Dont 32 cas calendaires et trois scénarios de handlers Fastify via injection locale : annuel, mensuel renouvelé et mensuel avec webhook retardé. Aucun serveur HTTP écoutant ni échange réseau n’est revendiqué. Le store est en mémoire ; aucun PostgreSQL ni serveur Stripe réel n'est utilisé.
- **16/16 tests du générateur d'inventaire**, un fichier, zéro skip ; `/tmp/vibecore-annual-quota-index-tests.log`. Index régénéré officiellement avec `node scripts/migrer-inventaire-bugs.mjs --index` : 431 entrées.
- Typecheck et build officiels API exécutés : `/tmp/vibecore-annual-quota-typecheck-final.log`, `/tmp/vibecore-annual-quota-build.log`. Aucun build web n'est requis par ces deux fichiers de production API ; aucune surface visuelle n'est modifiée.
- ESLint différentiel : **zéro diagnostic ajouté**. `app.ts` conserve exactement les 324 erreurs et 14 avertissements historiques de la base, rapprochés par lignes inchangées, règle et message. Les trois nouveaux fichiers et le garde de déploiement modifié ont zéro erreur et zéro avertissement ; `/tmp/vibecore-annual-quota-eslint-differential.json`. Le lint global n'est pas déclaré propre.
- Mémoire mesurée avant les suites : 3,94 Go avant la première suite et 3,80 Go avant la suite finale, sur 16 Gio. Aucune suite SQL, aucun Docker, aucun navigateur ou fournisseur externe.

La contre-revue indépendante n'a trouvé aucun nouveau P0/P1/P2 après isolement des fenêtres financières. Elle a comparé l'algorithme à un oracle sur 5 520 combinaisons calendaires en mémoire et confirmé que le corps du resolver financier historique reste identique à la base. L'offre web et le catalogue avaient déjà 23/23 tests prix/upgrade verts lors de l'audit préalable ; ces tests ne couvraient pas le défaut de fenêtre annuelle.

## ✅ Testé live

☐ — Aucun appel Stripe, PostgreSQL de production, paiement, ressource cloud ou donnée client. Les refus historiques restent conservés ; la tête finale `816e62ec2` est fusionnée après CI et E2E verts. La livraison et le parcours payé réel ne sont pas encore attestés au relevé de fusion. Le correctif dépend de bornes de période valides déjà enregistrées ; il ne répare pas un abonnement dont les dates sont absentes ou incorrectes et n'invente pas leur valeur.

## Réactualisation après le correctif UI — 19 octobre

#740 est fusionnée dans `bb70c7b68` à 00:44:41 UTC ; #738 est rebasée sur ce commit.
Le seul conflit est l'index dérivé, régénéré officiellement à 438 entrées.
Les deux fichiers de production quota et les trois fichiers de tests modifiés
sont identiques octet pour octet à `bee26fd28` : aucun contrat financier changé
pendant ce rebase. **68 tests API passent à nouveau**, huit fichiers, zéro saut,
en 42,17 s. Le typage, les contrôles d'index et la CI exacte sont consignés
dans la [mesure de rebase](../reprise/mesures/2026-10-19-pr738-ui-rebase.json).

La [contre-épreuve Prisma/PostgreSQL locale](../reprise/mesures/2026-10-18-annual-quota-postgres-local.json)
reste distincte des tests en mémoire : usage précédent exclu, nouveau plafond
appliqué, fenêtre financière et plafond personnel préservés, base temporaire
supprimée. Elle n'est pas rejouée ni attribuée au nouveau SHA ; les fichiers
de code qui la concernent sont comparés identiques. Elle ne constitue pas
une transaction Stripe ni une preuve de production.

## Rebase après #741 — 19 octobre

Nouvelle base main `9d7ff755c`, après fusion protégée de #741 à 02:38:54 UTC.
Les cinq fichiers source/tests quota restent identiques à `9245b8228`. Nouvelle
validation : 68 tests API et typage complet verts ; preuves PostgreSQL antérieures
conservées sans les attribuer à une nouvelle exécution. Index régénéré, entrée
#740 en double retirée, journal #741 consigné. La nouvelle tête doit encore
passer sa propre CI avant fusion ; aucune livraison du quota ni preuve Stripe
mode test ou paiement réel n'est revendiquée.

## Fusion du 19 octobre — 03:13:44 UTC

La tête finale `816e62ec2` passe 9 760 tests racine et 2 463 API ; E2E :
456 cas rapportés, zéro échec persistant/zéro flaky Chromium, six exemptions
inchangées, 75/75 fichiers. WebKit distinct : 16 passés, un flaky, trois sauts.
Fusion `bbbcf3239`, arbre identique, contrôles et livraison de main suivis séparément.
Les paragraphes de rebase précédents sont historiques.
