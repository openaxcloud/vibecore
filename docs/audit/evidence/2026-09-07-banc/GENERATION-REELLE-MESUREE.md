# Génération réelle sur le banc — le code produit est branché

**Verdict : POSITIF, deux fois sur deux.** Le point d'entrée est modifié, et
aucun fichier de production créé n'est orphelin.

Ce document remplace le verdict de `GENERATION-REELLE-NON-MESUREE.md`, écrit le
même jour quand le banc servait encore un `web` du 05/09.

## Ce que le banc servait, vérifié par moi

| service | image | contrôle |
|---|---|---|
| web | `7298b30a62-rk` | 2 pods, 22 min, **0 redémarrage** |
| api | `0e1361cb03` | 2 pods |

Le correctif a été cherché **dans l'image qui tourne**, pas dans le commit :

```
$ kubectl exec <pod web> -- grep -c <motif> /app/build/server/assets/server-build-C_I-0Frj.js
  WIRING REQUIREMENT                  1
  PROJECT FILE TREE                   1
  boltArtifact                       43   ← témoin positif
  MOTIF_QUI_NE_DOIT_PAS_EXISTER_XYZ   0   ← témoin négatif
```

## Le dispositif

Session mintée en base pour un utilisateur **existant** du banc (aucun compte
créé, aucun mot de passe saisi) ; le jeton brut n'a jamais quitté le poste — seule
son empreinte SHA-256 a été transmise. Témoin : `/dashboard` rend **200** avec le
cookie et **302** sans. Session **révoquée** en fin de mesure, contre-épreuve à
302.

Appels réels sur `POST /api/chat` du service `web`, exactement comme le client.

> **Le premier essai ne mesurait rien, et c'est instructif.** Sur un projet vide
> j'ai envoyé `files: {}`. Or `projectFilePaths = files ? Object.keys(files) : []`,
> et `construireBlocArborescence` **rend une chaîne vide** quand la liste est
> vide : la consigne n'était pas émise. Le correctif ne s'applique qu'à un projet
> qui a **déjà** des fichiers — ce qui est précisément le cas qui échouait.

## Les deux mesures

Chaque fois : un projet **portant déjà un point d'entrée**, et une demande qui
oblige à créer plusieurs fichiers.

### A — projet JavaScript, 6 fichiers, point d'entrée `src/App.jsx` (340 o)

Demande : un panneau de statistiques, trois indicateurs, un graphique en barres,
les agrégats dans un module séparé. **9 fichiers écrits.**

| | |
|---|---|
| point d'entrée réécrit | **OUI** — 340 → 699 octets, empreinte différente |
| import ajouté | `import StatsPanel from './components/StatsPanel.jsx';` |
| orphelins | **AUCUN** |

Atteignables depuis `src/main.tsx`/`main.jsx` en suivant les imports :
`App.jsx`, `components/StatsPanel.jsx`, `lib/stats.js`, `styles.css`.
`stats.js` n'est pas importé par `App.jsx` — il l'est par `StatsPanel.jsx` :
c'est l'**atteignabilité transitive** qui compte, pas la citation directe.

### B — projet TypeScript, 6 fichiers, point d'entrée `src/App.tsx` (312 o)

Demande : un formulaire de recherche filtrant par nom et ville, une fiche de
contact, la logique de filtrage à part. **14 fichiers écrits.**

| | |
|---|---|
| point d'entrée réécrit | **OUI** — 312 → 1 605 octets |
| orphelins | **AUCUN** |
| extensions | `.tsx` / `.ts` conservées — la clause « match the extensions already in use » a tenu |

Atteints : `App.tsx`, les trois composants, `data/contacts.ts`,
`lib/filterContacts.ts`, `types.ts`, `index.css`. Le reste est du test
(`*.test.tsx`, `test/setup.ts`) et de la configuration.

## Ce que cette mesure ne prouve PAS

**Elle n'a qu'un bras.** Je n'ai pas pu rejouer les mêmes demandes sur l'image
d'AVANT le correctif : elle n'est plus déployée, et la redéployer aurait dérangé
le banc. Ce qui est établi, c'est que **le comportement est correct aujourd'hui**
— pas que le correctif en soit la cause. Le bras « avant » existe, mais il est
historique : c'est la capture d'Avi, où le point d'entrée restait intact à
l'octet près.

Deux essais indépendants, deux langages, neuf et quatorze fichiers, zéro
orphelin : c'est un résultat, pas une coïncidence. Ce n'est pas une preuve
causale.

## Incident rencontré, sans rapport avec le correctif

La première création de projet a rendu **500** : `mkdir '/data/vibecore/projects/_locks'`,
**errno -116 (poignée NFS périmée)** sur **une seule** des deux répliques de l'API.
L'autre écrivait normalement. Une requête sur deux échouait donc, avec un message
générique. Le pod a été recréé ; les deux répliques sont saines. À signaler : une
poignée périmée sur une réplique ne se voit ni dans `readyReplicas`, ni dans les
redémarrages, ni dans les sondes — seulement dans une écriture réelle.
