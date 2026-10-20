---
id: BUG-DB-RESTORE-COMPLETION-001
section: "Reprise commerciale du 2026-10-19 — restauration DB"
---

## Bug

**P1 — la santé du cluster suffit à annoncer une restauration terminée.**
La maintenance marque `DatabaseRestore` `COMPLETED` dès `progress.ready`.
Le provisionneur déduit cette valeur de la santé et des instances prêtes du
cluster ; ce chemin ne vérifie ni les données attendues ni la connexion
effectivement utilisée par l'application.

## 📤 Dispatché

Revue, contre-épreuve et correctif de refus intégrés par #743 le 20 octobre.

## 💻 Codé

✅ Garde de sûreté fusionnée par #743 à 13:31:39 UTC, commit
`9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828` : la santé du cluster ne produit plus
une fin vérifiée, les anciennes fins sans preuve sont signalées, les nouvelles
demandes non exécutables sont refusées avant allocation. La fonction de restauration
cloud reste indisponible et ce P1 commercial reste ouvert. Aucun handle ou client supprimé.

## ✅ Testé live

❌ Aucun exercice de production ni RPO/RTO commercial vérifié. Un essai physique
PostgreSQL local distinct a réussi ; son exécuteur reste non fusionné et ne prouve
pas CNPG/GCS ni l’exclusion des consommateurs en production. Le correctif d’archive
runtime #737 couvre un contrat distinct.

## Preuve

[Deux passages du contrat](../reprise/mesures/2026-10-19-restore-contract-reproduction.json) :
cluster non prêt reste `RUNNING` (témoin vert), cluster prêt devient `COMPLETED`
avec date de fin (assertion de sécurité rouge), sans lecture du secret manager
ni écriture du secret applicatif. L'égalité avant/après des secrets concerne
seulement leurs métadonnées ; l'absence d'écriture est observée séparément.
Fastify/provisionneur réels, HTTP loopback avec fixtures explicites et store
mémoire ; aucun cloud ou client touché. Ce n'est pas une restauration physique.

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
