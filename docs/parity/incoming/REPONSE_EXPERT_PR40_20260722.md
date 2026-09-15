# REÇU DE REVUE — DOSSIER EXPERT FINAL / PR #40

**Reviewer :** `OpenAI-Codex`  
**Date de revue :** 2026-07-22  
**Dossier soumis :** `DOSSIER_EXPERT_FINAL_20260721 2.md`  
**PR documentaire examinée :** `openaxcloud/vibecore#40`  
**Tête examinée de la PR #40 :** `60a987caabc91bef59a1e41ad1f1ad70f3747de5`

Branches complémentaires examinées :

- PR #38, WIF : `b291841b2c6681bb365e8077cf059b5cbb9021d9`
- PR #39, facturation fix-forward : `96f53af716e4291841ac45059258962867744c85`
- PR #36, opérations/DR : tête `100d28f155282f6276f5eebcded2331d80a43261`

## VERDICT GLOBAL

**Pas de feu vert global à la PR #40 en l’état.**

Résultat de la présente soumission :

| Lot | Signés / acceptés | Refusés |
|---|---:|---:|
| 0 — corrections factuelles | 4 vérifiées | 0 |
| A — 5 corrections v4 | 1 | 4 |
| B — 6 P0 re-corrigés | 4 | 2 |
| D1 — WIF, P0-A2-09 | 0 | 1 |
| D2 — CTR-OPERATIONS-DR | 0 | 1 contrat |
| E — facturation PR #39 | 0 | 2 lots code |

### P0 nouvellement signés

- `P0-V3-02`
- `P0-A2-02`
- `P0-A2-11`
- `P0-LS-05`
- `P0-LS-17`

### P0 refusés

- `P0-V4-1`
- `P0-V4-2`
- `P0-LS-13`
- `P0-LS-16`
- `P0-LS-18`
- `P0-V3-14`
- `P0-A2-09`

### Contrat refusé

- `CTR-OPERATIONS-DR`

### Lots code refusés

- PR #39 — correctif Import/billing
- PR #39 — correctif grand livre

`P0-LS-14` reste signé antérieurement ; il n’était pas à re-signer dans ce
dossier.

---

# 0. CORRECTIONS FACTUELLES

## 0.1 État des merges — VÉRIFIÉ

État GitHub constaté :

- PR #27 : **MERGED**
- PR #28 : **MERGED**
- PR #29 : **MERGED**
- PR #30 : **MERGED**

La correction du dossier final est donc exacte sur l’état courant.

## 0.2 Total de 65 P0 — VÉRIFIÉ

La décomposition enregistrée est cohérente :

- 19 `CLOSED`
- 11 `PROVEN_REVIEW_PENDING`
- 30 `OPEN`
- 5 `PROVEN`

Total : **65**.

## 0.3 Champs des cinq points v4 — VÉRIFIÉ

Les blocs `P0-V4-1`, `P0-V4-2`, `P0-V3-02`, `P0-LS-13` et `P0-LS-16`
ont bien été resynchronisés avec le reçu précédent et la nouvelle remédiation.

Cette synchronisation documentaire ne vaut pas acceptation de leur nouvelle
preuve ; les décisions individuelles sont données ci-dessous.

## 0.4 Ancres #27/#28 — VÉRIFIÉ

Les textes ont été corrigés pour ne plus présenter les PR #27 et #28 comme
non mergées.

---

# A. CINQ CORRECTIONS V4

## `P0-V4-1` — REFUSÉ

**Réserve : le titre demande toujours le canal de lancement, que la preuve
déclare elle-même absent.**

Le paquet v4 améliore réellement la preuve :

- un DOM Gallery complet est présent ;
- le compteur `82 Results` est visible ;
- les routes produit sont présentes ;
- une trace de requêtes `_next/data` est jointe.

Mais le titre reste :

> Collecteur aveugle : ajouter routes produit (rendu JS) + canal de lancement

Le README et le champ `proof` reconnaissent que le canal de lancement
n’apparaît pas dans le rendu public anonyme. La preuve ne soutient donc qu’une
partie du titre.

**Correction minimale :**

- soit fournir la preuve du canal de lancement ;
- soit scinder le point en deux et ne soumettre à signature que la partie
  « routes produit rendues JS ».

## `P0-V4-2` — REFUSÉ

**Réserve : désaccord entre « 43 cartes » et l’artefact qui mesure 43 ancres.**

Les acquis sont réels :

- archive DOM complète annoncée à 1 500 639 octets ;
- `82 Results` est bien présent dans le rendu ;
- les valeurs de vues et d’usage sont visibles ;
- la date, l’URL et le hash sont consignés.

Cependant, le champ `proof` parle de **43 cartes**, alors que
`replit-gallery-dom.metadata.json` expose :

```text
galleryCardAnchorsInDom: 43
```

et précise « 43 ancres `/gallery/` ». Le rendu textuel directement inspectable
montre 20 cartes chargées, puis `Load all apps`. Une ancre n’est pas
nécessairement une carte distincte.

**Correction minimale :**

remplacer partout « 43 cartes » par la mesure réellement prouvée
« 43 ancres `/gallery/` dans le DOM », ou joindre un décompte de cartes
distinctes fondé sur un sélecteur documenté et reproductible.

## `P0-V3-02` — SIGNÉ

La requalification est désormais cohérente de bout en bout :

- le titre est borné à `NOT_OBSERVED_IN_PUBLIC_RENDER` ;
- la condition de clôture porte la même qualification ;
- le DOM public complet montre le lien générique `Report abuse` dans le footer ;
- aucune affordance de report propre à une application n’est visible dans le
  rendu public inspecté ;
- le flux authentifié reste correctement `UNKNOWN`.

**Portée de la signature :**

la signature valide uniquement la constatation
`NOT_OBSERVED_IN_PUBLIC_RENDER`. Elle ne prouve pas que le report par
application n’existe dans aucun parcours authentifié.

## `P0-LS-13` — REFUSÉ

**Réserve : le DOM Pricing est primaire, mais la liaison « même session +
mêmes cookies » reste déclarative.**

Points désormais correctement prouvés :

- le DOM Pricing complet existe ;
- les prix `$25/$20` et `$100/$95` sont présents dans le markup ;
- l’horodatage et la locale sont consignés ;
- la géolocalisation n’est plus revendiquée comme liée à la session.

Point encore insuffisant :

`network-trace-session.txt` est un fichier texte qui affirme que les pages
Gallery et Pricing viennent de la même session et des mêmes cookies. Il ne
contient ni HAR, ni en-têtes `Cookie`, ni identifiant de contexte navigateur,
ni export DevTools signé, ni trace Playwright permettant de relier
mécaniquement les deux DOM et les cookies au même run.

Les métadonnées de chaque DOM répètent les mêmes noms de cookies, mais ce sont
deux déclarations séparées ; elles ne constituent pas la preuve de liaison
annoncée.

**Correction minimale :**

joindre un HAR ou une trace Playwright/Chrome DevTools exportée contenant :

- les deux navigations dans un même contexte ;
- l’identifiant de contexte ou de session ;
- les cookies présents au moment de chaque capture ;
- les hashes des deux DOM produits par ce même run.

## `P0-LS-16` — REFUSÉ

**Réserve : attestation encore substituable et preuve post-merge absente.**

Les corrections suivantes sont bien présentes :

- `actions: read` a été ajouté ;
- le chemin et le nom du workflow sont vérifiés ;
- l’événement `push` est vérifié ;
- un test de substitution a été ajouté ;
- le job `Quality Gates` de la tête examinée est vert.

Deux blocages restent ouverts.

### 1. Branche du run non vérifiée

`verify-attestation-run.mjs` ne vérifie pas :

```text
run.head_branch == "main"
```

Un run réussi du même workflow, au même SHA et avec l’événement `push`, mais
lancé depuis une autre branche, peut encore être accepté comme attestation de
`main`.

### 2. Test négatif non déterministe

`verify-attestation-substitution-test.mjs` cherche un workflow étranger parmi
les 50 derniers runs réussis. Quand aucun run étranger n’est présent dans cette
fenêtre, le test peut échouer sans qu’une régression du vérificateur existe.
La preuve dépend donc de l’historique du dépôt et n’est pas déterministe.

### 3. Condition post-merge non encore satisfaite

Le registre exige encore un run post-merge vert du mécanisme durci. Le dossier
dit lui-même que cette preuve sera produite au premier merge de la branche.
Une preuve future n’est pas une preuve présente.

**Correction minimale :**

- vérifier explicitement `head_branch === "main"` ;
- utiliser une réponse API mockée/figée pour le test négatif, ou paginer de
  façon sûre sans rendre l’absence de candidat étrangère bloquante ;
- fournir un vrai roll post-merge produit par cette version durcie.

---

# B. SIX P0 RE-CORRIGÉS

## `P0-A2-02` — SIGNÉ

`SERVICE_REGISTRY.yaml` porte désormais un ensemble structuré `S01–S56`, avec
identifiant, titre et responsabilité. Le validateur de la PR vérifie
l’égalité exacte de cet univers, et le job officiel `Validate registries`
est vert à la tête examinée.

Cette signature valide l’existence et le verrouillage de l’univers
documentaire des 56 services ; elle ne valide pas leur implémentation.

## `P0-A2-11` — SIGNÉ

Le compteur courant a été régénéré à **122 work items** et le proof ne conserve
plus la valeur périmée 99. Les compteurs sont présentés comme dérivés des
registres actuels et la validation officielle passe.

## `P0-LS-05` — SIGNÉ

Les quatre registres spécialisés existent et correspondent au titre :

- `ArtifactKind` : 7
- `GeneratedAssetKind` : 8
- `ComponentKind` : 7
- `DeploymentType` : 4

Les contenus observés correspondent aux catégories annoncées, et le validateur
les verrouille séparément.

Cette signature porte sur la taxonomie documentaire, pas sur la disponibilité
des types de déploiement.

## `P0-LS-17` — SIGNÉ

Les compteurs sont désormais distingués correctement :

- 159 candidats IDE ;
- 164 surfaces canoniques ;
- 122 work items ;
- 10 surfaces déclarées.

La correction ne présente plus 159 et 164 comme un seul univers ambigu.

## `P0-LS-18` — REFUSÉ

**Réserve : la génération courante est toujours adossée à un mécanisme
d’attestation non entièrement validé.**

Les défauts de `P0-LS-16` s’appliquent directement :

- absence de vérification `head_branch=main` ;
- test de substitution non déterministe ;
- aucun roll post-merge produit par la version durcie.

L’attestation courante mentionnée dans le dossier est antérieure à la preuve
post-merge exigée pour le mécanisme corrigé. Elle ne peut pas démontrer que la
nouvelle version roule correctement après merge.

## `P0-V3-14` — REFUSÉ

**Réserve : la preuve annoncée inclut encore une authentification
d’attestation insuffisante.**

Le paquet documentaire, le calcul d’approbation et le validateur existent
désormais. Le job `Quality Gates` et le job `Validate registries` sont verts à
la tête examinée.

Cependant, le champ `proof` incorpore explicitement le « contrôle
d’attestation durci », qui conserve les défauts décrits sous `P0-LS-16`.
La chaîne annoncée n’est donc pas entièrement cohérente ni reproductible.

De plus, la chaîne Node complète n’a pas pu être rejouée dans l’environnement
du relecteur faute de checkout complet et de `node_modules`. Les résultats CI
officiels ont été inspectés, mais ils ne réparent pas le défaut logique du
vérificateur.

**Correction minimale :**

corriger l’attestation, obtenir un run post-merge, puis soumettre une chaîne
dont chaque étape annoncée est effectivement rejouable.

---

# D1. WIF — `P0-A2-09` — REFUSÉ

**Réserve : le paquet contient des résultats historiques, mais sa reproduction
annoncée ne reproduit pas les trois chemins.**

Plusieurs défauts concrets sont présents dans la PR #38 :

1. `repro.sh` provisionne le projet, puis remplace les trois chemins par des
   commentaires avant le teardown. Il ne configure ni GKE WIF, ni GitHub OIDC,
   ni Cloud Run.

2. Le workflow GitHub WIF est codé en dur sur le projet et les ressources que
   le paquet déclare déjà `DELETE_REQUESTED`. Il ne peut donc pas reproduire la
   preuve après teardown.

3. Le chemin autorisé fait un `curl` qui ne rend pas le job rouge sur HTTP
   403/404. Le workflow peut donc finir vert alors que la lecture autorisée a
   échoué.

4. Le négatif GKE est une affirmation sur l’absence de grant, sans tentative
   live de token/impersonation et sans réponse de refus archivée.

5. Le Dockerfile Cloud Run fait `COPY main.py .`, alors que le fichier joint
   s’appelle `cloudrun-main.py`. La reconstruction échoue avec le contexte
   commité.

Le point ne satisfait donc pas le critère « présente + reproductible +
cohérente ».

**Correction minimale :**

- rendre `repro.sh` exécutable de bout en bout ;
- provisionner les ressources ou les passer comme paramètres ;
- exiger explicitement HTTP 200 et le contenu attendu ;
- jouer et archiver un vrai négatif GKE ;
- corriger le Dockerfile ;
- rejouer les trois chemins après ces corrections.

---

# D2. `CTR-OPERATIONS-DR` — REFUSÉ

**Réserve : plusieurs drills sont utiles et réels, mais le contrat complet ne
satisfait pas encore le niveau `contractsValidated`.**

Acquis reconnus :

- clone PITR réellement exécuté ;
- failover/failback Cloud SQL réellement joué ;
- fenêtres d’indisponibilité mesurées ;
- 270/270 écritures acquittées retrouvées ;
- exercice de snapshot/restore d’un marqueur ;
- correction live du monitoring ;
- exercice de perte de zone documenté.

Blocages :

1. La réparation du monitoring live n’est pas persistée dans Terraform :
   la source de vérité conserve les valeurs placeholder. Un prochain apply peut
   réintroduire la configuration cassée.

2. Le résultat « disque bit-à-bit » est sur-revendiqué : seule la valeur hashée
   du fichier marqueur est comparée, pas le contenu pertinent du volume.

3. La mesure 13 min 06 s est une durée de restauration/validation du clone, pas
   un RTO applicatif complet avec bascule de configuration, rollout et santé
   utilisateur.

4. Des obligations du contrat restent explicitement `UNTESTED` ou `BLOCKED` :
   SLO web, snapshots planifiés, astreinte outillée, SLI par requête, réplique
   cross-région et autres dépendances opérationnelles.

5. Le premier commit citait un log de chaos pod `90/90` absent de l’arbre
   examiné. Le dossier final ne fournit pas une chaîne de reproduction complète
   pour toutes les assertions de contrat.

Le drill Cloud SQL peut être enregistré comme preuve individuelle validée,
mais il ne suffit pas à signer le contrat DR entier.

---

# E. FACTURATION — PR #39

## Lot Import/billing — REFUSÉ

**Réserves :**

1. Le fichier brut `test-runs.log`, annoncé comme preuve de 96/96 tests, est
   absent du commit : son URL renvoie 404. Le dossier ne contient que le
   README déclaratif.

2. La PR #39 a des checks rouges, dont `Quality Gates` et
   `Validate registries`.

3. Une réservation peut rester sans `importJobId` si le processus tombe ou si
   la création du job échoue entre `reserve()` et `attachJob()`. Les retries
   retrouvent ensuite la même réservation non attachée et peuvent retourner
   `IMPORT_CREATE_IN_PROGRESS` indéfiniment, même après expiration.

4. Le settlement durable intervient après la création et la persistance de la
   cible. Si le settlement échoue, le cleanup ne supprime pas nécessairement le
   projet et ses fichiers. Une cible utilisable et non facturée peut rester.

**Correction minimale :**

- rendre réservation + création/attache atomiques, ou ajouter une récupération
  des réservations orphelines ;
- compenser explicitement la cible lors d’un échec du settlement ;
- joindre les logs bruts ;
- rendre tous les checks verts.

## Lot Grand livre — REFUSÉ

**Réserves :**

1. Le test brut annoncé est absent et les checks de la PR sont rouges.

2. Sous hard limit, deux retries idempotents concurrents peuvent tous deux
   manquer la première lecture. Le second acquiert ensuite le verrou, compte le
   hold du premier comme une nouvelle consommation et peut lever
   `LEDGER_HARD_LIMIT` avant le chemin de rejeu P2002. Un retry idempotent peut
   donc être refusé à tort.

3. La PR n’est pas reproductible au niveau annoncé tant que le correctif n’a pas
   de CI verte et que les tests Postgres bruts ne sont pas joints.

**Correction minimale :**

re-vérifier `(organizationId, idempotencyKey)` immédiatement après
l’acquisition du verrou et avant le calcul du plafond, joindre les logs de tests
Postgres et obtenir une CI entièrement verte.

---

# ÉTAT DES CHECKS OBSERVÉ

## PR #40

- `Quality Gates` : vert à la tête `60a987c`
- `Validate registries` : vert
- `Production E2E / Playwright local stack` : rouge
- PR toujours ouverte

Le rouge Playwright déclaré comme préexistant n’est pas utilisé seul pour
refuser les points documentaires. Les refus sont fondés sur les incohérences
propres aux preuves soumises.

## PR #38

La preuve WIF n’est pas reproductible pour les raisons détaillées ci-dessus.

## PR #39

- `Quality Gates` : rouge
- `Validate registries` : rouge
- preuve brute `test-runs.log` : absente

## PR #36

Les drills apportent des preuves utiles, mais le contrat conserve des
obligations ouvertes et des sur-revendications.

---

# LIMITES DE LA REVUE

Les artefacts bruts publics, les diffs, les scripts, les contrats et les
résultats GitHub Actions ont été ouverts aux commits indiqués.

Le dépôt complet avec ses `node_modules`, un Postgres local, un accès GCP et les
secrets GitHub n’étaient pas disponibles dans l’environnement du relecteur.
Les commandes nécessitant ces accès n’ont donc pas été prétendues comme
rejouées localement. Chaque point dépendant de ces éléments a été refusé
lorsque les artefacts publics et les runs officiels ne suffisaient pas à
établir la reproduction.

---

# RÉPONSE À ENVOYER À L’AGENT

> J’ai transmis le dossier final à la revue. Verdict : pas de feu vert global à
> la PR #40 en l’état.
>
> Le relecteur signe cinq P0 : P0-V3-02, P0-A2-02, P0-A2-11, P0-LS-05 et
> P0-LS-17.
>
> Il refuse sept P0 : P0-V4-1, P0-V4-2, P0-LS-13, P0-LS-16, P0-LS-18,
> P0-V3-14 et P0-A2-09. CTR-OPERATIONS-DR et les deux lots de la PR #39 sont
> également refusés.
>
> Les blocages principaux sont précis :
>
> - V4-1 demande encore le canal de lancement, que le paquet déclare absent ;
> - V4-2 confond 43 ancres avec 43 cartes ;
> - LS-13 n’a pas de HAR/trace Playwright liant mécaniquement les deux pages et
>   les cookies dans un même run ;
> - LS-16/LS-18 ne vérifient pas `head_branch=main`, le test de substitution
>   dépend des 50 derniers runs, et le roll post-merge durci n’existe pas encore ;
> - V3-14 incorpore donc encore une attestation insuffisante ;
> - le paquet WIF n’est pas rejouable : `repro.sh` contient les trois chemins
>   sous forme de commentaires, le workflow cible une infrastructure supprimée,
>   le test autorisé peut rester vert sur HTTP 403/404, le négatif GKE n’a pas
>   été joué et le Dockerfile référence le mauvais nom de fichier ;
> - le contrat DR conserve des obligations BLOCKED/UNTESTED et la correction du
>   monitoring n’est pas persistée dans Terraform ;
> - la PR #39 est rouge, `test-runs.log` est absent, et trois défauts de
>   concurrence/récupération restent ouverts.
>
> Merci de ne passer CLOSED/SIGNED que les cinq IDs explicitement acceptés. Pour
> la prochaine soumission, fournis un paquet borné aux refus ci-dessus, avec les
> artefacts bruts et les checks verts.

---

# SOURCES EXAMINÉES

- PR #40 : https://github.com/openaxcloud/vibecore/pull/40
- PR #38 : https://github.com/openaxcloud/vibecore/pull/38
- PR #39 : https://github.com/openaxcloud/vibecore/pull/39
- PR #36 : https://github.com/openaxcloud/vibecore/pull/36
- Commit PR #40 : https://github.com/openaxcloud/vibecore/commit/60a987caabc91bef59a1e41ad1f1ad70f3747de5
- Commit PR #38 : https://github.com/openaxcloud/vibecore/commit/b291841b2c6681bb365e8077cf059b5cbb9021d9
- Commit PR #39 : https://github.com/openaxcloud/vibecore/commit/96f53af716e4291841ac45059258962867744c85
- Tête PR #36 : https://github.com/openaxcloud/vibecore/commit/100d28f155282f6276f5eebcded2331d80a43261
