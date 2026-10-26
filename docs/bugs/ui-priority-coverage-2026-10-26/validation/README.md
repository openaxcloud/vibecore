# Contrôle de l’index après les quatre fiches du lot P1

Index régénéré une seule fois dans le worktree priority via `node scripts/migrer-inventaire-bugs.mjs --index`. L’ancien index annonçait508 entrées ; deux fiches Organisation étaient déjà présentes, puis deux fiches Auth/Galerie ajoutées :512 fichiers au total.

Commande : `/tmp/ui-pnpm9/bin/pnpm exec vitest run scripts/index-a-jour.spec.mjs`.

[index-tests.log](index-tests.log) :6tests réussis, code de sortie0, durée2,14s, début02:50:09UTC le26/10/2026. Le log est volontairement fourni malgré la règle Git *.log ; l’inclure explicitement lors du commit documentaire. Aucun test produit ou build supplémentaire lancé.

Comptes de couverture inchangés94/103/5/155 et43transitions ; liens des nouvelles fiches et reçus compilés vérifiés, diff-check réussi. États main/live des fiches restent faux. Aucun code, archive historique ou contracts.md modifié par l’auteur de cette consolidation.
