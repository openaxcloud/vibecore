---
id: BUG-AGENT-UI-001
---

## Bug

**P0 — l'agent affiche ses messages dans une bande étroite entourée de vide ; pendant le stream ça « saute ».** Reproduit en **mobile 390** sur une génération réelle : l'en-tête annonce « Agent · 2 messages » et « Terminé · 100 % », puis un grand vide à la place du texte, avec une seule ligne coupée en deux en haut. Le contenu est pourtant présent dans le DOM (`innerText` porte tout le plan, les agents parallèles et l'artefact). **Mesure sur la page** : fenêtre de lecture **400 px**, `padding-bottom` du transcript **288 px** (= hauteur mesurée du composeur), dernier texte à **y = 181 px** — plus de la moitié de la fenêtre est du vide réservé. En retirant la réserve, le même texte descend à **y = 468 px**. **Cause** : le composeur est `position: sticky`, donc il reste dans le flux et occupe déjà sa hauteur comme frère du conteneur défilant, dans la même colonne flex ; lui réserver en plus sa hauteur au bas du transcript comptait l'espace deux fois. Le transcript se recalant en bas à chaque morceau reçu, c'est cette bande étroite qui se déplaçait sans cesse — le « ça saute ». **Ce n'est ni une régression de `smoothStream`, ni un problème de clé React** : 828 échantillons du DOM à 250 ms montrent **0 régression de longueur, 0 doublon, 0 réordonnancement**.

## 📤 Dispatché

☑

## 💻 Codé

☑ *(`c45d0d8d`, PR #139 non mergée)*

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

`agent-messages-390.png` (défaut), `agent-390-sans-padding.png` (après), `stream-390.json` (828 échantillons) ; 3 tests dont 2 vérifiés rouges

