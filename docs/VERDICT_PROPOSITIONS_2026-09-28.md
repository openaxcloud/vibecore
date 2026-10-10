# Verdict sur les propositions ouvertes — 2026-09-28

Trente propositions ouvertes. Chacune reçoit ici un verdict : **fusionner**,
**fermer avec explication**, **rebaser d'abord**, ou **rendre à sa session**.

## L'environnement de la mesure (règle 11)

`origin/main` = `5df18ae30` au moment de l'écriture, prod servie en
`d4a6f1df28`. Données relevées par `gh pr list --state all --limit 700`
(587 propositions) et par `git diff origin/main...origin/<tête>` pour chacune
des trente.

## Ce qui ne mesure rien, et qu'on prend pour un verdict

**Dix des trente sont en conflit (`DIRTY`).** Une proposition en conflit
**n'exécute aucun workflow `pull_request`** — GitHub ne peut pas calculer son
commit de fusion. Elle affiche donc « 0 rouge », exactement comme une
proposition verte. Le contrôle qui tranche est le **nombre de contrôles
attachés** :

| Proposition | Contrôles attachés | Ce que ça veut dire |
|---|---|---|
| #424 | **1** | rien n'est mesuré |
| #423 | **1** | rien n'est mesuré |
| #337 | **2** | rien n'est mesuré |
| #589 | 25 | mesurée |

Moins de trois contrôles attachés, c'est qu'on ne mesure rien. Aucune des dix en
conflit ne peut recevoir un verdict technique avant d'être rebasée.

**Aucune des trente n'est vide.** J'ai comparé chaque tête à `main` : toutes
apportent du contenu absent de `main`. Il n'y a donc pas une seule proposition à
fermer au motif que son travail serait déjà arrivé.

## Le balayage de la règle 28

`scripts/propositions-empilees.mjs` passé sur les 587 propositions, avec le
contrôle positif exigé — le cas connu #326 doit ressortir, et il ressort.

**Deux fermetures suspectes que personne n'avait relevées :**

```
#485 fermée   2 s après la fusion de #484
#402 fermée   3 s après la fusion de #400
#326 fermée   2 s après la fusion de #321   (le cas connu, contrôle positif)
```

Les deux nouvelles portaient de la sécurité — `no-store` sur 174 routes `/api/*`
pour #485, le scopage du jeton de stockage (AUDX-022) pour #402. **Les deux ont
été récupérées**, et je l'ai vérifié par le contenu, pas par l'état de la
proposition :

* #485 → sa branche `fix/no-store-api` a été reprise par **#487, fusionnée** ;
  la branche est supprimée depuis.
* #402 → sa branche `sec/audx-022-storage-token-scopes` a été reprise par
  **#419, fusionnée**. `packages/sdk/src/token.ts` et
  `packages/sdk/src/token-scopes.spec.ts` sont **octet pour octet identiques**
  entre la branche et `main` (4497 et 3131 octets).

**Un état terminal, en revanche : #414.** Elle est empilée sur
`fix/audx-021-upload-limits`, cette branche existe toujours, et **aucune
proposition ouverte ne la porte vers `main`**. C'est exactement la configuration
qui a coûté quinze jours sur #326. Elle doit changer de base pour `main`.

## Les verdicts

### À fusionner

| # | Verdict | État |
|---|---|---|
| #588 | **FUSIONNÉE** aujourd'hui | trois contrôles requis verts, seul `Deploy Preview` rouge — et il l'est sur toutes les propositions |
| #589 | fusionner au vert | contrôles en cours |
| #574 | fusionner au vert | `Playwright local stack` était **annulé** — relancé aujourd'hui |
| #567 | fusionner au vert | deux contrôles requis **annulés** — relancés aujourd'hui |

⚠️ `Deploy Preview` est rouge sur **toutes** les propositions vérifiées (#587,
#588, #589) : c'est un défaut d'infrastructure préexistant, pas un signal sur le
contenu. Il n'est pas dans les trois contextes requis.

### À fermer avec explication

| # | Motif |
|---|---|
| #337 | **doublon de #555**, qui le dit dans son propre titre (« reprise de #337 »). #337 pèse 37 fichiers et 3 224 lignes contre 3 fichiers et 191 lignes pour #555 : la reprise est la version mince du même correctif. Fermer #337, garder #555. |

### À rebaser avant tout verdict — les miennes

#52, #352, #362, #366, #379, #423, #424. Sept propositions en conflit, donc sans
aucune mesure. #52 date du 23 juillet et pèse 50 424 lignes ; #352 porte
29 commits pour 4 fichiers. Elles ne seront jugeables qu'une fois à jour.

### À rendre à leur session

#142, #283, #324, #340, #370, #376, #394, #409, #414, #434, #448, #512, #556,
#559, #560. Quinze propositions d'une autre session : je ne rebase ni ne réécris
la branche d'une autre session. Deux points à leur signaler nommément :

* **#414** — l'empilement sans porteur décrit plus haut ;
* **#560** — en conflit, donc zéro workflow : son « 0 rouge » ne dit rien.

### Impossible sans Avi

**#125**, ouverte le 8 août, 55 commits, 135 fichiers, 10 300 lignes, en conflit.
C'est la seule proposition dont Avi est l'auteur des commits. Personne d'autre ne
peut décider ce qu'on en garde.

## Le compte

| Catégorie | Nombre |
|---|---|
| à nous (identité de commit « Claude (userarea audit) ») | 13 |
| à l'autre agent (`openaxcloud`, plus une signée « Claude ») | 16 |
| à Avi | 1 |
| **litigieuse au sens strict** | **1** (#337 / #555) |
