# BUG-RUNTIME-DIVERGENCE — options de correctif (décision Avi)

« Quand j'ouvre un projet, n'importe quel IDE, ça recharge et reconstruit le
projet au lieu de voir directement l'app dans preview comme on l'a laissée. »

## Ce qui est établi (mesuré, plus supposé)

`shouldReattachWarmWorkspace` adopte le pod chaud seulement si
`reused && seededThisSession && hasLivePort`, et si `storageNewerThanSeed !== true`.

Signaux capturés **à l'instant exact de la décision**, par instrumentation
déployée dans l'isolement QA, sur une réouverture de projet dont le pod est
chaud et dont `npm run dev` tourne, port 5173 ouvert :

```
{ reused: true, seededThisSession: false, hasLivePort: false,
  currentRevision: "9"  (valait "5" à l'ouverture précédente),
  previewsCount: 0, previewsRaw: [] }
```

Issue observée dans le pod : `canary.txt` supprimé, `vite` PID 79 → 135,
`mtime src/App.tsx` réécrit. Donc **wipe + reseed complet**.

**Une seule des conditions était bonne.** Trois causes indépendantes :

| # | Signal | Pourquoi il est faux | Portée |
|---|---|---|---|
| 1 | `seededThisSession` | `seededWorkspaceSessions` est une Map de portée module, vide à **chaque** chargement de page — donc toujours fausse sur une réouverture | client |
| 2 | `hasLivePort` | `workbenchStore.previews` est **vide** à la décision alors que l'API répond `port 5173, ready:true` au même instant. `refreshRuntimePorts()` est attendu juste avant mais son échec est avalé (`.catch(() => undefined)`) : « échec » et « rien à signaler » sont indiscernables. `hasLivePreviewPort` exige par ailleurs `ready === true` strictement, là où le code voisin accepte `ready !== false` | client |
| 3 | `storageNewerThanSeed` | la révision lue est `ideState.version`, incrémentée par les écritures d'**UI** (onglets, curseur) : elle est passée de 5 à 9 en une seule session. Même avec un marqueur parfait, elle forcerait le reseed à presque chaque réouverture | client + API |

**Corollaire** : traiter la cause 1 seule ne peut rien changer — c'est ce qui a
été constaté avec `fix/runtime-divergence-seed-marker`, qui reste donc à ne pas
merger en l'état.

---

## Option A — Réparer les trois signaux, garder le reseed comme défaut

Marqueur de seed **durable** par workspace ; signal de port **fiable** (ne plus
avaler l'échec de `refreshRuntimePorts`, distinguer « aucun port » de « sonde en
échec », aligner la sémantique de `ready`) ; révision dérivée des **fichiers**
et non de l'ide-state (`sha256` trié de `path:updatedAt:sizeBytes`, exposé par
un `GET /projects/:id/files/revision` bon marché).

- **Pour** : conserve exactement la logique de sûreté actuelle — sur signal inconnu, on reseede. Le changement ne fait que **supprimer des reseeds injustifiés**.
- **Contre** : trois modifications, dont une nouvelle route API. Le risque résiduel reste réel : si les trois signaux mentent **ensemble**, on adopte un pod périmé et l'utilisateur voit du vieux contenu sans le savoir.
- **Coût** : moyen. **Réversibilité** : bonne (chaque signal est indépendant).

## Option B — Ne plus jamais wiper : réconciliation par contenu

À l'ouverture, ne pas choisir entre « adopter » et « tout effacer ». Comparer
storage et pod fichier par fichier et n'écrire que les différences, en refusant
d'écraser un fichier du pod plus récent que sa version en storage.

- **Pour** : rend le signal de fraîcheur **inutile** — les trois causes ci-dessus cessent de compter. C'est la seule option qui supprime structurellement le risque de perte d'édition runtime.
- **Contre** : la plus invasive. Exige un manifeste bon marché des deux côtés, une politique de conflit explicite (que faire quand les deux ont changé), et une bonne couverture de tests avant tout déploiement. Coût par ouverture plus élevé qu'un simple reattach.
- **Coût** : élevé. **Réversibilité** : moyenne.

## Option C — Adopter par défaut, détecter et proposer

À l'ouverture, adopter le pod chaud tel quel. Si une divergence est détectée,
afficher un bandeau non bloquant : « le contenu de l'espace d'exécution diffère
du stockage » avec **Recharger depuis le stockage · Garder l'espace de travail ·
Voir le diff ».

- **Pour** : la réouverture devient instantanée dans le cas normal — c'est exactement la demande d'Avi. Zéro perte de données automatique, puisque aucune destruction n'a lieu sans geste explicite.
- **Contre** : déplace la charge sur l'utilisateur. Un pod réellement périmé sert du contenu ancien jusqu'à ce qu'il agisse ; il faut donc que la détection soit fiable, sinon le bandeau devient du bruit qu'on apprend à ignorer.
- **Coût** : moyen (surtout de l'UI). **Réversibilité** : bonne.

---

## Ce que je recommande

**A puis C.** A supprime les reseeds injustifiés sans toucher au filet de
sécurité, et se vérifie signal par signal ; C ajoute ensuite la porte de sortie
explicite pour les cas où la détection reste incertaine. B est la bonne cible à
terme, mais c'est un chantier à part entière et il ne devrait pas bloquer la
correction du symptôme d'Avi.

Dans tous les cas la validation doit se faire dans un isolement dédié, avec les
témoins déjà utilisés ici (canary dans le pod, PID du dev server, `mtime` d'un
fichier source) : ce sont eux qui rendent le rouge→vert incontestable.

---

## Option D — Unifier l'identité du workspace (ajoutée après la piste Rollback)

Défaut **distinct** mais recouvrant, confirmé empiriquement : voir
**BUG-WS-ID-SPLIT** dans `BUG_INVENTORY_LIVE.md`. Trois des quatre chemins de
création laissent Prisma poser un `cuid()`, pendant que huit sites — dont le
build statique, le flux de build de déploiement, les outils de l'agent, le
restore de snapshot et `authorizeRuntimeWorkspace` lui-même — **dérivent**
`ws-sha256(projectId:userId)[:16]`. Un projet dont le workspace actif vient de
l'API publique, du planificateur ou du publish voit donc le build cibler un
workspace **différent**, provisionné vide.

Deux façons de refermer l'écart :

- **D1 — résoudre au lieu de dériver.** Les huit sites lisent le workspace actif
  du projet (`authorizeRuntimeWorkspace` avec un vrai `workspaceId`, et rejet
  explicite en cas de non-appartenance) au lieu de recalculer un id.
  *Pour* : supprime la classe entière, y compris BUG-IDE-001.
  *Contre* : huit points d'appel, chacun avec son contexte d'autorisation ; il
  faut décider ce que devient un projet à **plusieurs** workspaces (lequel est
  « actif » ?). *Coût* : moyen-élevé. *Réversibilité* : bonne, site par site.
- **D2 — poser l'id dérivé partout à la création.** Les trois chemins qui
  omettent l'id posent `runtimeWorkspaceId(projectId, userId)`.
  *Pour* : correctif d'une ligne par site, l'écart disparaît mécaniquement.
  *Contre* : ne marche que si un projet n'a **qu'un** workspace par utilisateur —
  or l'id dérivé ne dépend que de `(projectId, userId)`, donc deux workspaces du
  même utilisateur sur le même projet **entreraient en collision**. À écarter si
  le multi-workspace est un cas réel. *Coût* : faible. *Risque* : élevé.

**Ce que cela change pour l'arbitrage.** D est **orthogonal** à A/B/C : il ne
corrige pas le reseed au reopen (ma reproduction n'avait aucune divergence d'id
et reseedait quand même), et A/B/C ne corrigent pas le build qui vise un pod
vide. Les deux chantiers sont nécessaires. Si l'un doit passer d'abord, **D1**
a le meilleur ratio : il ferme aussi BUG-IDE-001 et le symptôme « le build ne
voit pas mes fichiers », qui est plus destructeur pour l'utilisateur qu'un
rebuild lent.
