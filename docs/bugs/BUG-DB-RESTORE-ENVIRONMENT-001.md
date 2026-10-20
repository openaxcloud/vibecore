---
id: BUG-DB-RESTORE-ENVIRONMENT-001
section: "Reprise commerciale du 2026-10-19 — restauration DB"
---

## Bug

**P1 — l'environnement production disparaît avant le provisionnement de restauration.**
La route sélectionne la bonne instance via `body.environment`, mais ne transmet
pas ce contexte à `startRestore`. Le vrai provisionneur produit alors un nom de
source sans suffixe production. Les sauvegardes à la demande ont également un
défaut de propagation relevé dans le code ; leurs archives existantes ne sont
pas vérifiées ici.

## 📤 Dispatché

Revue, contre-épreuves et propagation du contexte intégrées par #743 le 20 octobre.

## 💻 Codé

✅ Propagation de l’environnement et de la source Barman fusionnée par #743
à 13:31:39 UTC, commit `9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828`, avec tests
de non-régression. Les archives cloud existantes restent à vérifier ; la correction
du contexte et les tests de manifeste ne prouvent pas leur contenu ni une bascule réelle.

## ✅ Testé live

❌ Aucun exercice physique PostgreSQL/GCS/CNPG/PVC ou preuve production.

## Preuve

[Deux passages du contrat](../reprise/mesures/2026-10-19-restore-contract-reproduction.json) :
témoin développement vert, assertion production rouge. Fastify `inject`, vrai
provisionneur et HTTP loopback vers une fixture CNPG explicite, store mémoire.
Aucune archive n'est lue : le nom incorrect du manifeste est prouvé, pas le jeu
de données que CNPG chargerait effectivement. Aucun appel distant ni donnée
client ; tous les serveurs de fixture sont fermés.

## Reproductibilité et prochaine correction

Les scripts, configurations et logs actuels sont temporaires, référencés par
empreinte : la contre-épreuve n’est pas entièrement contre-auditable depuis
GitHub et ne constitue pas une nouvelle garde CI. La future correction devra
versionner une reproduction propre sans secret et ses tests de non-régression,
avec le correctif ; ne pas ajouter un test connu rouge à main sans résolution.


## Relevé historique du 20 octobre avant fusion

Correctif candidat dans la branche `codex/restore-completion-integrity-20261019`,
avec régressions versionnées et contre-épreuves sur main e40. [Périmètre et
preuves](../reprise/2026-10-20-restauration-integrite.md). **Pas encore fusionné
au relevé de rédaction ; aucun test live de restauration.** La capacité complète
reste indisponible : l'API refuse avant allocation tant que la bascule applicative
n'est pas implémentée et vérifiée. Le refus honnête n'est pas une restauration
fonctionnelle et ne clôt pas ce P1 commercial.

## Fusion observée le 20 octobre à 13:31:39 UTC

[Preuve #743 et contrôles du SHA exact](../reprise/mesures/2026-10-20-pr743-result.json).
La fusion est acquise ; livraison du nouveau main en cours, origine HTTPS inaccessible
depuis ce workspace. Aucun succès live déduit de cette fusion.
