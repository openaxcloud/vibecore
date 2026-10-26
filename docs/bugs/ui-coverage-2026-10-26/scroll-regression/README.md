# Régression de défilement à faible hauteur

Nouveau test ajouté en fin de `tests/e2e/ecode-marketing-content.spec.ts`, sans modifier les assertions existantes (notamment celle de largeur susceptible de chevaucher #559). Une seule suite existante, aucun test miroir CSS.

Chromium local,844×390, route publique anonyme `/account-inactivity?lang=fr`. Pour chaque mécanisme, navigation fraîche : dernier paragraphe initialement hors viewport, **un seul geste** wheel260 ou PageDown, puis poll en lecture seule vérifiant un déplacement supérieur100px. Aucun `scrollIntoView`, focus/clic auto-défilant, changement de CSS ou répétition de gestes. Le guard prouve le déverrouillage utilisateur ; il ne revendique pas la visibilité intégrale du dernier paragraphe. Les requêtes nonGET et tierces sont bloquées.

- `before11199.txt` : rouge sur ancien build sans correction CSS, déplacement0 après wheel260. PageDown n’est pas atteint puisque la première assertion échoue. Zéro retry.
- `after11099.txt` : **1 test réussi**, wheel et PageDown tous deux exécutés,3,4s pour le test ; fichier exact du dépôt, zéro retry.
- `interrupted10899.txt` : tentative interrompue par arrêt du serveur pendant hydratation. Ce résultat ne constitue pas un rouge produit.

Le premier prototype répétait des gestes dans le poll et cherchait un alignement complet ; revue indépendante a identifié un risque de dépassement de la cible. Il a été remplacé avant application par le geste unique ci-dessus. Le rouge archivé ici concerne cette version corrigée, pas le prototype.

## Commandes réellement exécutées

Depuis `/workspace/vibecore-ui-coverage` :

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:11199 node node_modules/@playwright/test/cli.js test --config=/tmp/ui-scroll-regression/playwright.config.ts --grep 'public policy remains scrollable'
PLAYWRIGHT_BASE_URL=http://127.0.0.1:11099 node node_modules/@playwright/test/cli.js test --config=/tmp/ui-scroll-regression/playwright-repo.config.ts --grep 'public policy remains scrollable'
```

Les deux configurations utilisées sont archivées comme `executed-before.config.ts.txt` et `executed-after.config.ts.txt`. Mêmes paramètres :1worker, projet Chromium, `/usr/bin/chromium`, zéro retry, aucun webServer lancé par le test. Seuls testDir (copie temporaire avant application / fichier réel après), baseURL et dossier de sortie changent. `source-proof.json` vérifie l’identité du nouveau test avant/après hors formatage Prettier et conserve le SHA256 du fichier final. Les chemins absolus de ces configurations documentent l’exécution ; les adapter si le dépôt change d’emplacement.

Les anciennes suites de85 gardes n’ont pas été répétées. Aucune mutation, backend réel, authentification production, Safari/Firefox, clavier virtuel ou recette IDE revendiquée. Le parent gère le serveur11099 ; le navigateur Playwright a terminé normalement.
