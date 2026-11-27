# Publication dynamique sur le banc de nuit

Le créneau planifié conserve Orbit et README en premier, puis exécute la publication avant la suite Chromium restante et l’audit. Les trois scénarios tournent successivement pour éviter la concurrence sur le nœud kind. Après les préconditions communes, un échec d’Orbit ou de README laisse la publication produire son propre verdict, puis le wrapper échoue. Les plafonds de processus sont 390, 270 et 330 secondes respectivement (puis au plus 5 secondes avant SIGKILL pour chacun). Ils englobent les limites Playwright existantes de 360, 240 et 300 secondes. Le budget global de la phase navigateur reste de 40 minutes.

Si Orbit et README passent, la suite Chromium et les audits suivent même quand la publication échoue. Leur premier échec conserve son code de sortie et arrête les contrôles suivants. Si ces contrôles passent, le wrapper renvoie le code de publication. Le test de cette règle se lance avec `bash tests/private-runtime-dynamic/wrapper-check.sh`.

Le fichier `dynamic-publication-status.json` distingue un passage non démarré, en cours, échoué, expiré/tué, sans preuve valide ou réussi. Le succès exige une sortie zéro et un reçu neuf pour le SHA du run. Si la phase navigateur n’est jamais atteinte, aucun résultat de publication n’est attendu.

Dans le namespace jetable, le worker de la même image plateforme consomme la file Redis et appelle l’API interne. Le gestionnaire peut appliquer le Deployment et le Service du serveur. L’API émet un domaine localhost et le proxy interroge l’état auprès de cette API, puis adresse le Service du namespace de la recette.

Le scénario utilise Run, Monaco et le bouton Publier. Il exige l’acquittement durable de B, vérifie la règle modifiée sur l’aperçu, attend READY et relie l’EndpointSlice prêt à l’UID d’un pod Ready. Une seconde instance de Chromium sans session appelle deux fois l’URL serveur émise, avec des arguments frais. Une publication en file, un résultat de A ou une redirection échoue.

Le nom exact émis est résolu pour ce navigateur vers un relais HTTPS sur un port loopback éphémère. Une autorité de test propre à ce processus signe un certificat limité à ce nom. Le relais conserve le Host vers le port-forward du proxy Vibecore. Cette observation qualifie le routage local. Elle ne mesure ni le DNS Internet ni la chaîne de certificats de production. Seul un succès intégral écrit private-runtime-evidence/dynamic-publication.json.

Depuis la racine du checkout, avec les dépendances du dépôt, Chromium, OpenSSL et certutil installés :

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm exec tsx tests/private-runtime-dynamic/local-check.ts
pnpm exec playwright test --config=tests/private-runtime-dynamic/playwright.config.ts --list
```

Le premier contrôle utilise un serveur Node local, modifie son fichier de règle et vérifie B par HTTPS ainsi que le rejet de A. La voie Kubernetes complète est réservée à la recette planifiée.
