# Base `rem` à 14 px — mesure d'impact avant bascule

**Date : 2026-09-01.** Mesure faite sur le code de `main`, environnement de
développement local, projet réel, aux trois formats et sur quatre surfaces.

## Ce qui est établi

La base `rem` du produit n'est pas 16 px. La règle est posée sur **`html`** —
donc elle définit bien le `rem` de tout le document :

```scss
html,
body {
  font-size: var(--vc-type-interface-size);
}
```

avec `--vc-type-interface-size` à **12 px** en desktop et **14 px** sous 1024 px.

C'est la cause commune de trois symptômes traités jusqu'ici un par un :

| symptôme                     | mécanisme                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| cibles tactiles trop petites | `min-h-11` = `2.75rem` → **33 px** desktop / **38,5 px** ≤1024, jamais 44 |
| zoom iOS sur les champs      | un champ en `1rem` rend **14 px**, sous le seuil de 16 px de Safari       |
| en-têtes de panneau tassés   | toute la typographie dérivée du `rem` est réduite d'un sixième à un quart |

## La mesure

Pour chaque écran : relevé, puis `--vc-type-interface-size` forcée à 16 px **sans
toucher au code**, puis nouveau relevé.

| surface             | largeur | part des éléments à la taille de base | débordement horizontal avant → après |
| ------------------- | ------- | ------------------------------------- | ------------------------------------ |
| panneau Agent (IDE) | 390     | 84 %                                  | non → non                            |
| panneau Agent (IDE) | 768     | 84 %                                  | non → non                            |
| panneau Agent (IDE) | 1440    | 83 %                                  | non → non                            |
| tableau de bord     | 390     | 71 %                                  | non → non                            |
| tableau de bord     | 768     | 71 %                                  | non → non                            |
| tableau de bord     | 1440    | 67 %                                  | non → non                            |
| projets             | 390     | 63 %                                  | non → non                            |
| projets             | 768     | 63 %                                  | non → non                            |
| projets             | 1440    | 60 %                                  | non → non                            |
| réglages du compte  | 390     | 59 %                                  | non → non                            |
| réglages du compte  | 768     | 60 %                                  | non → non                            |
| réglages du compte  | 1440    | 53 %                                  | non → non                            |

Repères nommés, panneau Agent :

| repère                              | avant   | après        |
| ----------------------------------- | ------- | ------------ |
| en-tête de panneau (≤1024)          | 14 px   | 16 px        |
| en-tête de panneau (desktop)        | 12 px   | 16 px        |
| socle IDE, contrôle (desktop)       | 96 × 39 | **119** × 39 |
| zone de saisie de l'agent (desktop) | 12 px   | 16 px        |

## Ce que la mesure dit, et ce qu'elle ne dit pas

**Elle dit** que la bascule est _faisable_ : sur 12 écrans, aucun débordement
horizontal n'apparaît — c'était le risque principal, il ne se matérialise pas.

**Elle ne dit pas** que rien ne bouge visuellement. Entre 53 % et 84 % des
éléments changent de taille : les retours à la ligne, la hauteur des cartes et
la densité des listes changeront. « Pas de débordement » n'est pas « pas de
régression visuelle ».

## Recommandation

La bascule est **une décision produit, pas un correctif**, pour deux raisons :

1. elle touche la majorité de l'interface, sur toutes les surfaces, d'un coup ;
2. plusieurs sessions travaillent en parallèle sur ces mêmes surfaces (densité
   desktop, thème, panneaux IDE). Changer la base sous elles invaliderait leurs
   mesures en cours.

En attendant l'arbitrage, les symptômes sont traités **en pixels**, ce qui est
correct indépendamment de la base :

- plancher tactile en px — PR #328 (autre session) et le complément largeur ;
- plancher anti-zoom iOS en px sur toute la plage tactile — PR #345.

Si la bascule est retenue, la séquence à suivre est : geler les chantiers
visuels, basculer, puis re-mesurer les 12 écrans ci-dessus **plus** une
comparaison de captures — la présente mesure ne remplace pas cette étape.
