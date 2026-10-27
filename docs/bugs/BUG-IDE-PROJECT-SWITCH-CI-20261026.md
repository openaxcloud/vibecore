---
id: BUG-IDE-PROJECT-SWITCH-CI-20261026
---

## Bug

Signal CI #802, tête 279440d2f, run 40269242521 : après Retour de B vers A à 390 px, l'assertion README lit trois fois PROJECT-B-DOCUMENT puis ne trouve plus d'éditeur pendant son budget de cinq secondes. Le test passe au retry 1. Aucune écriture interprojet n'est démontrée par ce journal.

## 📤 Dispatché

26/10/2026 — diagnostic local avec réponses réelles retardées ; #799 et les lots locaux précédents préservés.

## 💻 Codé

☐ — aucun correctif produit ou test de dépôt appliqué : cause exacte de l'échec CI non établie. Le contretest local montre que le même symptôme peut apparaître pendant le chargement de route, avant application de A. Aucun délai relevé et aucune assertion supprimée.

## ✅ Testé live

☐ — aucune production. Sur le build local 6f270b9bc : test exact à 390 px et contrôle d'archive retenue à 390 px verts directement. La sonde fine n'observe pas de contenu B sous l'en-tête A ni après binding A. Les sélections A/B en base isolée et les requêtes de sélection restent séparées. Un contretest retient le vrai loader A : l'assertion originale expire à 5023 ms pendant URL A / routeur B en chargement / en-tête B ; après libération, A retrouve son README. Mécanisme compatible avec le signal CI, sans causalité CI prouvée.

Preuves et qualification : `ide-navigation-pr802-2026-10-26/README.md`. Le build local inclut les correctifs focus/composition non présents dans #802 ; les tests et trois modules centraux de chargement/isolation sont identiques à la tête CI.
