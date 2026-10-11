---
id: BUG-QA1011-PAGES-INTERNES-ET-MISSIONS-PUBLIQUES
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Quatre pages servies en 200 au public n'avaient rien à y faire.** Trouvées le 2026-10-11 en balayant les pages
publiques absentes du plan du site (rendu sans session, aucun bouton actionné).

- `/runtime-test` et `/theme-validation` : pages de TEST internes (« Test de l'environnement d'exécution »,
  « Validation des thèmes »). Rien n'en dépend fonctionnellement : elles n'étaient citées que dans deux listes de
  routes publiques (`app/root.tsx`, `app/lib/stores/theme.ts`).
- `/marketing/bounties` ET `/bounties` (la seconde était même au plan du site, et au menu comme au pied de page de
  toutes les pages publiques sous l'alias `/marketing/bounties`) : elles promettaient des « missions rémunérées au
  résultat ». **Aucune route d'API ne réalise cette fonction** : promesse sans produit derrière.

## Décision (Avi, 2026-10-11) et correctif (branche `fix/retrait-pages-internes-et-missions`)

Retrait du public : un vrai 404 (les attrape-tout `$slug` et `$` répondent déjà 404 avec `noindex`), pas de
redirection qui ferait croire à un contenu déplacé, aucun contenu de remplacement. Les quatre fichiers de route
sont supprimés ; l'entrée « Missions / Bounties » est retirée du menu, du pied de page (les deux coquilles, 4
langues) et du plan du site. Les catalogues de texte restent (le gabarit `/partners` en partage le fichier).
**Ne touche pas `services/api/src/app.ts`.**

Épinglé par `app/routes/pages-internes-retirees.spec.ts` : avant correctif, 2 rouges (fichiers de route présents,
`/bounties` au plan du site) ; après, 4 verts. Contre-épreuve : remettre `theme-validation.tsx` ou le lien de menu
fait rougir le test ; une page de gabarit voisine (`/analytics`) reste en 200.
