---
id: BUG-PREVIEW-REMOUNT-001
---

## Bug

**P1 — l'onglet Aperçu REDÉMARRE quand on en change puis qu'on revient** (Avi, 09/09 11:05→11:08, captures iPhone prod). L'application tournait et s'affichait (« Carnet de recettes », rendu complet à 11:05) ; après un aller-retour vers un autre onglet, l'Aperçu réaffiche « DÉMARRAGE DE LA WEBVIEW » et refait toute sa séquence. Avi : « on va pas l'app fixe ». ⚠️ Détail de la capture 11:08 qui compte : la carte annonce l'étape **« Prêt »** ET tourne encore (« Chargement de la webview et attente du premier rendu… », pastille 4 en attente) — le même mensonge d'état que BUG-UX-014 / BUG-CREATE-004, ici sur le chemin du remontage.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

**CAUSE TROUVÉE ET CORRIGÉE le 09/09.** Ce n'est PAS un démontage : le keep-alive du Workbench (`mobile-workbench-keepalive.ts`) tient déjà, et je l'ai vérifié à l'écran — l'iframe garde la MÊME identité après un aller-retour. Le mécanisme est ailleurs : l'effet qui surveille l'URL du cadre repose `previewStatus` sur « Chargement de la webview et attente du premier rendu… » dès que cette URL change, et la perte PASSAGÈRE de l'URL au retour d'onglet suffisait à faire revenir TOUT l'écran de démarrage. D'où la capture d'Avi : trois étapes cochées, « Prêt » en attente, et un rouet — sur une application déjà rendue. Correctif : une réadoption n'est pas un démarrage à froid. Une mémoire de session par projet (`hasServedBefore`) empêche de rejouer la séquence d'installation quand l'espace de travail est prêt et qu'aucun démarrage n'est en cours. Un VRAI redémarrage (bouton Exécuter) et un espace de travail redevenu non prêt gardent leur écran.

## Preuve

☐ live iPhone

