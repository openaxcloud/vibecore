---
id: BUG-WORKSPACE-PROVISION-RESOURCES-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

Le démarrage automatique envoyait au workspace-manager le forfait par défaut sans les ressources de l’abonnement. Les démarrages
explicites et redémarrages envoyaient les droits issus de la facturation.
Le même espace pouvait donc recevoir deux spécifications de ressources
immutables différentes, même pour un client payant. Défaut reproduit sur
`main` `3f6acb9cfb9d0b6647cea8fc8c0080fe5d55d7f9` le 18 octobre.

## 📤 Dispatché

☑ Reprise ciblée du contrat de ressources de #708 le 18 octobre 2026.

## 💻 Codé

☑ Fusionné par #733 le 18 octobre 2026 à 15:32:55 UTC, commit
`615b3fcfb59c0c42cd211536ed2b2675fe72fa5f`. Livraison
[39140979431](https://github.com/openaxcloud/vibecore/actions/runs/39140979431)
réussie à 16:35:44 UTC, rollout et comparaison des imageIDs réussis. Les quatre sites de construction du corps de démarrage
utilisent les droits actuels pour free/pro/team/enterprise. Le contrat
automatique existant de starter/core est préservé pendant que leur migration
explicite et leur metering restent ouverts. Une lecture de facturation
en échec ne déclenche pas un démarrage gratuit ni une nouvelle réservation.

## ✅ Testé live

☐ Accès HTTP aux deux domaines refusé par le proxy de l'environnement.
Aucune disparition des collisions, aucun pod réel ni parcours de génération
publié certifié par cette correction locale.

## Preuve

`services/api/src/tests/workspace-provision-resources.spec.ts` : sept tests
isolés d'API, avec un serveur HTTP local qui enregistre les requêtes et un
magasin en mémoire. Ce banc n'est pas une preuve Kubernetes ni Stripe.
Les quatre forfaits historiques, les surcharges du catalogue et deux états
initiaux pendant une panne de facturation sont couverts. Sept verts lors de la première passe ; six rouges et un vert en rétablissant
le code de main. La suite finale ajoute deux gardes de compatibilité
starter/core : neuf cas ciblés verts, inclus dans 126 cas voisins passés
(12 fichiers, trois sauts préexistants). Typecheck et build API passent ;
aucun diagnostic lint ajouté aux 338 diagnostics préexistants de app.ts.

La PR #708 est restée intacte. Sa protection des démarrages en vol n'est pas
reprise ici ; son repli silencieux de facturation et sa conversion de forfaits
ne sont pas intégrés. Le manager refuse toujours `starter`/`core` ; choisir leur
correspondance change aussi le metering, et ne peut pas être présenté comme
une simple correction de libellé. Le comptage des collisions sur 24 heures et
la vérification du parcours réel restent nécessaires.

Les 25 contrôles de PR sont terminés avant fusion : 23 réussis et deux sauts
conditionnels attendus. La [CI native](https://github.com/openaxcloud/vibecore/actions/runs/39139487732)
et les [quatre tranches E2E locales](https://github.com/openaxcloud/vibecore/actions/runs/39139487657)
passent. Les mêmes neuf cas passent dans la suite API de main (2 402 cas
passés, 23 sauts). La livraison est attestée par le workflow ; le parcours
fonctionnel live et la mesure de collisions restent non vérifiés.
