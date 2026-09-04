# Révélations au survol : que reste-t-il d'inatteignable au doigt ?

**Date : 2026-09-01.** Inventaire déclenché par un constat : la barre d'actions
d'un message se révélait via `:focus-within` sur un `<div tabindex="-1">`, et
**Safari iOS ne focalise pas un conteneur non interactif au toucher** — la barre
était donc morte sur l'iPhone d'Avi pendant qu'un test Chromium la voyait
s'ouvrir.

Question posée : combien d'autres commandes reposent sur le même mécanisme ?

## Méthode

1. Relevé statique dans `app/styles/index.scss` des règles dont le sélecteur
   contient `:hover` / `:focus-within` **et** dont le corps révèle
   (`opacity: 1`, `visibility: visible`, `height: auto`, `display: …`).
2. Vérification de l'existence d'un pendant tactile (`@media (hover: none)`,
   `pointer: coarse`, classe mobile).
3. **Mesure sur le moteur réel** : Playwright **WebKit**, profil iPhone 15 Pro,
   sur le panneau Agent, le tableau de bord, la liste des projets et l'accueil
   public.

## Relevé statique

**8 cibles** révélées au survol. Sur `main`, il n'existe **aucun**
`@media (hover: none)` dans la feuille — 7 des 8 n'ont donc aucune règle
tactile.

| cible                                | pendant tactile sur `main` |
| ------------------------------------ | -------------------------- |
| `.bolt-assistant-message-footer`     | 1 règle                    |
| `.bolt-branches-row-actions`         | aucune                     |
| `.bolt-project-inline-rename-button` | aucune                     |
| `.bolt-project-tab-close`            | aucune                     |
| `.bolt-project-tab-pin`              | aucune                     |
| `.bolt-project-tool-item-chevron`    | aucune                     |
| `.ecode-nav-menu-panel`              | aucune                     |
| `.vc-collapsed-nav-label`            | aucune                     |

## Ce que la mesure sur WebKit dit vraiment

**La famille redoutée ne se matérialise pas.** Mesuré sur iPhone 15 Pro :

| cible                        | verdict                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| barre d'actions d'un message | **joignable** (373×47, opacité 0,85)                                                       |
| libellé de la nav repliée    | 0×0 — mais c'est une **étiquette**, pas une commande                                       |
| renommer le projet (crayon)  | **0×0** — voir ci-dessous                                                                  |
| 5 autres                     | non rencontrées dans ce fixture (onglets multiples, branches de conversation, nav desktop) |

**Pourquoi le survol n'est presque jamais le coupable** : ces révélations vivent
en très large majorité sur du chrome **desktop**, mis en `display: none` en
mobile. Un `:hover` sans pendant tactile y est inoffensif — la commande n'est pas
censée être là. Le seul cas dangereux est celui où le contrôle vit sur une
surface **rendue en mobile**, et c'était exactement la barre d'actions des
messages, déjà corrigée.

## Le vrai défaut trouvé en chemin — et ce n'est pas un défaut de survol

**Sur iPhone, un projet ne peut pas être renommé depuis l'IDE.**

La chaîne d'ancêtres du crayon montre `HEADER.bolt-project-topbar` en
`display: none`. Le contrôle n'est donc pas masqué par le survol : **toute la
barre supérieure est retirée en mobile**, et aucun équivalent n'existe ailleurs.

Vérifié au doigt, WebKit / iPhone 15 Pro : un seul contrôle « Renommer » dans le
DOM, à 0×0, **au repos et après ouverture des trois menus du chrome mobile**.

C'est une **action perdue**, pas un problème d'esthétique. Elle relève du chrome
mobile de l'IDE — surface tenue par une autre session — d'où ce signalement
plutôt qu'un correctif unilatéral.

## Ce qui reste à vérifier

Cinq cibles n'ont pas pu être rencontrées avec ce fixture : elles demandent
plusieurs onglets ouverts, des branches de conversation, ou la nav desktop.
**Non vérifiées ≠ saines** : le tableau ci-dessus le dit explicitement plutôt que
de les compter comme conformes.

## Règle retenue

Consignée dans `CLAUDE.md` : _une interaction tactile se vérifie sur le moteur de
l'appareil cible ; un vert Chromium ne prouve rien pour iOS._ Avec, en pratique :
ne jamais faire dépendre une révélation tactile d'un effet de bord du focus, et
écrire l'assertion qui distingue les deux mondes — retirer le focus après le
geste et vérifier que l'état tient.
