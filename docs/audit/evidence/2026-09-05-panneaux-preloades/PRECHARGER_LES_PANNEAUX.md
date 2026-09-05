# Précharger les panneaux actifs avec le document — le retard infligé est nul

## Le constat

`initialIdePanels` ne porte **qu'un panneau sur douze**. Le commit fondateur
s'appelle littéralement `7ab95a918 « Preload Git panel state in IDE »` : un
panneau, visé nommément, jamais généralisé — vérifié sur toute l'histoire du
champ, il n'en a jamais porté davantage.

Et `git` y est pour une raison qui n'a rien d'une conception : le loader appelle
déjà `/projects/<id>/dashboard` pour obtenir `workspace` et `recentActivity`, et
cette réponse **contient aussi `git`**. Le mettre dans `initialIdePanels` ne
coûtait aucun appel supplémentaire. C'était un sous-produit gratuit.

**Sur un chargement à froid, deux panneaux seulement sont demandés** :
`snapshots` et `settings`. Pas douze. C'est ce qui rend la généralisation
raisonnable — embarquer les douze gonflerait le document pour rien.

## La contrepartie que personne ne mesure : le retard du document

Le loader fait un appel puis **quatre en parallèle** dans un `Promise.all`. Le
coût d'un bloc parallèle est le **maximum**, pas la somme. Toute la question est
donc : les deux panneaux sont-ils plus lents que le plus lent des quatre ?

Mesuré sur connexion **réutilisée** (pas de poignée de main), deux séries. La
référence d'aller-retour vaut ~80–95 ms : c'est le plancher réseau, à retrancher
pour obtenir le traitement serveur.

| appel amont | TTFB mesuré | traitement estimé |
|---|---:|---:|
| `collaborators` | 94 / 105 ms | ~0–10 ms |
| **`dashboard`** | **402 / 442 ms** | **~310–350 ms** |
| `orgs` | 98 / 88 ms | ~0–10 ms |
| `workspaces` | 105 / 107 ms | ~10–15 ms |
| — *candidat* `ide-panel/snapshots` | 148 / 155 ms | **~68–75 ms** |
| — *candidat* `ide-panel/settings` | 205 / 207 ms | **~125 ms** |

**`dashboard` est déjà 2,5 fois plus lent que le plus lourd des deux candidats.**
Ajoutés au même `Promise.all`, `snapshots` et `settings` terminent largement
avant lui.

> **Retard infligé au document : ~0 ms.** Ils disparaissent entièrement derrière
> un appel que le loader fait déjà. La marge est de plus de 185 ms.

## Ce que ça fait gagner

Deux allers-retours depuis le navigateur, à **~800 ms chacun en production**
(TTFB médian mesuré du statique ; les appels de données y sont du même ordre).

Et surtout : ces deux appels **quittent le chemin critique**. Ils ne partent
aujourd'hui qu'après le chargement ET l'exécution du JavaScript, c'est-à-dire
plusieurs secondes après le début.

## Le vrai coût, et il n'est pas en temps

Il faut le nommer, parce qu'il existe :

1. **Le poids du document.** `settings` rend 5 250 octets, `snapshots` 436 —
   soit **~5,7 Kio bruts** ajoutés au HTML, qui est en `no-store` et donc jamais
   mis en cache. Compressés, de l'ordre de 1,5 Kio. À comparer aux 1 235 Kio de
   JS de la page : environ 0,1 %.
2. **La charge serveur.** Deux appels amont de plus **par rendu de document**,
   payés par tous les visiteurs, y compris ceux qui reviennent. C'est un coût de
   capacité, pas de latence. Il se chiffre à ~70 ms et ~125 ms de traitement,
   sur des appels qui se font de toute façon aujourd'hui — mais depuis le
   navigateur, et **trois fois chacun** (voir plus bas).

## Ce que la mesure a aussi montré, et qui reste ouvert

Sur le SHA `e77b61af5b` (postérieur au correctif de mutualisation), trois
échantillons :

| ressource | GET par chargement |
|---|---:|
| `ide-state` | **1** |
| `ide-panel/snapshots` | **3** |
| `ide-panel/settings` | **3** |
| `ai/conversations/<id>/messages` | **6** |

`ide-state` est réglé — la mise en commun fonctionne. **La triple salve sur les
panneaux persiste**, et elle n'est pas couverte par le même mécanisme. Précharger
les panneaux ne la supprimerait pas : elle a sa propre cause, non établie.

## Limites de cette mesure

- Prise depuis l'extérieur du cluster. Le loader, lui, s'exécute **dans** le
  cluster, où le plancher réseau est bien plus bas — cela ne change pas l'ordre
  relatif des appels, et renforce la conclusion plutôt qu'elle ne l'affaiblit.
- Environnement d'audit, pas production. Les rapports de latence entre appels
  amont sont ce qui compte ici, pas leurs valeurs absolues.
- Les ~800 ms par aller-retour évité sont la médiane mesurée en production sur
  le statique ; c'est un ordre de grandeur, pas une mesure des appels de données
  d'Avi.
