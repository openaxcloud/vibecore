---
id: BUG-AGENT-CODE-HEADER-OVERLAP-20261028
---

## Bug

Le badge de langage et le bouton copie du bloc de code recouvrent sa première ligne.

## 📤 Dispatché

☑ 28/10/2026 — diagnostic reproduit localement sur données synthétiques.

## 💻 Codé

☐ main — lot local distinct des têtes838/839 ; aucune fusion ni livraison.

## ✅ Testé live

☐ production — Chromium local, aucune donnée cliente ni opération réelle.

## Correction et validation

Header en flux normal, libellé long repliable et retour de copie séparé. Six recettes compilées clair/sombre et deux exécutions du helper E2E exact passent ; 13 tests unitaires, revue indépendante favorable. La suite E2E complète attend une API de test isolée : la fixture locale ne supporte pas son seed.

Pas de certification globale, appareil physique ou backend réel. Les erreurs de sonde et timeouts initiaux restent documentés dans les reçus ; aucun seuil ni contrôle de CI n’est réduit.

Reçus détaillés et limites : [dossier de preuves](ui-agent-data-panels-evidence-20261028/README.md).
