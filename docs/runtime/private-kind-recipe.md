# Recette privée kind — validation fonctionnelle uniquement

État au 13 novembre 2026 : **recette complète non exécutée**. Le runtime cloud
local refuse la création du réseau kind (`ip6tables filter` indisponible). Les
tests de contrat, le typecheck, le lint et la validation des manifests ne sont
pas une preuve de bon fonctionnement du parcours Kubernetes.

## Exécution après revue

Le workflow `private-runtime-recipe.yml` est exclusivement manuel
(`workflow_dispatch`), sans paramètre de cible ou de secret. Une fois le workflow
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

Le script refuse un événement autre que `workflow_dispatch` et un runner qui
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
- Image workspace-agent construite avec son Dockerfile existant, sans bridge
  synthétique. Le code exécuté dans le workspace est un petit serveur HTTP Node
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
la progression par phase et, en cas d'échec, les états des pods. Les checksums des
archives peuvent être inclus, jamais les tokens, kubeconfig, manifests Secret ou
logs bruts. Une absence de résultat `ok: true` et un job non vert ne valent pas
validation. L'absence d'artefact n'est pas un succès.

Le `finally` supprime uniquement le cluster portant le nom/label généré. Une étape
`always()` reprend ce nettoyage en cas d'interruption ; le runner jetable reste le
dernier filet si GitHub tue le job avant de laisser finir le nettoyage.

Vérifications locales indépendantes du cluster :

```sh
node_modules/.bin/tsx --test scripts/private-runtime-recipe/checks.test.ts
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
éphémère, n'est pas couvert par ce mécanisme. Aucun workflow de recette n'a été
déclenché pendant sa préparation.
