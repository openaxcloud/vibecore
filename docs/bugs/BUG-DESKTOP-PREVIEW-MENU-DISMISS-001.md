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
