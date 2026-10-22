# Contrat d’hydratation après panne de catalogue

Cette correction ne change que deux tests. L’ancienne assertion exigeait encore `demarrer()` après échec de chargement ; elle contredisait le nouveau contrat de pause avec réessai explicite. Sa contre-épreuve sur `5ee20394` donne un échec et sept succès. La garde conserve un seul `hydrateRoot`, son encapsulation et le passage par le contrôleur. Le test comportemental exige absence d’hydratation après échec et pendant le réessai, protection contre le double clic, restauration du SSR puis exactement une hydratation après succès.

Les 20 tests ciblés passent, ainsi que le lint des deux fichiers. Les dix empreintes produit correspondent au manifeste `../ci-corrections/source-manifest.json` ; aucun rebuild produit ni nouvelle recette navigateur n’est revendiqué pour ce changement de tests.

## Suite complète locale

`pnpm run test --maxWorkers=2`, Node24.19.0, pnpm9.14.4, heap8GiB : 9 940 succès, huit échecs, sept skips existants ; 1 291 fichiers passent, cinq échouent et deux sont ignorés. Le contrat d’hydratation passe. Le journal complet et ses empreintes sont référencés dans `receipt.json`.

Les quatre échecs shell-quote et les échecs compression, tinypool et ws utilisent des dépendances locales réutilisées depuis `/workspace/vibecore/node_modules`, différentes des versions verrouillées : shell-quote1.8.4 au lieu de1.11.0, compression1.8.1 au lieu de1.8.2, tinypool1.1.1 au lieu de2.1.2, ws8.20.0 au lieu de8.22.0. L’autre échec concerne l’installation admin `--prod --offline --frozen-lockfile`; son sous-processus sort en erreur et le test n’expose pas son diagnostic détaillé. Aucun de ces contrôles ni dépendance partagée n’est modifié. Une installation propre et la CI exacte restent nécessaires ; cette suite locale n’est pas verte.

La CI historique sur `5ee20394`, rapportée par la coordination, avait 9 934 succès, un échec (l’ancienne assertion) et quatre skips. Ces nombres ne sont pas ceux de la nouvelle suite locale. Une première suite locale sur `5ee20394` a été interrompue avant modification et n’a aucun verdict global.

Les journaux rouges historiques, dont l’OOM initial, restent conservés. Ces tests n’établissent pas la cause de l’incident production ni le fonctionnement complet du projet utilisateur. La publication de ce complément et sa nouvelle CI sont à vérifier séparément ; aucun nouveau résultat CI n’est anticipé ici.
