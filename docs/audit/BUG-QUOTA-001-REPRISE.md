# BUG-QUOTA-001 — note de reprise (16/08, session QA)

**État : NON IMPLÉMENTÉ.** Diagnostic complet et conception arrêtée ; le code reste
à écrire. Cette note existe pour qu'une reprise soit immédiate et sans re-diagnostic.

## Le défaut

`services/api/src/app.ts`, route `GET /api/runtime/workspaces/:workspaceId/terminal` :

- à la connexion, si `request.query.managed !== '1'` :
  `withSerializedMutation('terminals:<organizationId>')` → `ensureQuota(…, 'terminals.concurrent')`
  puis `recordUsage(…, 'terminals.concurrent', +1, { workspaceId })` ;
- à la fermeture du socket : `recordUsage(…, -1, { workspaceId })`, garde `released`
  pour ne décrémenter qu'une fois.

Le compteur porte donc sur la **connexion**, jamais sur la **session**. Depuis que le
rattachement fonctionne (BUG-TERM-002 corrigé : `sessionId` stable), un reconnect du
même panneau ouvre un nouveau socket et **redemande un créneau** alors qu'aucun
terminal supplémentaire n'existe côté agent. Sur un plan à limite 1, le `+1` du
nouveau socket se heurte à celui de l'ancien → **429**.

Mesuré en réel : **26× 429** sur le seul `sessionId=terminal-user-0`, jauge à **1**
pour 29 `UsageEvent` correctement appariés (+1/−1). **Ce n'est pas une fuite de
compteur** — la jauge est honnête, elle refuse la reconnexion d'une session déjà
comptée. Le shell `managed` y échappe (exempté), d'où le fait qu'il soit le seul
panneau utilisable.

## Conception retenue

1. Inclure `sessionId` dans les métadonnées de `recordUsage` (aujourd'hui `{ workspaceId }`).
2. Avant le `+1`, **dans la sérialisation existante** `withSerializedMutation('terminals:<org>')` :
   calculer la somme nette de `quantity` pour `(organizationId, type='terminals.concurrent',
   metadata->>'sessionId' = <sessionId>)`.
   - somme **> 0** → **rattachement** : ni `ensureQuota`, ni `+1`, et **ne pas** poser le
     `-1` au close (sinon la jauge passe négative — c'est le piège principal) ;
   - somme **≤ 0** → nouvelle session : comportement actuel inchangé.

## Exigences fail-closed (non négociables)

- **Jauge jamais négative** : le `-1` au close ne doit être posé que par le socket qui a
  effectivement posé le `+1`. Conserver le drapeau `released`, et ajouter un drapeau
  `countedThisSocket` : seul un socket ayant incrémenté décrémente.
- **Pas de créneau gratuit par rejeu de `sessionId`** : un `sessionId` fourni par le
  client ne doit JAMAIS suffire à sauter `ensureQuota` si aucune entrée nette positive
  n'existe réellement en base. La décision se prend sur l'état persistant, pas sur la
  parole du client.
- **Concurrence** : tout le calcul reste **dans** `withSerializedMutation`, qui sérialise
  déjà par organisation — deux sockets concurrents sur le même `sessionId` ne peuvent pas
  tous deux conclure « rattachement ».
- **Absence de `sessionId`** : retomber sur le comportement actuel (compter), jamais sur
  « ne pas compter ».

## Tests à écrire

1. rattachement (même `sessionId`, entrée nette > 0) → **0 créneau consommé**, `ensureQuota` non appelé ;
2. close d'un socket rattaché → **pas de `-1`**, jauge inchangée (jamais négative) ;
3. rejeu d'un `sessionId` sans entrée nette positive → **compté normalement**, `ensureQuota` appliqué ;
4. deux sockets concurrents sur le même `sessionId` → un seul compte, l'autre rattache, jauge finale = 1 ;
5. deux terminaux **réellement distincts** → **2 créneaux**, limite respectée ;
6. `sessionId` absent → comportement actuel préservé.

## Après implémentation

- rebuild image **api** via `infra/cloudbuild/single-service.yaml`
  (`_SERVICE=api,_PACKAGE_FILTER=@vibecore/api,_START_CMD="tsx dist/server.js"`,
  `_PROJECT`/`_REPO` de l'env d'audit) — ce build n'a **pas** d'étape de signature, il
  sort `SUCCESS` franc ;
- déployer **cluster d'audit uniquement** (`kubectl set image`, garde anti-prod) ;
- preuve à l'écran : `echo hi` + Entrée exécuté, puis rechargement de page → rattachement
  **sans 429**.

## Contexte d'environnement au moment de la note

- Env d'audit : `web:2565e5edc3` (2/2), `api:59818de207` (2/2). Rollbacks : `web:9e8efa4f86`,
  `api:1c68880b39`. **Prod jamais touchée** (`api:06e50afff8`, image distincte).
- Jauge `terminals.concurrent` remise à 0 en base sur l'env de test (`delete from
  "UsageEvent" where type='terminals.concurrent'`) pour dégager le créneau bloqué.
- ⚠️ **NE PAS MERGER EN PROD** : lot facturation, revue expert requise avant tout merge.

## Hypothèse encore ouverte (point 1 de la consigne)

Entrée et sortie porteraient sur **deux sessions différentes** : le panneau rendrait la
sortie du shell `managed` (exempté) tout en écrivant dans `user-0` (rejeté en 429).
**Non prouvée.** Le chemin le plus court pour la trancher est ce correctif : si le
terminal fonctionne une fois le quota corrigé, le découplage est démontré par
construction ; sinon, instrumenter côté client quel `sessionId` reçoit le `write`.
