---
id: BUG-CREATE-004
---

## Bug

**P1 — la Webview affiche « Prêt » ET « démarre encore » en même temps, sans fin.** Sur un projet vide dont l'aperçu ne peut pas aboutir : bandeau « DÉMARRAGE DE LA WEBVIEW », statut en gras **« Prêt »**, sous-titre « Le serveur d'aperçu démarre encore ; nouvelle tentative… », 3 étapes vertes et une 4ᵉ en cours — le tout figé plus de 90 s. « Prêt » est le NOM de l'étape 4, rendu comme s'il était l'état courant. Aucune sortie de boucle : après N échecs `PREVIEW_AGENT_NOT_FOUND`, rien n'invite à redémarrer l'espace de travail.

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**REVÉRIFIÉ LE 09/09, ET LA NOTE DE `CLAUDE.md` EST PÉRIMÉE.** La règle 15 y cite ce point comme l'exemple type du correctif que « rien n'empêche de défaire » : « tout le correctif tient dans l'ORDRE de deux branches `if` ; un réordonnancement anodin le réintroduisait sans un seul test rouge ». Ce n'est plus vrai. Contrôlé en EXÉCUTANT, pas en lisant : j'ai inversé les deux branches de `resolvePreviewBootProgress` (`upstreamNotReady` avant `previewsLength > 0`) et `Preview.boot-progress.spec.ts` **rougit** — « does NOT claim ready while the panel says the upstream is not up yet ». Ordre rétabli, 4/4 vertes. La contradiction « Prêt » + « démarre encore » est donc tenue. **RESTE OUVERT, et c'est pourquoi la ligne n'est pas fermée** : la seconde moitié du signalement — après épuisement des tentatives, rien n'INVITE explicitement à redémarrer l'espace de travail. La boucle, elle, est désormais bornée (`MAX_PREVIEW_LOAD_RETRIES` dans `preview-frame-recovery.ts`) et `previewRunFailed` fait tomber l'écran de démarrage : on ne reste plus figé indéfiniment. épinglé par `app/components/workbench/Preview.boot-progress.spec.ts` (moitié « Prêt » contradictoire) ; `apres-executer.png` ; même famille que BUG-UX-014

