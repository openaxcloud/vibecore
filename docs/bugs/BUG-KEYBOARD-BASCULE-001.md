---
id: BUG-KEYBOARD-BASCULE-001
---

## Bug

**P1 — iPhone : toucher la zone de saisie pendant le chargement de l'IDE → la zone de saisie reste SOUS le clavier.** Trouvé le 01/10 en instruisant le test « instable » `clavier-ios-hauteur-de-repos` : rouge au 1er essai sur **18 des 25** passages CI récents (2 rouges à tous les essais), toujours la MÊME mise en page (composeur 337–454 pour un bas visible à 362, règles « clavier levé » non appliquées). Ce n'était pas une lecture trop tôt : la page se stabilisait, mais sans la détection du clavier. Cause : la hauteur de repos était locale à l'effet de BaseChat ; la bascule coquille → vrai chat (remontage) la réapprenait clavier levé (362) et le clavier n'était plus jamais vu. Même mécanisme que BUG-MODE-BASCULE-001.

## 📤 Dispatché

☑ 01/10

## 💻 Codé

☐ #664 (`fix/clavier-repos-de-page`), pas encore sur `main` : hauteur de repos mémorisée pour la page (`memoriserHauteurDeRepos`).

## ✅ Testé live

☐

## Preuve

Contre-épreuve locale le 01/10 (`d83031035` + test, pile froide, sans nouvel essai, code servi vérifié) : avec le correctif 6/6 vert, sans 6/6 rouge « clavier perdu à la bascule ». NB : le test d'origine ne distinguait PAS les deux en local (12/12 vert sans le correctif) — la bascule y précède le clavier levé. Épinglé par `tests/e2e/clavier-ios-hauteur-de-repos.spec.ts` « clavier levé PENDANT le chargement : la bascule coquille → vrai chat garde le clavier vu » + `app/components/chat/visual-viewport-bottom.spec.ts`. Point OUVERT tant que non servi et vu sur iPhone.
