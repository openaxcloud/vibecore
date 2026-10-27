---
id: BUG-AGENT-MESSAGE-DESCENDANT-KEYBOARD-20261027
---

## Bug

**Entrée et Espace sur les contrôles du message sont interceptées par son menu contextuel.** Reproduit dans le vrai AssistantMessage isolé : Entrée sur le résumé « Détails du rapport original » annule le geste natif et ouvre le menu du message au lieu du rapport. Quatre cas FR/EN320/768 ; clic fonctionnel. Défaut préexistant, distinct des nouveaux libellés français qui restent contenus.

## 📤 Dispatché

☑ 27/10/2026 — reproduction, correctif clavier isolé et revue indépendante autorisés.

## 💻 Codé

☐ main — correctif local `af46fc879`, intégré localement en `bea1b6a88` ; publication coordonnée par le parent. Seuls MessageContextMenu et son test changent.

## ✅ Testé live

☐ —41tests locaux verts et quatre groupes navigateur sur composant isolé ; route intégrée, WebKit et production non attestés. Build/typecheck consolidés par le parent.

## Preuve

[Avant/après, captures, contrats et limites](ui-agent-evidence-2026-10-27/keyboard-fr/README.md). Respect de defaultPrevented, activation de l’ancre conservée, Maj+F10 non consommé conservé ; aucun changement de geste pointeur ou navigation.
