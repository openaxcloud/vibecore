---
id: BUG-TEAM-SETTINGS-NESTED-OUTLET-20261026
---

## Bug

L’URL des paramètres d’équipe affiche le journal d’accès parent au lieu de la page enfant : les paramètres existants ne sont pas accessibles par navigation.

Sur `/teams/synthetic-team/settings`, FR/EN et cinq formats, le titre reste « Journal des accès de l’équipe » / « Team access log ». Le lien change l’URL mais pas le contenu. flatRoutes place `teams.$id.settings` sous `teams.$id`, dont le composant ne rend aucun Outlet.

## 📤 Dispatché

☑ 26/10/2026 — Périmètre organisation/équipes alloué, worktree séparé.31 PR ouvertes relues, aucun chevauchement du fichier. Revue indépendante favorable.

## 💻 Codé

☐ Sur main. Correctif local : `useOutlet` inconditionnel après les autres hooks, retour enfant avant la coque parente. Aucun loader/action ni composant global changé, pas de double AppShell.

## ✅ Testé live

☐ En production. Fixtures GET synthétiques, aucune création d’équipe ni modification de permission.

## Validation locale

Deux tests réel createMemoryRouter rouges avant, puis cinq verts avec les trois tests i18n existants. Entrée directe, clic du vrai Link, données enfant, coque unique et Retour vérifiés. Lint ciblé vert. Build local vert ;20 contextes compilés Settings et20 parent, cinq formats FR/EN clair/sombre, puis deux vrais parcours lien/focus/Escape/Retour réussis. Typage web et scripts verts après préparation des dépendances locales ; aucune livraison présumée.

## Preuves et limites

[Audit et dénominateur huit routes](ui-organization-access-2026-10-26/README.md). Captures/route config et vrai parcours navigateur avant conservés. Les20 observations avant de l’URL enfant mesurent la mauvaise page, pas des paramètres validés. Export, droits, backend, Safari/Firefox et production non exercés.
