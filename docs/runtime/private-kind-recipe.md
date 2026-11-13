# Recette privée kind — validation fonctionnelle uniquement

État au 13 novembre 2026 : **recette fonctionnelle passée avec l'agent construit
par le Dockerfile de production inchangé (Node 24/musl)**,
[run 43442951559](https://github.com/openaxcloud/vibecore/actions/runs/43442951559),
SHA `1e46bd9bdb82c0b8125664eb6d99a549bd00a452`.
[Preuve et inventaire de dépendances](./private-kind-production-agent-evidence-2026-11-13.json) :
Node 24.22.3, Alpine 3.24.4, node-pty chargé, même imageID inspecté puis exécuté dans
les deux pods. Toutes les assertions fonctionnelles ci-dessous et le nettoyage passent.

La [preuve antérieure Node 22/glibc](./private-kind-evidence-2026-11-13.json),
[run 43440753492](https://github.com/openaxcloud/vibecore/actions/runs/43440753492),
reste distincte. Le troisième run ajoute la compatibilité du Dockerfile agent de
production ; il ne prouve pas qu'une image déjà déployée en production a ce digest.
API/manager restent des images de recette. Les checks requis de PR restent séparés ;
[la voie CI proposée](./private-kind-required-ci-next-step.md) n'a pas été exécutée
ni mise en œuvre pour E2E.

Le [premier run 43439209442](https://github.com/openaxcloud/vibecore/actions/runs/43439209442)
a échoué après construction du cluster et des images. Les références locales des
images publiques chargées dans kind ont ensuite été rendues explicites, et les
états expurgés publiés dans les journaux. Le deuxième run passe. L'artefact initial
n'a pas pu être téléchargé depuis cet environnement ; sa raison de conteneur exacte
n'a donc pas été lue indépendamment. Aucun échec n'est retiré de l'historique.

L'exécution locale reste bloquée par `ip6tables filter` indisponible lors de création
du réseau Docker kind. Aucune modification réseau/kernel n'a été faite. La preuve
GitHub reste fonctionnelle et éphémère : aucune génération IA, publication publique,
validation gVisor/isolation de production ou recette navigateur complète.

## Exécution après revue

Le workflow `private-runtime-recipe.yml` accepte le lancement manuel
(`workflow_dispatch`) et le push sur la seule branche de validation
`validation/private-runtime-20261113-7b970996`, sans PR, sans paramètre de cible ou de secret. Une fois le workflow
disponible sur la branche par défaut et la revue terminée, sélectionner la révision
à vérifier dans GitHub Actions et lancer **Private Runtime Recipe**. Ne pas lancer
`e2e-runtime.yml` ou `staging-runtime-validation.yml` pour cette recette : ils ont
un autre périmètre et référencent des secrets externes.

Le runner `ubuntu-latest` est jetable. Seules les minutes Actions sont consommées ;
aucun projet cloud, registre distant, domaine, certificat, compte tiers ou service
IA n'est provisionné. Le runner construit les images à partir de la révision
sélectionnée et les charge directement dans kind. Les dépendances publiques sont
téléchargées normalement. Le workflow n'utilise ni OIDC ni secret de dépôt ; ses
permissions sont `contents: read`, et checkout ne persiste pas son credential.

Le script refuse tout événement autre que `workflow_dispatch` ou ce push exact, et un runner qui
n'est pas hébergé par GitHub/Linux. Il crée un nom aléatoire, un répertoire privé,
un kubeconfig neuf et un namespace propre à cette exécution. Avant application,
il vérifie le contexte unique `kind-<nom>`, le serveur Kubernetes HTTPS en loopback,
les certificats embarqués, l'absence de plugin d'authentification/proxy et le label
de propriété du conteneur Docker. Tous les appels utilisent ce kubeconfig ; aucun
contexte cloud ou kubeconfig utilisateur n'est réutilisé.

## Composants réellement utilisés

- PostgreSQL pgvector avec PVC `standard` (local-path de kind), migrations et seed
  existants ; Redis réel.
- API et workspace-manager du dépôt, dans le cluster, avec DNS/service réel vers
  les pods agents. Le manager utilise son store Prisma et un ServiceAccount dont
  les droits sont limités au namespace éphémère.
- Image workspace-agent construite avec `services/workspace-agent/Dockerfile`
  inchangé (Node 24/Alpine musl), sans bridge synthétique. Le code exécuté dans le workspace est un petit serveur HTTP Node
  contrôlé par la recette et des commandes de test, sans génération IA.
- Stockage projet de l'API sur un PVC distinct ; archives projet également
  persistées dans PostgreSQL.

`WORKSPACE_DISABLE_SANDBOX_SCHEDULING=1` n'est défini que pour le manager avec
`NODE_ENV=test`. Les gardes et Dockerfiles de production restent inchangés. Ce
profil **ne valide ni gVisor, ni les NetworkPolicies, ni l'isolation de production**.

Les services sont `ClusterIP`, sans ingress, NodePort ou LoadBalancer. Les seuls
forwards sont sur `127.0.0.1`. L'URL privée est celle du proxy authentifié de l'API,
temporairement accessible au runner. Ce n'est ni une URL publique ni une URL client
durable ; le nettoyage détruit le banc. L'inscription utilise le chemin réel de
l'API, mais la livraison d'email n'est pas testée : sans fournisseur, le mode
développement utilise le journal expurgé existant.

## Critères de passage

Le workflow lance `scripts/validate-runtime-api-kubernetes.ts`, sans simulation du
manager ou de l'agent. Chaque échec rend le job rouge, sans `continue-on-error`.

1. Health JSON API/manager, inscription d'une identité jetable, création du projet,
   démarrage réel du workspace et pod Ready.
2. Écriture/lecture/listing/recherche, patch, commande Node et WebSocket terminal.
3. Une application réelle sur le port 4173 doit servir un marqueur HTTP unique.
   La preview du propriétaire doit répondre 200 avec ce contenu ; les accès
   anonymes et depuis une autre organisation doivent échouer sans ce contenu.
   Le bearer n'est envoyé qu'au proxy de même origine, sans suivre de redirection.
4. `adapter.createSnapshot()` doit toujours échouer avec le contrat **503
   `SNAPSHOT_ARCHIVE_UNAVAILABLE`**. Un inventaire runtime n'est pas une archive.
5. Un fichier distinct est écrit via `adapter.writeFile()` et relu dans le pod.
   La route de snapshots **projet** doit le référencer dans son manifeste. Le
   contrôleur de recette lit ensuite l'objet d'archive PostgreSQL dans le pod API,
   vérifie son checksum, ouvre le ZIP et compare les octets du fichier par SHA-256.
   Il ne suppose donc pas que le manifeste reflète automatiquement le runtime.
6. Après modification du fichier, l'arrêt/démarrage doit remplacer le pod
   (nouvel UID) en conservant le PVC (même UID). La modification doit survivre,
   ainsi qu'un fichier posé uniquement par `applyPatch`, sans persistance de
   manifeste : ce dernier distingue la persistance PVC du réensemencement projet.
7. La restauration du snapshot projet doit remettre les octets initiaux dans le
   pod. Son HTTP 200 n'est pas suffisant, car la synchronisation existante est
   best-effort. La recette échoue si la relecture réelle n'est pas conforme ; elle
   ne répare pas la synchronisation de production.
8. Export/import ZIP, puis arrêt réel du workspace.

Cette preuve porte sur un fichier sauvegardé par le chemin durable de l'API et sur
une archive **projet** récupérable. Elle ne prétend pas archiver tout état écrit
uniquement par le shell, les processus, la mémoire ou les bases des applications.
La résistance à une perte de nœud/disque, la reprise après sinistre et les autres
parcours client/IDE restent hors périmètre.

## Résultats et nettoyage

L'artefact `private-runtime-functional-<run>-<attempt>` conserve 7 jours le résultat,
la progression par phase et les états/imageIDs des pods. Les checksums des
archives peuvent être inclus, jamais les tokens, kubeconfig, manifests Secret ou
logs bruts. Une absence de résultat `ok: true` et un job non vert ne valent pas
validation. L'absence d'artefact n'est pas un succès.

Le `finally` supprime uniquement le cluster portant le nom/label généré. Une étape
`always()` reprend ce nettoyage en cas d'interruption ; le runner jetable reste le
dernier filet si GitHub tue le job avant de laisser finir le nettoyage.

Vérifications locales indépendantes du cluster :

```sh
node_modules/.bin/vitest run scripts/private-runtime-recipe/checks.test.ts
node_modules/.bin/tsc -p scripts/private-runtime-recipe/tsconfig.json
node_modules/.bin/eslint scripts/private-runtime-recipe/*.ts scripts/validate-runtime-api-kubernetes.ts
cd services/api
../../node_modules/.bin/vitest run --config vitest.config.ts src/tests/runtime-snapshot-contract.spec.ts
```

Le test API existant utilise une vraie écoute HTTP et des archives sur disque,
mais un store de métadonnées en mémoire : ne pas l'assimiler au passage de cette
recette PostgreSQL/Kubernetes. La validation statique Docker (`build --check`) ne
construit pas les images et ne prouve pas leur démarrage.

La PR de préparation porte `[skip ci]` dans son commit pour ne pas déclencher les
workflows push/pull_request existants qui injectent des clés IA. Les checks restent
en attente et la PR n'est pas prête à fusionner. Le contrôle de titre existant
`pull_request_target`, limité à la lecture des métadonnées PR avec le token GitHub
éphémère, n'est pas couvert par ce mécanisme. Après revue et autorisation, seuls
les trois runs de recette cités ci-dessus ont été déclenchés sur la branche dédiée,
sans PR. L'audit des 30 workflows et les runs associés à chaque SHA confirment
l'absence d'autre workflow déclenché par ces pushes.

Validation bootstrap permits push only on `validation/private-runtime-20261113-7b970996`, with no PR on that branch. Other pushes are refused. PR925 commits retain `[skip ci]` to prevent existing E2E workflows from receiving provider secrets. This recipe does not replace required PR checks.

L'agent utilise maintenant le Dockerfile de production inchangé. Sa base Node 24
est tirée par digest, retaguée localement pour le `FROM` existant et les couches
racines résultantes sont comparées à cette base. Le test exige que les pods aient
exactement l'imageID inspecté. Le build garde le `npm install` du Dockerfile : les
versions résolues et l'empreinte du package-lock sont enregistrées, sans promettre
la reproductibilité des futurs builds. Les dépendances API/manager restent figées
par le lockfile pnpm. Les paquets OS sont résolus à la construction. Aucun
Dockerfile de production ni garde de sécurité n'a été modifié.
