# Pastille « descendre » — diagnostic local du 12 octobre 2026

## Conclusion et patch proposé

Base vérifiée après `git fetch origin main` : `d95ec431c34a4bae32737dc931549a95a32e9454`. Branche propre à cette tâche : `codex/pastille-reproduction-20261012`. Aucun push ; dérogation inchangée.

**Une course du protocole de test est reproduite sur la vraie application locale avec une réponse de messages retardée.** `attendreLeFilStable` rend après cinq lectures `aucune`, puis la remontée ne trouve aucun conteneur. Les messages arrivent ensuite, le fil se place en bas et la pastille n'apparaît pas : échec de l'assertion d'origine.

Le correctif est limité au test « elle se peint sur le fil, et sur rien d’autre » : attendre les **12 messages préparés** (cinq échanges longs, puis deux messages finaux) avant l'attente de stabilité existante. Aucun code produit, helper partagé, seuil de peinture ou timeout d'assertion existant n'est modifié. Le nouveau contrôle échoue explicitement si le transcript n'arrive pas.

**Cela ne démontre pas encore que cette course explique l'échec du run CI 38254028599.** Ses traces restent inaccessibles et le harnais local comporte les différences décrites ci-dessous. Aucun défaut produit n'est déclaré résolu.

## Résultats ciblés

Toutes les exécutions utilisent un seul worker, sans retry, uniquement ce test à 390 × 844, tactile, échelle 2.

| Variante                                                             | Résultat                                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Test d'origine, sans retard                                          | 1 passage puis 5 répétitions réussis                                             |
| Test d'origine, réponse réelle des messages retardée de 8 s          | 1 échec reproduit : pastille introuvable après 20 s                              |
| Test corrigé, même retard de 8 s                                     | 3/3 réussis, 20,9 / 22,3 / 21,5 s                                                |
| Test corrigé, chargement des messages interrompu (`connectionreset`) | Échec attendu sur la nouvelle précondition : 0 message au lieu de 12, borne 20 s |
| Test corrigé, sans retard après interruption                         | 3/3 réussis, total 33,4 s                                                        |

Avant correction, la trace montre les cinq retours `aucune` puis l'évaluation de remontée sans cible. Après arrivée du transcript : 12 lignes, `clientHeight=599`, `scrollHeight=1186`, `scrollTop=586`, aucune pastille et aucune erreur JavaScript de page.

Après correction, les trois mesures montrent les 12 lignes, puis une remontée effective à `scrollTop=0` et la pastille présente. Les assertions d'origine vérifiant la peinture sur le fil, puis l'absence de peinture au-dessus d'Aperçu et Git, passent toutes. [Mesures des trois passages](captures/pastille-2026-10-12/mesures-apres.json).

Captures réellement inspectées : [avant, fil arrivé en bas sans pastille](captures/pastille-2026-10-12/avant-latence.png) ; [après, fil remonté et pastille visible](captures/pastille-2026-10-12/apres-latence.jpeg). Les captures de la trace initiale incluent aussi les panneaux Aperçu/Git. Une image de transition vers Aperçu montre encore le fil pendant le skeleton ; les assertions du test mesurent après son attente existante de 1,5 s. Aucune conclusion d'absence de fuite pendant toute la transition n'est revendiquée.

## Harnais, sécurité et limites de fidélité

Le harnais temporaire `/tmp/pastille-harness` importe le test original, impose son `grep` et les URL API/web loopback, puis utilise le vrai build, l'API, PostgreSQL et Redis. `--list` confirme exactement un test. Il ne remplace aucun contenu de transcript : pour la contre-épreuve, la route GET `/api/projects/<id>/ai/conversations/<id>/messages` fait `route.fetch()`, attend 8 s, puis `route.fulfill({ response })`. Pour l'interruption, cette même requête est abandonnée avec `connectionreset`. Une sonde en lecture seule relève identité du conteneur, messages, hauteurs, position et présence de la pastille ; les traces enregistrent aussi les retours du helper.

Aucun workspace utilisateur ni modèle ne doit démarrer : le build diagnostique fixe `VITE_RUNTIME_MODE=remote-kubernetes` (valeur vérifiée dans les fichiers générés), puis le harnais refuse les routes runtime/runtime-token, chat, génération/publication et toute origine hors loopback ; service workers et WebSockets bloqués. Les refus réellement observés pendant les passages réussis sont les deux demandes Google Fonts et `/api/runtime-token`. Aucun appel modèle, démarrage effectif de runtime, génération ou publication. Aucun secret ni réglage réseau global modifié.

Le navigateur Playwright 1.59.1 attendu est Chromium 147.0.7727.15, révision 1217. Son téléchargement standard échoue avec `403 Domain forbidden` sur **cdn.playwright.dev**, y compris les reprises automatiques de la même commande. Aucune route alternative de téléchargement tentée. Le diagnostic emploie le **Chromium système déjà installé 154.0.8037.57**. Node est 24.19.0 contre 22 en CI. Runtime refusé, polices externes absentes et WebSockets fermés peuvent modifier les timings et le rendu : ces passages ne valent pas une validation CI identique, Safari/iPhone réel ou production.

Commandes de la session (préfixées par `PATH=/tmp/pastille-bin:$PATH`, lanceur explicite pnpm 9.14.4) :

```sh
# Le harnais exige ces trois variables loopback.
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173
export API_BASE_URL=http://127.0.0.1:3001
export SAAS_API_URL=http://127.0.0.1:3001
pnpm exec playwright test --config=/tmp/pastille-harness/playwright.config.ts --list
pnpm exec playwright test --config=/tmp/pastille-harness/playwright.config.ts --repeat-each=5
PASTILLE_DELAY_MESSAGES=8000 pnpm exec playwright test --config=/tmp/pastille-harness/playwright.config.ts --repeat-each=3
PASTILLE_ABORT_MESSAGES=1 pnpm exec playwright test --config=/tmp/pastille-harness/playwright.config.ts
```

Logs, harnais et traces complets restent locaux sous `/tmp/pastille-evidence` et `/tmp/pastille-harness`. Les traces contiennent les sessions jetables de test ; elles ne sont pas ajoutées au dépôt. Les captures et mesures publiables ci-dessus ne contiennent pas de jeton ni URL signée.

## Accès GitHub et préparation locale

L'API GitHub répond ; le job `114838186265` est déclaré `success`, ce qui ne prouve pas la réussite du test sous dérogation. Logs du job et ZIP `11752176803` redirigent tous deux vers **productionresultssa0.blob.core.windows.net** : tunnel **403 Forbidden** encore observé vers 16:00 UTC (Python puis confirmation curl, code 56). Chemin arrêté, aucune nouvelle tentative après instruction du parent. Aucun autre domaine final rencontré ni URL signée conservée dans ce rapport. L'environnement est `ready`, mais aucun identifiant de version de configuration réseau n'est exposé ; son application complète ne peut être attestée.

`binaries.prisma.sh` est maintenant accessible au téléchargement supporté : Prisma/client 7.8.0 et schema-engine `3c6e192761c0362d496ed980de936e2f3cebcd3a` exécutables. Migrations et seed réussis. Avant pile : environ 653 Mio utilisés selon `free -m`, limite cgroup 16 Gio. Avant redémarrage : 894 Mio utilisés ; cgroup 6,63 Go incluant les caches.

Le pnpm global est 11.25.0 ; aucune installation avec cette version. Corepack et le lanceur sous `/tmp` utilisent **9.14.4**. Les 285 dépendances directes non workspace, tous importers confondus, correspondent exactement au lockfile. Aucun build de fixture ou installation JavaScript implicite. `package.json` et `pnpm-lock.yaml` inchangés.

Images officielles téléchargées : `pgvector/pgvector:pg16`, `redis:7-alpine`, `axllent/mailpit:v1.24`. Digests identiques au [rapport précédent](2026-10-12-pastille-reproduction-bloquee.md). Projet Compose isolé `pastille1012`, ports liés à `127.0.0.1`, `--pull never` après téléchargement explicite.

## Healthcheck Mailpit local

Le contrôle du dépôt utilise BusyBox wget 1.37.0. Dans ce conteneur, il affiche `Connecting to 172.31.2.253:8080` puis `403 Forbidden`, tandis que le port publié répond 200 depuis l'hôte. À 16:03 UTC, Docker comptait 21 échecs consécutifs et indiquait `unhealthy`.

Après autorisation explicite du parent, vérification des consignes de l'environnement : aucune interdiction explicite d'accès loopback. Une surcharge **uniquement sous `/tmp/pastille-evidence/mailpit-health.override.yml`** limite la désactivation du proxy à cette commande de santé et à son URL littérale :

```yaml
services:
  mailpit:
    healthcheck:
      test: ['CMD', 'wget', '-Y', 'off', '-q', '--spider', 'http://127.0.0.1:8025/api/v1/info']
```

Mesures réelles : connexion affichée à `127.0.0.1:8025`, HTTP 200 ; même commande sur le port fermé 8026, `Connection refused` et échec. `docker compose ... up --wait --wait-timeout 30` confirme ensuite les trois services sains. Aucun état de santé forcé, proxy global, politique, secret ou destination externe modifié. La surcharge répond à cet environnement de diagnostic et **n'est pas conservée dans docker-compose.dev.yml**. Elle a été relue indépendamment.

## Validation et revue

Le build diagnostique a réussi. Un premier build sans garde runtime a été interrompu avant navigation ; aucun résultat de ce build n'est revendiqué.

Typecheck ciblé réussi : `pnpm exec tsc --noEmit --strict --skipLibCheck --target ESNext --moduleResolution bundler --module ESNext --esModuleInterop tests/e2e/ide-mobile-chrome.spec.ts`. Lint ciblé réussi après correction du format du commentaire. Formatage et `git diff --check` contrôlés. Pas de suite complète, typecheck/lint global ou validation production.

La relecture indépendante recommande cette précondition exacte plutôt qu'une simple présence de conteneur potentiellement partiel ; elle confirme que les assertions produit ne sont pas assouplies. Les autres faiblesses possibles du helper (ancêtres différents, identité/hauteur visible ignorées, sortie à 20 s) restent hors patch, faute de reproduction supplémentaire.

Relecture finale indépendante : aucun bloquant ; captures avant/après inspectées par le relecteur et cohérentes avec les mesures. Le test, la fiche bug, ce rapport et le JSON de mesures passent Prettier. `BUG_INVENTORY_LIVE.md` présente des écarts Prettier déjà présents sur `HEAD`, hors de la ligne modifiée ; aucun reformatage global du journal n'est inclus.

Fin de session : les serveurs API/web et les trois conteneurs créés pour cette tâche ont été arrêtés. Images, volume local, traces et harnais sont conservés pour la revue du parent. Aucun push ni fusion ; la surcharge de santé locale n'est pas ajoutée au dépôt.
