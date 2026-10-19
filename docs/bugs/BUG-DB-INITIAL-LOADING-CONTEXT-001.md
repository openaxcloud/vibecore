---
id: BUG-DB-INITIAL-LOADING-CONTEXT-001
section: "Reprise commerciale du 2026-10-19 — chargement Database"
---

## Bug

**P2 — le contenu Database perd son titre pendant sa première requête.**
Sur main `bb70c7b685ab4ff5017e36b3ffa2b0f11f7fe55a`, le wrapper cache le
Workbench entier jusqu'à la réponse. Son titre générique est masqué sur mobile.
Avant le premier effet, l'absence de payload peut aussi monter le consommateur
avec `{}`, qui propose alors une connexion sans avoir reçu de données.
Une enveloppe HTTP 200 `status:error` peut suivre le même faux état vide.

## 📤 Dispatché

Correction ciblée autorisée ; contre-épreuve réelle locale et revue indépendante.
Aucun changement de transport, de cache, de délai ou d'assertion des tests existants.

## 💻 Codé

Candidat sur `codex/database-loading-state-20261019`, base `bb70c7b68`.
Pas encore fusionné ni déployé. Le titre localisé est partagé entre la coque
initiale et le Workbench. Sans réponse, aucun consommateur de données, formulaire
ou carte n'est monté. Une erreur garde le titre et la récupération existante sans
spinner ; sans projet, le message localisé existant demande de recharger l'IDE.
Les données du cache restent montées tant que le rafraîchissement silencieux
reste en attente ; aucune conservation après une enveloppe d’erreur n’est
revendiquée par cette preuve.

## ✅ Testé live

❌ Aucune preuve sur HTTPS public ou Safari réel. Le gate main refuse la livraison.
Le correctif ne prétend pas résoudre une lenteur amont non attribuée.

## Preuves et limites

- Main E2E [39182148514](https://github.com/openaxcloud/vibecore/actions/runs/39182148514) :
  454 tests rapportés, un échec persistant DB3377, zéro flaky, six exemptions
  inchangées, 74/74 fichiers. Sur les trois essais, le panneau est monté,
  visible, occupé ; son GET attend encore une réponse à 5042/5100/5055 ms.
  Aucune réponse n'est observée avant l'échec du titre à cinq secondes.
  Cela ne distingue pas attente serveur, latence API et requête bloquée.
- [Déploiement 39182148402](https://github.com/openaxcloud/vibecore/actions/runs/39182148402)
  refusé le 19 octobre à **01:10:27 UTC**, avant build et rollout.
- Même cas sur la PR #738 tête `9245b8228`, verdict 01:16:01 UTC : 454 tests,
  un échec persistant, zéro flaky, six exemptions, 74/74 fichiers. Son cas
  My Data passe au premier essai en 32,9 s ; cela n'est pas une preuve live.
- Contre-épreuve navigateur Chromium 390×844 sur l'ancien build (sources produit
  identiques à main) : vraie réponse locale reçue en **697 ms**, requête
  maintenue pendante **6508 ms** dont **5811 ms** de retenue après réception amont, titre absent au seuil inchangé
  de cinq secondes. Puis octets inchangés libérés, vraie carte et **128 tables**.
  La latence induite est explicitement expérimentale ; aucun succès API inventé.
  Binding et projet QA supprimés, HTTP 200 chacun. Aucune donnée client touchée.
- Les tests HTTP unitaires utilisent des fixtures explicites et le vrai wrapper
  extrait par AST, avec dépendances UI/store hors périmètre remplacées. Le titre
  partagé réel est monté. Ils ne sont pas la preuve navigateur/routeur intégrée.
- Régression navigateur ajoutée : réponse réelle retenue en EN/FR, titre visible
  sous cinq secondes, aucune carte ni formulaire avant réponse, puis vraie
  carte et tables sous les bornes existantes de trente secondes. Résultats finaux du candidat ci-dessous.


## Validation du candidat — 19 octobre 2026

[Preuve structurée](../reprise/mesures/2026-10-19-database-loading-validation.json) :
**71 tests / 10 fichiers**, zéro saut, configuration Vitest du dépôt ; types web
et diagnostics DOM stricts, lint et build complet réussis. Le build a utilisé
au maximum 12 582 305 792 octets sur la limite de 17 179 869 184 octets ; aucune
OOM. Empreintes des six fichiers candidats figées et revérifiées.

Navigateur : **4/4**, zéro retry, sur le build complet, l'API et PostgreSQL réels.
Nouveaux cas EN/FR 16,6 s chacun ; cas historiques tables 10,4 s et My Data 28,8 s.
Pour EN/FR, attente requête→livraison **6424 / 6627 ms** ; réception du corps amont
après **2465 / 411 ms**, puis retenue de **3959 / 6216 ms**. Le titre reste visible
pendant l'attente ; aucune carte ni formulaire avant réponse. Après libération,
**128 tables** dans chaque langue. Ce n'est pas un benchmark comparatif ni une
attribution de la lenteur CI.

Les quatre captures EN/FR sont inspectées par deux lecteurs :
[EN en attente](../reprise/captures/2026-10-19-database-en-pending.png),
[EN chargé](../reprise/captures/2026-10-19-database-en-ready.png),
[FR en attente](../reprise/captures/2026-10-19-database-fr-pending.png),
[FR chargé](../reprise/captures/2026-10-19-database-fr-ready.png).
Statut de la connexion externe « indisponible » conservé honnêtement ; aucun
secret visible. La capture [avant correction](../reprise/captures/2026-10-19-database-before-pending.png)
montre l'absence du titre sur l'ancien build.

[Reprise navigateur distincte](../reprise/mesures/2026-10-19-database-loading-retry-browser.json) :
une requête avant Retry, deux après ; A est annulée dans le navigateur, B répond
réellement HTTP 200, carte puis 128 tables. La libération tardive du handler A
ne retire pas le contenu B ; elle ne prouve ni livraison de A au navigateur ni
annulation du SQL amont. Trois captures inspectées, cleanup propre HTTP 200.

Nettoyage : les deux nouveaux E2E retirent leurs connexions/projets en HTTP 200.
Le premier nettoyage des fixtures historiques a échoué sur un lien Prisma
manquant dans le worktree local. Après ajout des quatre liens locaux existants,
une passe dédiée, **sans rejouer les tests**, a supprimé les deux bindings et les
deux projets (quatre HTTP 200). Une tentative préalable avait refusé les ports
avant tout démarrage ; aucun propriétaire tiers n'a été arrêté. Le nettoyage
final dédié finit sans processus propre restant. Les identités QA restent dans
la base locale isolée. Aucun changement de dépendance ou lockfile commité.
