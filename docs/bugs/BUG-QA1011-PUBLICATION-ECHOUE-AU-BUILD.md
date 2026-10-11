---
id: BUG-QA1011-PUBLICATION-ECHOUE-AU-BUILD
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Constat (production, 2026-10-11, lecture seule)

**Aucune publication n'a jamais abouti en production : les 7 déploiements enregistrés sont tous `FAILED`, et tous
échouent à la CONSTRUCTION sur des erreurs de types dans le code généré par l'agent.**

| date | environnement | erreur |
|---|---|---|
| 08/09 | production | `src/pages/CatalogPage.tsx(96,48): error TS1005: ')' expected` |
| 08/09 | production | `src/components/__tests__/App.flow.test.tsx(148,45): error TS1002: Unterminated string literal` |
| 09/09 | aperçu | `src/App.test.tsx(2,55): error TS1109: Expression expected` |
| 09/09 | aperçu | `vite.config.ts(37,33): error TS2349: This expression is not callable` |
| 25/09 | aperçu | `vite.config.ts(41,33): error TS2349: This expression is not callable` |
| 29/09 | aperçu | `vite.config.ts(41,33): error TS2349: This expression is not callable` |
| 01/10 | aperçu | `vite.config.ts(51,33): error TS2349: This expression is not callable` |

Chaque ligne finit par « Workspace deploy: build failed ».

## Ce qui est établi

- **4 sur 7** : même erreur, même colonne, dans `vite.config.ts`. C'est une répétition, pas un hasard.
- **3 sur 7** : erreurs de syntaxe dans des fichiers générés, dont **deux fichiers de TEST**, que la construction n'a
  pas besoin de compiler.
- La commande de construction des projets créés est `tsc -b && vite build`
  (`packages/template-catalog/src/scaffolds.ts:25`) : une seule erreur de types, n'importe où, test compris, bloque la
  mise en ligne.
- Les 7 déploiements appartiennent à des organisations INTERNES (forfait entreprise), n = 7. Aucun client externe
  n'a publié à ce jour.

## Ce qui n'est PAS établi

- La cause de l'erreur de `vite.config.ts` : je n'ai pas lu les fichiers générés. Une première hypothèse (une
  consigne de la plateforme à l'agent) était fausse : le commentaire lu concernait le `vite.config.ts` de la
  plateforme elle-même. Retirée.
- Si la publication réussit aujourd'hui : aucun déploiement depuis le 01/10.

## Pourquoi c'est grave

Publier est le geste qui fait d'un projet un produit. Sur ce qui a été mesuré, un client qui demande une app à
l'agent puis clique « Publier » obtient « build failed » 7 fois sur 7.

## Pistes (non faites)

1. Mesurer une publication sur `main` du jour (projet neuf créé par l'agent, puis Publier). C'est le seul moyen de
   savoir si c'est encore vrai.
2. Lire le `vite.config.ts` généré d'un projet en échec pour trouver la cause de l'erreur TS2349.
3. Exclure les tests de la construction de publication, ou ne pas bloquer la mise en ligne sur `tsc`.

## 📤

☐ signalé le 2026-10-11 (session QA), non traité

## 💻

☐

## ✅

☐

## Preuve

Lecture seule de la table `Deployment` en production, le 2026-10-11 (statut, environnement, lignes d'erreur des
journaux, adresses masquées).
