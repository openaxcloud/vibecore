# Validations locales des branches existantes

Reprise de #709 à 17:42 UTC : la CI rend 9 353 tests verts, un ignoré et un échec dans le témoin d'ascendance de `tiers-a-jour.spec.mjs`. Le checkout superficiel ne fournit pas `HEAD~1` ; le test crée désormais son propre dépôt de deux commits et appelle le même détecteur réel dans ce dépôt. Contre-épreuve sur un clone `--depth=1` : ancienne garde rouge (code 1), nouvelle verte (code 0). Les 43 gardes voisines de comparaison/livraison passent, ainsi que les types des scripts ; le code de livraison n'est pas modifié par cette réparation du témoin. La CI du nouveau commit reste à mesurer.

Chaque ligne correspond à une vraie fusion sur main c7a6fa5025 dans un arbre jetable. Les tests API et E2E ont des configurations distinctes ; une découverte vide ne vaut pas verdict. Aucun élément n’est déclaré servi par cette table.

| PR | SHA testé | Résultat | Limite |
|---|---|---|---|
| [#704](https://github.com/openaxcloud/vibecore/pull/704) | `b854116236` | La configuration racine exclut services/ ; aucun verdict API | CI et live restent requis |
| [#703](https://github.com/openaxcloud/vibecore/pull/703) | `3497e83d01` | Test Files  2 passed (2) ; Tests  11 passed (11) | CI et live restent requis |
| [#666](https://github.com/openaxcloud/vibecore/pull/666) | `337e907d4a` | Test Files  1 passed (1) ; Tests  1 passed (1) | CI et live restent requis |
| [#662](https://github.com/openaxcloud/vibecore/pull/662) | `0edd050b4b` | Test Files  1 passed (1) ; Tests  7 passed (7) | E2E non exécuté |
| [#658](https://github.com/openaxcloud/vibecore/pull/658) | `11002c88c1` | Test Files  1 passed (1) ; Tests  3 passed (3) | CI et live restent requis |
| [#652](https://github.com/openaxcloud/vibecore/pull/652) | `fa08b1e533` | Pas de test unitaire découvert | E2E non exécuté |
| [#620](https://github.com/openaxcloud/vibecore/pull/620) | `a385056ac3` | Test Files  1 passed (1) ; Tests  3 passed (3) | E2E non exécuté |
| [#595](https://github.com/openaxcloud/vibecore/pull/595) | `b450a113b3` | Test Files  1 passed (1) ; Tests  4 passed (4) | CI et live restent requis |
| [#555](https://github.com/openaxcloud/vibecore/pull/555) | `cf33e718b1` | Test Files  1 passed (1) ; Tests  4 passed (4) | CI et live restent requis |
| [#376](https://github.com/openaxcloud/vibecore/pull/376) | `dbda036371` | Test Files  2 passed (2) ; Tests  31 passed (31) | CI et live restent requis |
| [#370](https://github.com/openaxcloud/vibecore/pull/370) | `abd253be3f` | Test Files  1 passed (1) ; Tests  2 passed (2) | CI et live restent requis |
| [#434](https://github.com/openaxcloud/vibecore/pull/434) | `e864220fc9` | Test Files  1 passed (1) ; Tests  6 passed (6) | CI et live restent requis |
| [#409](https://github.com/openaxcloud/vibecore/pull/409) | `98b863c8a5` | Test Files  2 passed (2) ; Tests  10 passed (10) | CI et live restent requis |
| [#607](https://github.com/openaxcloud/vibecore/pull/607) | `402431aee6` | Pas de test unitaire découvert | CI et live restent requis |
| [#606](https://github.com/openaxcloud/vibecore/pull/606) | `8b7b3a4843` | Deux variables absentes ; corrigées dans le lot outillage, 4 tests verts | CI et live restent requis |
| [#512](https://github.com/openaxcloud/vibecore/pull/512) | `fd1de91fef` | Test Files  3 passed (3) ; Tests  53 passed (53) | CI et live restent requis |
| [#379](https://github.com/openaxcloud/vibecore/pull/379) | `6e994bafe5` | Test Files  2 passed (2) ; Tests  26 passed (26) | E2E non exécuté |
