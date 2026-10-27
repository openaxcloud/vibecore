---
id: BUG-IDE-TAB-SEARCH-HANDOFF-20261026
---

## Bug

Le remplacement réel de PendingComposerShell par ChatImpl conserve le menu et son focus après #799, mais perd la recherche saisie : `Webview` devient une chaîne vide. Le vrai GET ide-state retenu puis libéré reproduit le défaut sur le build témoin6f124189, sans réponse substituée ni retry.

## 📤 Dispatché

26/10/2026 — correction locale distincte demandée après audit IDE ; #799 reste stable.

## 💻 Codé

☐ — local seulement, publication interdite avant coordination. L'état de recherche est porté par le contexte projet/espace/fenêtre au-dessus des coquilles. Les fermetures explicites continuent de vider la recherche ; aucune persistance interprojets ou sessionStorage ajoutée. Menu inférieur et JSX gelé inchangés.

## ✅ Testé live

☐ — aucune production authentifiée. Reproduction rouge navigateur locale confirmée ; 13 tests focus/recherche et 7 gardes AST passent. Sur le build corrigé, les 8 scénarios de focus/recherche passent ; compléments à 320 px et zoom Chromium natif 200 % verts. La saisie reste présente après remplacement, puis se vide à la fermeture/réouverture. Revue indépendante sans blocage produit. Voir le reçu local dans `ide-query-tab-exit-2026-10-26/local-qa-report.md`. Aucun backend, fournisseur, DNS, accès persistant ou donnée client modifié.
