---
id: BUG-DESKTOP-PREVIEW-MENU-DISMISS-001
---

# Le menu de fenêtre Webview ignore Échap et le clic extérieur

## 📤 Dispatché

Audit desktop du22octobre sur main18745bd. Deux gestes réels reproduits séparément : ouvrir les options de fenêtre Webview puis Échap ; ouvrir le même menu puis cliquer le dock Agent. Le menu reste visible pendant les5s des assertions, deux échecs directs sans retry.

## 💻 Codé

Correctif local dans Preview.tsx : références de conteneur/bouton, fermeture sur pointerdown ou déplacement de focus hors du menu, Échap avec retour du focus au bouton. Aucun changement de BaseChat, stores ou configuration d’accès. Pas encore publié.

## ✅ Testé live

Rouges du build attesté conservés. Tests ciblés prêts ; lint ciblé vert. La recette navigateur sur build corrigé reste à exécuter, aucune certification production.

### Contre-épreuve du premier correctif — 22 octobre

Le build `4f8e8b334` échoue encore sur Échap après ouverture réelle du menu. Instrumentation : le raccourci global `overlay.close` appelle `preventDefault` et `stopPropagation` pendant la capture sur window ; le listener document du menu ne reçoit pas l’événement. Le correctif suivant écoute au même niveau window en capture, uniquement lorsque la cible appartient au menu. Tests complétés pour Tab entrant, Shift+Tab et clic sur la surface de l’iframe ; aucune assertion ni aucun délai réduit. Validation compilée encore attendue.

### Validation locale du lot desktop — 22 octobre

Build `c382137ad72eeb983b40493e40bc296cd85e61c1`, arbre `f26a295f50a7ddb890f8f5800db457d563a70630` : cinq scénarios ciblés et deux scénarios tactiles passent directement, zéro retry et zéro omission. API et données synthétiques locales, interface compilée ; aucune certification production ni des actions métier non exercées. Voir [recette et limites](desktop-panels-2026-10-22/README.md). Les échecs antérieurs sont conservés.
