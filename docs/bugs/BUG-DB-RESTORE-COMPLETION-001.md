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

Revue et contre-épreuve de contrat terminées, sans changement produit.

## 💻 Codé

❌ Non corrigé. La fin de restauration doit dépendre de la bascule et de sa
vérification, avec traitement honnête des demandes déjà lancées. Les handles et
ressources existants doivent être préservés ; aucune suppression cloud effectuée.

## ✅ Testé live

❌ Aucune restauration physique, intégrité des données, reconnexion ou mesure
RPO/RTO vérifiée. Le correctif d'archive runtime #737 couvre un contrat distinct.

## Preuve

[Deux passages du contrat](../reprise/mesures/2026-10-19-restore-contract-reproduction.json) :
cluster non prêt reste `RUNNING` (témoin vert), cluster prêt devient `COMPLETED`
avec date de fin (assertion de sécurité rouge), sans lecture du secret manager
ni écriture du secret applicatif. L'égalité avant/après des secrets concerne
seulement leurs métadonnées ; l'absence d'écriture est observée séparément.
Fastify/provisionneur réels, HTTP loopback avec fixtures explicites et store
mémoire ; aucun cloud ou client touché. Ce n'est pas une restauration physique.
