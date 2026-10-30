---
id: BUG-DATABASE-GRID-IDENTITY-20261030
---

# BUG-DATABASE-GRID-IDENTITY-20261030

📤 Dispatché : 30/10/2026 — lot Database, demande de vérification réelle.
💻 Codé : branche `fix/database-isolation-audit`, PR draft attendue ; pas intégré à main.
✅ Testé live : non validé en production (recette authentifiée séparée bloquée par reconnexion).

Défauts prouvés : résultats et sélection de table conservés en changeant de connexion ; noms SQL non cités/non qualifiés ; UPDATE utilisant toutes les valeurs (NULL ne correspond jamais, doublons modifiés ensemble) ; résultats PostgreSQL multi-instructions perdus.

Correction : montage isolé par projet/connexion, édition par clé primaire uniquement, identifiants SQL cités, schémas distingués, dernier résultat réel d’un lot PostgreSQL, états et actions répétées testés.

Preuves et limites : voir `docs/reprise/2026-10-30-database-audit.md`.
