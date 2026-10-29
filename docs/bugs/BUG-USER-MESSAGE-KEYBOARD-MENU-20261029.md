---
id: BUG-USER-MESSAGE-KEYBOARD-MENU-20261029
---

## Bug

Après focus obtenu nativement par Tab sur un message utilisateur, Maj+F10 ne déclenche pas son menu. Six recettes FR/EN390/820/1280 reproduisent le défaut sur buildf96. Le clic droit ouvre Modifier, Escape rend le focus et Entrée préremplit le compositeur sans envoi.

## 📤 Dispatché

☑ Preuves et proposition préparées pour coordination avec le propriétaire messages/historique830/832.

## 💻 Codé

☐ Aucune correction appliquée : périmètre réservé UserMessage/MessageContextMenu. Proposition : raccorder l'ancre et traiter le clavier sur la ligne réellement focalisée, avec tests comportementaux.

## ✅ Testé live

☐ Production non testée ; Chromium local et API/runtime synthétiques. Aucun prompt ni appel IA.

## Limites

Quatre images respectant le contrat ne débordent pas. L'essai initial à huit images dépassait le contrat et ne justifie aucun correctif produit. Preuves dans ui-collaborators-followup-evidence-20261029/message-keyboard-summary.json et message-audit.md.
