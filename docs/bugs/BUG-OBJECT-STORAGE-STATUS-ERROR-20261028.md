---
id: BUG-OBJECT-STORAGE-STATUS-ERROR-20261028
---

## Bug

Une erreur503 de lecture du statut Object Storage est présentée comme service non activé et ne propose aucune reprise.

## 📤 Dispatché

☑ 28/10/2026 — diagnostic reproduit localement sur données synthétiques.

## 💻 Codé

☐ main — lot local distinct des têtes838/839 ; aucune fusion ni livraison.

## ✅ Testé live

☐ production — Chromium local, aucune donnée cliente ni opération réelle.

## Correction et validation

Correction locale appliquée : erreur distincte de la désactivation confirmée, Retry sur la lecture existante, aucune activation disponible tant que le statut est inconnu. Le vrai composant passe de six échecs / un succès avant correction à sept succès après ; 28 tests ciblés passent, revue indépendante favorable. Six recettes compilées à390/820/1280 passent chargement →503 → reprise clavier →200 : trois vers enabled:false, trois vers enabled:true/provisioned:false. Le bouton Enable du second cas devient visible mais n’a jamais été cliqué ; aucun bucket créé ou provisionné.

Pas de certification globale, appareil physique ou backend réel. Les erreurs de sonde et timeouts initiaux restent documentés dans les reçus ; aucun seuil ni contrôle de CI n’est réduit.

Reçus détaillés et limites : [dossier de preuves](ui-agent-data-panels-evidence-20261028/README.md).
