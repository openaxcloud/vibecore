# Monaco — identité du document pendant le chargement asynchrone

## Base et périmètre

Suite du commit local onglets `464fbb5f05460ed4037af68adcd15fe814830386`, lui-même basé sur main `30fb463710f2c75429e29cae8aefb76bfc5194d0`. Relecture indépendante de ce premier commit favorable. Aucun push ni PR. Pile locale unique reprise, mémoire avant redémarrage : environ 1 Gio utilisé, plafond cgroup 16 Gio. Versions, images et restrictions identiques au [premier audit](2026-10-12-audit-local-fichiers.md).

## Reproduction réelle avant correction

Trois contextes Chromium neufs, compte et projet synthétiques, import API réel de `audit.txt` et `other.txt` avec contenus distincts. Aucun enregistrement IDE tenté. Requêtes runtime et génération bloquées ; aucune réponse de succès simulée.

1. Ouverture normale, sans retard ajouté.
2. Module JavaScript Monaco retenu jusqu'après sélection A, puis libéré sans modifier un octet de la réponse.
3. Même barrière, sélection rapide A → B → A avant libération.

Dans les trois cas, après chargement :

| Source observée | Chemin / valeur |
| --- | --- |
| Onglet et chemin affiché | `audit.txt` / `/audit.txt` |
| `workbenchStore.currentDocument` | `/home/project/audit.txt` / `PERSISTENCE-ORIGINAL-20261012\nsecond line\n` |
| Modèle **actif** de l'éditeur Monaco (`getEditors()[0].getModel()`) | `file:///home/project/README.md` / `# Local persistence audit\n` |
| Texte effectivement rendu | `# Local persistence audit` |

Après sélection B puis retour A, modèle, store et texte se réalignent. JSON et captures conservés sous `/tmp/monaco-evidence/`, journal `reproduce-before.log`. Captures du défaut inspectées. Lecture observationnelle des modules déjà chargés, sans modification du store ou des fichiers. Le cas normal et la contre-épreuve composant ci-dessous écartent une simple conséquence de la barrière du harnais.

## Cause et correction

`DesktopCodeEditor` attend l'import dynamique de Monaco. Sa continuation utilisait `value` et `filePath` capturés lors du montage, alors que la sélection avait changé. L'effet de synchronisation avait déjà tourné et rendu la main faute d'éditeur ; l'affectation d'une ref lors de la résolution ne le rejouait pas.

Le modèle initial utilise désormais les refs courantes du contenu, du chemin et de la langue du fichier. Une version d'initialisation rejoue les effets de synchronisation des options, modèles de workspace et thème après création, y compris après un remontage dû au changement de langue de l'interface. Le garde de suppression des notifications de modifications externes reste en place. Aucun changement des routes de sauvegarde ou du runtime.

## Contre-épreuve et validations

`packages/editor/src/desktop-editor.spec.ts` contrôle la résolution de l'import. Montage README, changements A/B/A, démontage d'un second éditeur avant résolution, puis comparaison du modèle actif. Le test final, exécuté sur la source du premier commit, échoue : attendu `/a.txt`, reçu `/README.md`. La source corrigée passe. Le test contrôle aussi :

- options et thème modifiés avant résolution ;
- allers-retours A/B/A après initialisation ;
- mise à jour externe sans `onChange` ni `onSave` ;
- modification utilisateur déclenchant exactement un `onChange`, aucune sauvegarde ;
- remontage après passage de l'interface en français, avec modèle/options/thème cohérents.

35 tests ciblés (`desktop-editor`, `mobile-editor`, `index`) réussis. Typecheck strict du package, incluant le nouveau test, réussi. ESLint du nouveau test et Prettier réussis. Le lint ESLint racine appliqué à `packages/editor/src/index.ts` signale sept erreurs existantes : mêmes règles et occurrences sur la source baseline et corrigée, preuve `eslint-baseline.log` / `eslint-current.log`. Aucun masquage de règles ; le lint officiel du package est son typecheck.

Build corrigé et typecheck web réussis. Les trois scénarios navigateur rejoués sur ce build passent : cas normal, module retenu après A, module retenu après A/B/A. Pour chacun : état après chargement, B, retour A et réouverture. Les 12 instantanés JSON concordent sur onglet actif, chemin du store, URI du modèle actif, contenu exact et texte rendu (normalisation des retours ligne/NBSP de Monaco). Captures corrigées inspectées, notamment `after/held-a-b-a-loaded.png` et `after/normal-reopened.png`.

Le test E2E du premier commit est rejoué avec les deux correctifs : 3/3 verts, un worker, zéro retry, 28,6 s. Sa précondition d'initialisation reste explicite ; le nouveau test composant et les scénarios avec import retenu protègent séparément la course Monaco.

Les tests mobile existants émettent des diagnostics de géométrie JSDOM (`getClientRects` absent), sans échec de test. Cela ne constitue pas une validation de navigateur mobile. Les preuves brutes sont conservées dans `/tmp/monaco-evidence/` et le harnais réel dans `/tmp/monaco-harness/reproduce.mjs`.

## Limites

Chromium système 154, Node 24 ; navigateurs/version Node CI et production non testés. Aucune écriture de contenu incorrect sous un autre chemin tentée, aucune conséquence de sauvegarde déduite. La persistance IDE avec runtime fonctionnel reste hors preuve ; les essais présents ne modifient que des données et états UI locaux synthétiques. Aucune ressource payante.
