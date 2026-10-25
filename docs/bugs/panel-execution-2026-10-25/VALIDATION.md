# Validation du correctif d’exécution

Base main `941d7d7fc`, 25 octobre 2026. Node 24.19.0, pnpm 9.14.4 fourni dans l’environnement. Aucun changement de dépendances, de seuil, de retry ou de protection.

## Résultats locaux

- 104 tests, sept fichiers : commandes Security, Security, Workflows, BFF execution-outcomes, BFF intégrations, UI intégrations et index documentaire.
- 6 tests supplémentaires : `app/routes/packages-echec-non-masque.spec.ts` (la commande groupée initiale utilisait un mauvais chemin pour cette suite, donc exécutée séparément).
- Revue indépendante : 72 tests sur cinq fichiers, sans omission ; pas de défaut bloquant identifié après corrections.
- Typecheck officiel complet réussi ; lint global réussi, 0 erreur / 52 avertissements existants.
- Build final officiel réussi (code 0), sur les trois blobs produit relus ci-dessous ; aucun changement produit ultérieur.
- `git diff --check` réussi. Index régénéré : 485 fiches, sans suppression des 484 précédentes.

## Ce que les tests prouvent

Sept tests lancent réellement shell, Node et grep sur fichiers synthétiques temporaires : aucun résultat, résultat réel, exclusions, erreur réelle d’option grep provoquée par un wrapper et drainage de 100 000 lignes avec sortie bornée. Les autres tests utilisent des contrats contrôlés ; le BFF et son transport sont réels, mais la réponse runtime/API est synthétique. Aucun audit npm contre un registre externe, aucun runtime Kubernetes ni E2E authentifié exécuté ici.

La revue a demandé et obtenu : sortie grep bornée sans fichier contenant des secrets, contrôle du statut Packages même quand exitCode=0, échec lorsque tous les sous-scans sont désactivés, garde sur le chemin Workflows distinct et tests codes absents/null.

## Échecs conservés et corrections

- pnpm global 11.25 tentait de réinstaller les dépendances et échouait hors espace autorisé ; utilisation de pnpm 9.14.4 déjà présent, sans téléchargement ni changement de lockfile.
- Premier typecheck : trois liens locaux de paquets déclarés manquaient (auth/database/security). Liens restaurés sous node_modules vers les sources locales ; aucun fichier produit ou restauration modifié pour cela. Contrôle complet ensuite réussi.
- Pendant développement/revue : échec Workflows révélant un troisième repli zéro, puis test Packages devant capter la réponse 422 levée ; correctifs et reprise verte. Une garde statique initialement suspectée obsolète passe finalement sans modification.
- Lecture des protections de branche via GitHub : HTTP 403 Resource not accessible by integration. Pas de nouvelle tentative ni contournement ; la fusion reste soumise aux protections serveur.

## Distinction version / déploiement / recette

[Déploiement historique de main 941d7d7fc](https://github.com/openaxcloud/vibecore/actions/runs/40010684339) réussi selon GitHub. Les checks @runtime non bloquants de main comportent des échecs. Aucun nouveau déploiement ni validation du SHA actuellement servi n’est revendiqué. Recette production suspendue à la reconnexion E-Code. Safari, appareils physiques, fournisseurs, Sync, webhooks et publication restent non certifiés pour ce lot.

Restes et matrice complète : [INVENTORY.md](INVENTORY.md). Aucun secret, accès persistant, compte, paiement, ressource cloud ou donnée utilisateur créé/modifié. Aucune opération sur #764/#768.

## Sources revues

Empreintes Git, groupes à concaténer :

- `app/lib/ide-panel-security.ts` : `d2a78edc fda6dfa1 4b8e4d1f d7a4368e 16e75633`
- `app/lib/ide-panel-workflows.ts` : `87cf73ca a72c00bc 5c46cc8d 58cdb584 c6a55e66`
- BFF `api.projects.$projectId.ide-panel.$panel.ts` : `21c02d3d fb667f9a 2a686a28 aa392319 d339ba43`

Collision potentielle à coordonner : le BFF est un fichier partagé ; le diff de ce lot touche uniquement imports Security, garde du résultat Packages, runTerminalCommand, runPackageInstall et runSecurityScan. Aucun hunk Git, Publish/Deploy, Domains, Debugger ou restauration.
