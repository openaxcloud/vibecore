---
id: BUG-USER-MESSAGE-KEYBOARD-MENU-20261029
section: "Agent et messages"
---

# Menu utilisateur inaccessible avec Maj+F10

## 📤 Dispatché

☑ 29/10 — diagnostic isolé depuis main `63e6638305`, sans promotion de #830.

## 💻 Codé

☐ — correctif en branche, non fusionné dans main.

## ✅ Testé live

☐ — aucune recette production ; validations locales décrites ci-dessous.

## Cause et correctif

UserMessage n'attachait ni l'ancre du hook ni son gestionnaire clavier dans ses
deux branches de rendu. La ligne parente possède le tab stop : son événement
ne descend pas dans la bulle. Raccorder l'ancre et écouter le clavier directement
sur la ligne lorsqu'elle est la cible ; conserver les événements descendants
chez React pour respecter leurs preventDefault.

Le menu et les temporisations sont invalidés lors du changement d'identité,
démontage ou retrait de l'édition. Aucun raccourci n'est consommé sans action
éditable. L'édition ferme le menu sans voler le focus du composeur ; Échap
restitue le focus sans défilement. Flèches/Home/End permettent la navigation et
Tab ferme la surface. Les bornes verticales mobiles s'appliquent aussi aux
messages dont la hauteur dépasse la zone visible.

## Preuves isolées

Sept régressions rouges avant correction, puis vertes avec les vrais composants.
Un second test long mobile reproduit top=2488 pour viewport=768 avant correction.
Les fixtures utilisent texte et services synthétiques, aucun appel fournisseur,
aucune donnée client ni ressource production. Les validations finales et limites
figurent dans la description de la PR ; ces tests ne constituent pas une recette live.

La recette tactile Chromium a aussi établi qu'un relâchement d'appui long pouvait
synthétiser un clic sur Modifier apparu sous le doigt. Le listener touchend natif
annule uniquement ce relâchement hors menu lorsque le menu du message est ouvert.
Un tap ultérieur sur une action reste actif. Reçus et limites :
[user-message-menu-20261029/README.md](user-message-menu-20261029/README.md).
