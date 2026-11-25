# Runtime IDE : preuves locales isolées du 26 octobre 2026

Base inspectée : `951ceb8d5653bee4df30b010753c859c0c4a44c0`.
Ces preuves portent sur le backend de l'agent et de vrais processus locaux,
pas sur une recette navigateur ni sur la version déployée.

## Résultats observés

| Parcours | Preuve réelle | Limite |
| --- | --- | --- |
| Démarrage et arrêt de l'agent | `server.ts` lancé dans un processus Node distinct, HTTP loopback disponible puis indisponible après SIGTERM | Pas de création de pod Kubernetes |
| Reprise après panne | SIGKILL du processus agent, nouveau processus sur la même racine, lecture du fichier et commande réussies ; commande avec code 17 suivie d'une commande saine | Redémarrage explicite du banc, pas preuve d'un superviseur cloud |
| Fichiers | Écriture UTF-8 et binaire, lecture disque/API, renommage et suppression conservés après réouverture | Répertoire temporaire local, pas PVC, stockage objet ou restauration |
| Commandes | stdout/stderr séparés, codes non nuls conservés, processus de fond suivi puis arrêt OS confirmé | Aucun programme client exécuté |
| Shell | cwd, fichier, pipeline ; terminal WebSocket conservant cwd/env après reconnexion, sortie et code d'exit observés | Pas de terminal navigateur ni certification de tous les backends PTY |
| Dépendances | Vrai `npm install --offline --ignore-scripts` d'une fixture `file:`, puis import exécuté donnant 42 | Ni registre externe, ni package privé, ni scripts d'installation |
| Preview | Serveur Node réel découvert, réponses HTML/JSON/binaire via proxy de l'agent, jeton d'un autre espace refusé ; panne de démarrage puis fichier corrigé et relance saine | Pas d'ingress public, DNS/TLS, navigateur ou HMR d'un framework |

Aucun défaut produit n'a été reproduit dans ces parcours. Le premier essai du
nouveau banc de redémarrage attendait à tort `exitCode` sur `/commands/run` :
le contrat de l'agent est `code`/`stdout`. L'assertion du banc a été corrigée ;
aucune modification produit n'en a été déduite.

## Banc et validations

Les trois nouveaux fichiers de test dans `services/workspace-agent/src/` sont :

- `runtime-agent-restart-proof.spec.ts` : 1 parcours de processus agent distinct ;
- `runtime-files-preview-proof.spec.ts` : 3 parcours fichiers/preview ;
- `runtime-shell-install-proof.spec.ts` : 5 parcours commandes/Shell/npm.

Ils utilisent des fichiers synthétiques dans des répertoires temporaires, des
ports loopback éphémères et les secrets statiques des fixtures existantes pour
signer des jetons de test courts. Aucun accès persistant ou secret opérationnel
n'est créé. Les enfants, sockets et répertoires sont nettoyés ; le nettoyage
preview dispose d'un secours OS si l'endpoint Stop régresse. Le terminal a un
HOME temporaire, et npm dispose d'un environnement/config/cache isolés.

Exécution reproductible depuis le dépôt :

```sh
pnpm --filter @vibecore/workspace-agent exec vitest run src/runtime-agent-restart-proof.spec.ts src/runtime-files-preview-proof.spec.ts src/runtime-shell-install-proof.spec.ts
pnpm --filter @vibecore/workspace-agent test
```

La suite agent complète passe avec **157 tests dans 16 fichiers**. Les neuf
nouveaux parcours ont aussi été exécutés séparément par une revue indépendante.
Les suites historiques comprennent des contrôles synthétiques et des tests
de vrais processus ; ce total n'est donc pas présenté comme 157 recettes cloud.

## Coordination et points non certifiés

Aucun `app.ts`, route Git/GitHub, pipeline, permission, index partagé ou code
produit n'est modifié. #799 garde la priorité d'intégration. Ce lot fournit une
preuve de non-régression reproductible, sans annoncer l'IDE entier comme fini.

La session UI possède la recette navigateur. Les opérations manager/PVC,
redémarrage automatique après éviction, installations depuis un registre externe
et ingress de preview restent à vérifier dans un environnement expressément
autorisé. Leur fonctionnement en production ne se déduit pas de cet audit.

Le typage strict des trois nouveaux fichiers, leur lint ciblé et le contrôle
pré-commit du dépôt passent (0 erreur de lint, 52 avertissements existants).
Après les derniers ajustements de validation JSON, les neuf nouveaux tests
passent à nouveau. La revue finale des sources est favorable.
