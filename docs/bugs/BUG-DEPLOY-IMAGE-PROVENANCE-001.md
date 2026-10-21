# BUG-DEPLOY-IMAGE-PROVENANCE-001 — provenance des images réutilisées

## Défaut et portée

Base examinée : `4e79230ccfd63cb9562b88ffe9b8fe911f0bcb28`.
Le manifeste de livraison conserve le `sourceSha` d'une image reconstruite,
mais la boucle qui prépare les arguments Helm ne transmet pas cette valeur
à `services.<service>.imageSourceSha`. Au déploiement suivant, l'image est
épinglée par digest et son tag ne permet plus de retrouver le commit d'origine.
L'agent de workspace est référencé dans le ConfigMap, sans Deployment propre :
sa provenance nécessite donc une métadonnée dédiée sur ce ConfigMap.

Le correctif transmet aussi une valeur vide lorsque le manifeste indique
`sourceSha: null`, afin que les anciennes valeurs Helm ne conservent pas un SHA
devenu inconnu. Les annotations lient le SHA au digest du Deployment ou à la
référence complète de l'image de workspace. Une liaison absente ou différente
ne doit pas attribuer l'ancien SHA à une nouvelle image.

La provenance inconnue reste inconnue ; elle n'est jamais remplacée par le SHA
cible du déploiement courant. Le workspace-agent conserve `chartService: false`
et `rolled: false` dans le manifeste.

## Banc de non-régression

Fichier : `scripts/release-gate/image-provenance-roundtrip.checks.mjs`.
Commande complète, avec Helm 3 installé :

```sh
node --test scripts/release-gate/image-provenance-roundtrip.checks.mjs
```

Le banc utilise le vrai binaire `helm` du PATH et déduit la racine du dépôt
depuis son propre emplacement. Pour la contre-épreuve, le même fichier de test
est copié dans un arbre de base extrait par `git archive`, sans modifier le
checkout. Le banc n'installe rien et ne dépend d'aucun paquet npm.

Les huit scénarios couvrent :

1. Présence effective de Helm 3 et jq, avec échec explicite si un outil manque.
2. Exécution Bash/jq du bloc réel d'arguments du workflow : transmission du SHA
   connu et remise à vide explicite du SHA inconnu pour les deux catégories.
3. Rendu Helm réel des annotations et références d'images ; absence de Deployment
   et de clé `services.workspaceAgent` inventés pour l'agent.
4. Nouveau rendu avec `-f saved-values.json`, puis génération du manifeste réel :
   le SHA d'origine est conservé, distinct de la nouvelle cible.
5. Valeurs enregistrées obsolètes : `sourceSha: null` efface les anciennes
   annotations et conserve les nouveaux digests.
6. Rejet par le schéma Helm d'un SHA malformé sur un service.
7. Même rejet pour le workspace-agent.
8. Exécution Bash des gardes de liaison extraites du workflow : liaison identique
   conservée ; différente ou absente effacée.

Les objets et empreintes de ces tests sont synthétiques et isolés. Le test du
manifeste vérifie sa conservation des métadonnées, pas une signature Cosign ni
une analyse de vulnérabilités. Aucun faux Helm ou kubectl n'est utilisé. Les
assertions lisent les seuls champs scalaires concernés dans le YAML rendu ;
elles ne prétendent pas constituer un parseur YAML général.

## Preuves locales du 21 octobre 2026

Contre-épreuve avec le même banc sur l'arbre de base :

```sh
node --test --test-reporter=tap --test-name-pattern='actual Bash' \
  /tmp/provenance-base-4e/scripts/release-gate/image-provenance-roundtrip.checks.mjs
```

Attendu : le SHA doit apparaître dans les arguments Helm et être lié à l'image
courante. Observé sur la base : les deux tests échouent (0/2, code 1). Le premier
constate l'absence de `services.api.imageSourceSha` ; le second l'absence des
gardes liant la provenance au digest ou à la référence de l'image.

Sur les modifications de travail, les mêmes deux tests réussissent (2/2,
code 0, aucun saut). Cette preuve exécute Bash et jq réels ; elle ne constitue
pas une validation du rendu Helm.

La suite complète a été lancée localement : deux réussites, six échecs, aucun
saut, code 1. Les six échecs sont dus au binaire Helm absent (`ENOENT`). La
première tentative de téléchargement officiel de Helm 3.16.2 a reçu HTTP 403 ;
aucun autre accès n'a été essayé. Le rendu réel doit donc être validé par la CI
équipée de Helm avant de déclarer ce lot validé. Aucun résultat Helm vert local
ni validation Kubernetes en production n'est revendiqué.

Les journaux rouge, vert Bash et échec local Helm sont versionnés dans
[`proofs/image-provenance`](proofs/image-provenance/receipt.json), avec les
empreintes des sources et du banc. La CI doit fournir son propre résultat
complet au SHA final.

## Limite de certification

`helm template -f` exerce la fusion de valeurs et le rendu réels, sans contacter
un cluster. Ce banc ne prouve ni un `helm upgrade --reuse-values` en production,
ni la lecture kubectl, ni la correspondance des `imageIDs` de pods actifs.
Ces preuves appartiennent aux contrôles de déploiement et à leurs artefacts.

## Complément de revue : chemin break-glass et liaison persistée

La revue de `72415499ac45ffb9135026d3d4f0d193e327e9f8` a identifié un
chemin oublié : `deploy-break-glass.yml` remplaçait le digest avec
`--reuse-values` sans remplacer ni effacer le SHA. Le chart pouvait alors
associer automatiquement l'ancien SHA A à l'image B. La première preuve à
huit tests ci-dessus ne couvrait pas ce chemin et reste conservée telle quelle.

Le banc compte désormais treize tests, sans affaiblir les huit précédents.
Cinq tests supplémentaires exercent :

9. Bash/jq réels du bloc break-glass : digest B, SHA B distinct de A et liaisons
   explicites pour Deployment et workspace-agent.
10. Même bloc avec `sourceSha: null` puis champ absent (manifeste historique) :
    effacement explicite des deux SHA et des deux liaisons.
11. Rendu Helm réel de A vers B connu avec anciennes valeurs A sauvegardées.
12. Rendu Helm réel de A vers B inconnu, champ absent et null ; aucune annotation
    de provenance conservée et références d'images B exactes.
13. Ancien outil changeant uniquement les images : les valeurs sauvegardées SHA A
    et liaison A ne peuvent pas être réattribuées à B par le chart.

Le chart conserve désormais une liaison explicite dans les valeurs et n'émet
la provenance que si cette liaison correspond à l'image actuelle. Les valeurs
sauvegardées des tests incluent ces liaisons. Le test break-glass vérifie aussi
que le workspace-agent n'acquiert pas de Deployment.

Contre-épreuve locale sur l'arbre exact `72415499`, avec le nouveau banc copié :
les deux nouveaux tests Bash échouent (0/2, zéro saut, code 1), car les arguments
`imageSourceSha` sont absents. Sur les corrections, les quatre tests Bash
réussissent (4/4, zéro saut, code 0). La suite complète donne 4 réussites et
9 échecs, zéro saut, code 1 : les neuf échecs signalent Helm absent. Les rendus
Helm supplémentaires restent donc à valider par la CI, sans faux exécutable,
sans téléchargement alternatif et sans rollback réel. Les nouveaux journaux
et le reçu sont distincts de la preuve initiale à huit tests.

Les journaux de cette correction et leurs empreintes sont publiés dans
[`proofs/image-provenance/break-glass/receipt.json`](proofs/image-provenance/break-glass/receipt.json).
Le reçu initial reste rattaché à `72415499` et ne valide pas le chemin break-glass.
