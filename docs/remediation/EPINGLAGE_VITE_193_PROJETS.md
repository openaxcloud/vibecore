# Remédiation de l'épinglage de port — 193 projets

**Préparée le 2026-09-06. NON EXÉCUTÉE.** Elle écrit dans les projets
d'utilisateurs : elle attend une décision d'Avi, pas une décision d'ingénierie.

## Le défaut

L'agent réécrit `vite.config.ts` de zéro et supprime l'épinglage que la
plateforme y avait posé :

```ts
const __ecodeHmrOverride = { server: { host: true,
  port: 5173, strictPort: true, hmr: { … } } };
```

Sans `port: 5173` ni `strictPort`, Vite prend le premier port libre — alors que
le proxy d'aperçu vise 5173 **en dur**. Le serveur tourne et reste injoignable :
c'est la ligne `preview.proxy.unreachable, port 5173, fetch failed`.

## L'ampleur, mesurée en production

| | |
|---|---|
| projets ayant un `vite.config.ts` | **289** |
| épinglage **intact** | 96 |
| épinglage **perdu** | **193** (67 %) |
| dont touchés dans les 30 derniers jours | **42** |
| dont touchés dans les 7 derniers jours | **1** |
| dont dormants depuis plus de 90 jours | 25 |
| dont ayant encore un espace de travail | 154 |

Témoin de la mesure : la même requête voit des configs à 1 852 octets — la
valeur de référence de la plateforme — et une à 11 791.

## Pourquoi la réparation automatique ne suffit pas

`ensureViteHmrConfig` existe, est idempotente, et fait exactement ce qu'il faut.
Elle n'est appelée que depuis `#syncPreviewManifestFromRuntime`, qui n'a que
**deux déclencheurs** : le démarrage de l'aperçu, et la fermeture d'un artefact.

**La protection est donc conditionnée par la chose même que sa perte empêche** :
l'aperçu ne peut pas démarrer sans épinglage, donc la réparation attachée au
démarrage n'arrive jamais. C'est ce cercle qui explique les 67 %.

Même décrochée du démarrage, elle ne rattrapera que les projets **rouverts**.
Avec **1 projet touché en 7 jours**, cette population est marginale : les 151
projets non touchés depuis 30 jours ne se répareront pas d'eux-mêmes.

⚠️ **Une inconnue reste ouverte** et elle change le plan. La session QA n'a pas
encore départagé ses deux candidats — « l'artefact ne se ferme jamais » contre
« la réparation calcule un no-op ». Si c'est le premier, décrocher du démarrage
ne suffira pas non plus. **Ne pas exécuter cette remédiation avant sa mesure.**

## Ce que la remédiation écrirait, exactement

Pour chaque projet éligible, dans `ProjectIdeState.files.entries`, l'entrée
`vite.config.ts` seule :

1. le contenu utilisateur est **conservé intégralement** ;
2. le bloc de plateforme est **réappliqué en fin de fichier**, à l'identique de
   ce que produit `ensureViteHmrConfig` — même marqueur, même forme ;
3. rien d'autre n'est touché : ni les autres fichiers, ni `chat`, ni `ui`, ni
   aucune autre clé de l'état.

C'est une **fusion**, pas un remplacement : un utilisateur peut légitimement
avoir changé sa configuration, et ce qu'il a écrit doit survivre.

## Comment on vérifie qu'un projet en a besoin, AVANT d'y toucher

Trois conditions cumulatives, évaluées par projet :

1. `files.entries` contient bien une entrée `vite.config.ts` ;
2. son contenu **ne contient pas** `strictPort` — c'est le marqueur d'épinglage ;
3. son contenu **ne contient pas déjà** le marqueur de plateforme.

Un projet qui échoue une seule de ces conditions est **sauté sans écriture**, et
le saut est journalisé avec sa raison. Le compte des sautés doit être publié
avec celui des réparés : un total qui ne se recompose pas signale une erreur de
sélection, pas un succès.

## Comment on prouve, après coup, que rien d'autre n'a bougé

Pour chaque projet touché, avant et après :

* **empreinte de l'état entier** — `shasum` du JSON de `state`, hors l'entrée
  `vite.config.ts`. Elle doit être **identique**. Une seule divergence arrête
  la campagne.
* **nombre d'entrées de fichiers** — identique avant et après.
* **version de `ProjectIdeState`** — incrémentée d'exactement 1.
* **diff du seul fichier touché**, conservé en pièce jointe de la campagne.

Et un **témoin négatif obligatoire** : faire passer la remédiation sur trois
projets dont l'épinglage est **intact**, et vérifier qu'elle n'écrit rien. Si
elle écrit, la sélection est fausse et la campagne ne part pas.

## Ordre d'exécution proposé, si Avi l'autorise

1. **Un projet**, choisi parmi les dormants, avec les quatre preuves ci-dessus
   publiées avant de continuer.
2. **Dix projets**, mêmes preuves, en vérifiant qu'aucun aperçu ne régresse.
3. **Le reste**, par lots de cinquante, avec arrêt automatique à la première
   divergence d'empreinte.

Point de retour : l'ancien contenu de chaque `vite.config.ts` est conservé avant
écriture, ce qui permet de rétablir projet par projet.
