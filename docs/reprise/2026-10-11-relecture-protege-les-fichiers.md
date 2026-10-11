# A-9 — une relecture indisponible bloque l’écriture

Fusion réelle de la reprise #555 sur main 80f1de14, sans conflit de code. La relecture distante réessaie une fois. Si elle échoue encore, la sauvegarde refuse d’écrire et restaure le tampon avant l’essai ; un message français ou anglais explique que la vérification a échoué.

La branche existante laissait passer deux cas dangereux : un tampon local vide et une écriture de l’agent avec `reconcile`. Le vide local ne prouve pas le vide distant ; une réconciliation demande justement de connaître la version distante. Ces deux exceptions sont retirées. Le choix explicite `overwrite` exige lui aussi une lecture réussie. La création explicite par `createFile` reste possible, et le premier enregistrement d’un fichier neuf est couvert par les tests voisins.

Mesures : deux nouveaux cas étaient rouges avant le retrait des exceptions ; les 37 assertions de sept suites de fichiers passent ensuite. Remplacer uniquement le code de sauvegarde par main rend cinq tests rouges et deux verts. ESLint et types web passent. La construction React Router a été répétée après restauration de la contre-épreuve et réussit avec une limite Node de 8 Gio. Aucun parcours client en production n’est revendiqué ; le lot est préparé, pas servi.
