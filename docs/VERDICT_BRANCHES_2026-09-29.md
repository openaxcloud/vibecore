# Les huit branches du 8 septembre — verdict du 2026-09-29

**Aucune n'est à fusionner. Les huit sont obsolètes : leur travail est arrivé
dans `main` entre le 8 et le 29 septembre, par une autre proposition.**

## Ce qui a failli se produire

Le plan était de rebaser puis fusionner les six premières. La mesure l'a
interdit : ces branches ont **trois semaines de `main` de retard**, et une
fusion telle quelle aurait **retiré** ce que `main` a gagné depuis.

| Branche | La fusion aurait supprimé |
|---|---|
| `-503` | 435 lignes, dont `preview-fail-closed.spec.ts` en entier |
| `-apercu` | 59 734 lignes sur 914 fichiers |
| `-decouplage` | 60 485 lignes sur 923 fichiers |
| `-mort` | 57 465 lignes sur 898 fichiers |
| `-panneaux` | 59 724 lignes sur 918 fichiers |
| `-secrets` | 58 096 lignes sur 903 fichiers |

⚠️ **Le piège de lecture**, parce qu'il m'a eu d'abord : `git diff main...HEAD`
(trois points) montre ce que la branche a ajouté **depuis la base commune**, et
donne l'illusion d'un apport net. C'est `main..HEAD` (deux points) qui dit ce
qu'une fusion changerait **aujourd'hui**. Le premier annonçait « +171 lignes »
pour `-503` ; le second, « −435 ».

## La preuve que le travail est bien arrivé

Fichier signature de chaque branche, comparé **octet pour octet** à `main` :

| Branche | Fichier | Branche | `main` | |
|---|---|---|---|---|
| `-apercu` | `preview-etat-honnete.spec.ts` | 1 915 | 1 915 | identique |
| `-decouplage` | `serveur-dev-survit.spec.ts` | 9 604 | 9 604 | identique |
| `-mort` | `gestes-avi.spec.ts` | 4 408 | 4 408 | identique |
| `-secrets` | `secrets-unifies.ts` | 2 638 | 2 638 | identique |
| `-harnais` | `chaine-de-generation.perte.spec.ts` | 5 570 | 5 570 | identique |
| `-panneaux` | six fichiers | — | **plus gros** | `main` a plus |
| `-i18n` | `safe-fetch.ts` | 12 304 | 14 126 | `main` a plus |
| `-503` | `repondreSansJamaisLever`, `preview.proxy.route.absente` | — | présents | `main` a le correctif |

Pour `-panneaux` et `-i18n`, l'égalité d'octets ne s'applique pas : `main` est
plus gros sur **tous** les fichiers concernés. Pour `-i18n`, le témoin littéral
tranche — la ligne `const onAbort = () => target.destroy(Object.assign(new Error()`
est dans `main`.

## Ce qui reste vrai

Les seize commits sont poussés sur des branches `sauvegarde/<branche>-20260929`.
Rien n'est perdu : ces branches existent sur GitHub, consultables si un doute
surgit. Les répertoires de travail locaux, eux, ne servent plus à rien.

## La leçon

Une branche laissée trois semaines ne « vieillit » pas : elle devient un
**revert déguisé**. Le coût n'est pas le conflit — un conflit se voit — c'est la
fusion PROPRE qui retire silencieusement le travail des autres. Le contrôle qui
tranche tient en une commande : `git diff main..HEAD --shortstat`. Un grand
nombre de suppressions veut dire « cette branche est en retard », jamais
« cette branche nettoie ».
