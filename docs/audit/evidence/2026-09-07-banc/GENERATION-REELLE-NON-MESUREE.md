# La génération réelle n'a pas pu être mesurée sur le banc — 2026-09-07

**Verdict : mesure NON FAITE.** Ce document dit pourquoi, avec les commandes,
pour qu'elle soit refaite sans refaire l'enquête.

## Ce qui était à prouver

`#476` — `fix(agent): le générateur reçoit enfin l'arborescence et la consigne
de câblage`. Le correctif ajoute `construireBlocArborescence()` dans
`app/lib/.server/llm/stream-text.ts` : le modèle reçoit l'arborescence complète
du projet et l'obligation de rattacher tout fichier créé au point d'entrée
existant. C'est du **code serveur du service `web`**.

La seule preuve qui vaille est une génération réelle : un prompt, un fichier
créé, et la vérification qu'il est atteignable depuis le point d'entrée.

## Ce qui a été mesuré

Le banc **répond** — c'était la condition d'ouverture.

```
$ curl -sS -o /dev/null -w '%{http_code}' https://app.34.163.208.161.sslip.io/
200
```

Premier geste, avant toute mesure : lire ce que le banc SERT.

```
$ kubectl --context gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster \
    -n vibecore get deploy -o custom-columns='NOM:.metadata.name,IMAGE:.spec.template.spec.containers[0].image'
```

| service | tag servi | date du commit |
|---|---|---|
| **web** | `42d82c279f-rk` | **2026-09-05** |
| api | `0e1361cb03` | 2026-09-06 |
| les 6 autres | `1c68880b39` | 2026-08-12 |

Le banc est donc **hétérogène**, et c'est le tag `web` qui compte ici.

```
$ git show 42d82c279f:app/lib/.server/llm/stream-text.ts | grep -c construireBlocArborescence
0
$ git show origin/main:app/lib/.server/llm/stream-text.ts | grep -c construireBlocArborescence
3      ← témoin positif : la sonde trouve bien le motif quand il est là
$ git rev-list --count 42d82c279f..origin/main
46
```

L'image web servie est **46 commits derrière `main`** et ne contient pas le
correctif.

## Et aucune image disponible ne le contient

Avant de conclure, la question suivante : une image plus récente existe-t-elle
dans le registre du banc ? Les sept images `web` du registre ont été testées une
par une.

```
$ gcloud container images list-tags .../vibecore-audit-containers/web --limit=8
```

| tag | date du commit | `construireBlocArborescence` |
|---|---|---|
| `890f4c9295` (la plus récente) | 2026-09-06 12:44 UTC | **0** |
| `b6c75c2cb9` | 2026-09-06 | 0 |
| `42d82c279f` (servi) | 2026-09-05 | 0 |
| `2d0bdce198`, `e77b61af5b`, `9d2f19f15c`, `fce8639ab3` | 09-05 / 09-01 | 0 |

La raison est arithmétique : `#476` est entré dans `main` le **2026-09-06 à
21 h 41 (+03:00)**, et la plus récente image du banc a été construite d'un
commit de **12 h 44 UTC le même jour** — environ **six heures plus tôt**.

## Conclusion

**Un redéploiement ne suffirait pas** : il n'y a rien à redéployer. Prendre
cette preuve exige une **construction neuve du service `web` depuis `main`**
pour l'environnement d'audit, puis un `helm upgrade` sur le banc.

Tant que ce n'est pas fait, toute génération lancée sur le banc mesurerait le
comportement d'AVANT le correctif. C'est exactement le piège du 2026-09-06, où
un banc portant du code du 1er septembre a produit trois hypothèses fausses
avant qu'on pense à lire le SHA servi.

## Ce qui reste vrai sans cette preuve

Le correctif est en production, et sa forme est tenue par un test :
`app/lib/.server/llm/arborescence-cablage.spec.ts`. Ce que le test tient, c'est
que la consigne est **construite et transmise**. Ce qu'il ne peut pas tenir,
c'est que le modèle **l'applique** — et c'est précisément ce que la génération
réelle mesurerait. La dette reste ouverte.
