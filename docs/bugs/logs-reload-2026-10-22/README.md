# Journaux : Clear puis Reload — preuve locale rouge/verte

Correctif testé : `ddfdb38cfc9d671c74c127474e901b49505072f2`, arbre `457e3fa767cbb0635211a7b525673a6cce327c75`. Lot séparé de #768, non intégré à main au moment de cette recette. La seule modification produit ajoute `setCleared(false)` dans `manualReload` de `ProjectLogsPanel` avant le chargement existant. Le polling ne remet pas cet état à zéro et aucun journal serveur n’est supprimé.

## Gestes et résultats

Une identité et un projet synthétiques sont créés par la vraie API locale ; un ZIP est réellement importé. Le test ouvre Logs, sélectionne System logs, constate les lignes, désactive Live tail par son bouton afin d’attribuer la réponse suivante au clic Reload, puis clique Clear et Reload. Les réponses HTTP 200 contiennent explicitement l’événement `project.files.import_zip` : une simple ligne de résumé système ne suffit pas à valider la recette.

| Version | Formats | Résultat direct | Lignes avant / après Reload |
| --- | --- | --- | --- |
| Baseline `838684f007255fb0f91177f5e1598940ad084fca` | 1440×900, 1024×768 | 0 succès, 2 échecs, zéro retry/omission | 5 / 0 dans les deux cas |
| Correctif `ddfdb38cfc9d671c74c127474e901b49505072f2` | mêmes formats | 2 succès, zéro échec/retry/omission | 5 / 5 dans les deux cas |

La baseline reçoit bien HTTP 200 avec trois événements d’activité, dont l’import ZIP, mais reste vide après Reload. La version corrigée restaure les lignes sans rechargement de page et conserve System logs sélectionné. Un rechargement complet est ensuite exercé avec nouvelle réponse réelle et lignes visibles. Ce dernier geste n’est pas atteint dans les deux tests rouges, qui échouent avant lui. Durées globales : rouge 21,03 s ; vert 14,21 s.

Les captures `baseline-after-reload-*` et `final-after-reload-*` ont été inspectées avant copie. Elles montrent respectivement la vue vide et cinq lignes restaurées. Les libellés d’organisation et identifiants abrégés visibles sont exclusivement ceux des fixtures synthétiques de ce banc ; aucune identité réelle, adresse personnelle, clé, cookie ou session n’y apparaît.

## Configuration et provenance

Recette : `tests/e2e/ide-logs-clear-reload.spec.ts`, configuration `.vibecore/ux-qa/logs-green.config.ts` (copie exacte : `playwright.config.ts.txt`), héritant de `playwright.config.ts` et sélectionnant le projet Chromium. Un worker, zéro retry, Chromium système `/usr/bin/chromium`, application `http://127.0.0.1:5227`, API locale port 3017 et PostgreSQL dédié port 55443. Les viewports sont définis dans le test, sans mode mobile ni tactile. Budget de test 90 secondes ; aucune attente artificielle ni clic forcé. Le filtre porte uniquement sur cette recette ; ce n’est pas une suite IDE complète.

`build-receipt.json` atteste le build terminé avec code 0, 9 465 sources comparées aux blobs Git sans différence et 2 307 fichiers compilés. `sources.json` et `compiled.json` contiennent uniquement chemins relatifs et empreintes. `served-asset.json` relie un asset servi au contenu compilé. L’archive privée a pour SHA-256 `0534930b72004c9aab6aa7f9e259049171b4ec8618bd1fcd0ae1f40cb2e21113` ; elle n’est pas jointe. Les résumés conservent les empreintes des rapports bruts, mais aucun rapport, trace réseau ou cookie n’est publié.

Le responsable du lot rapporte également 12/12 contrôles de garde et hooks typecheck, lint (zéro erreur, 52 avertissements) et gitleaks réussis. Ces contrôles sont distincts des deux tests navigateur ci-dessus ; les logs bruts restent privés.

## Limites

`runtimeLogCount` reste zéro. La mention visuelle « Running (local-dev) » et les lignes système ne valident ni démarrage d’un runtime réel, ni commandes, ni logs applicatifs. Les autres flux, export, recherche, regex, split view et comportement de polling après Clear ne sont pas certifiés ici. Aucun test mobile, tactile, Safari ou production ; aucun panneau entièrement certifié. Les résultats locaux ne remplacent pas les validations CI de la tête à publier.
