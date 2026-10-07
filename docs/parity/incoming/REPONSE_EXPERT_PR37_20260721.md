# RÉPONSE BRUTE DU RELECTEUR — PR #37 / DOSSIER CONSOLIDÉ DU 21 JUILLET 2026

**Reviewer :** `OpenAI-Codex`  
**Commit examiné :** `6ca7d701fdb5c2308bfac8715a966c5aa09d32df`  
**PR examinée :** `#37` — `docs/verdict-b-corrections-v3`  
**Date de revue :** 2026-07-21  
**Dossier soumis :** `DOSSIER_EXPERT_CONSOLIDE_20260721.md`

## VERDICT GLOBAL

**PR #37 : REFUSÉE — NE PAS MERGER EN L’ÉTAT.**

Le job spécifique de validation des registres est vert, mais le workflow global
`Quality Gates` échoue avec un code de sortie 1. Le job
`Roll CI attestation (post-merge, automatique)` est skippé sur la PR et le
nouveau contrôle d’attestation contient encore deux défauts bloquants :
permission GitHub Actions manquante et absence de vérification de l’identité du
workflow attesté.

### Résultat de la présente soumission

| Lot | Signés / acceptés | Refusés |
|---|---:|---:|
| A — cinq corrections v3 | 0 | 5 |
| B — vingt-deux P0 à re-confirmer | 16 | 6 |
| C — onze contrats v2 | 0 | 11 |
| D — deux lots de code facturation | 0 | 2 |
| Information — P0-LS-14 | déjà signé | — |

**P0 nouvellement re-confirmés : 16.**  
**P0 refusés dans cette soumission : 11.**  
**Contrats signés : 0/11.**

Aucune décision ci-dessous ne vaut preuve d’implémentation quand l’artefact
annoncé est seulement un contrat, un registre ou un schéma.

---

## 1. CORRECTIONS FACTUELLES OBLIGATOIRES AVANT TOUT NOUVEAU REÇU

1. Le dossier affirme que les PR `#27/#28/#29/#30` sont toutes mergées. C’est
   faux au moment de cette revue :
   - `#27` : **MERGÉE** ;
   - `#28` : **MERGÉE** ;
   - `#29` : **OUVERTE** ;
   - `#30` : **OUVERTE**.

2. La section contrats affirme encore que les PR `#27` et `#28` sont
   « NON MERGÉES », alors qu’elles sont mergées. Les ancres d’implémentation et
   les conditions de signature sont donc périmées.

3. L’état annoncé « 3 clos-signés, 27 prouvés en attente, 30 ouverts » ne
   totalise que 60 points. Le registre examiné contient **65 P0** :
   - 30 `OPEN` ;
   - 27 `PROVEN_REVIEW_PENDING` ;
   - 5 `PROVEN` ;
   - 3 `CLOSED`.
   Les cinq `PROVEN` sont omis du message.

4. Pour les cinq points v3, `proof` et `evidenceId` ont été modifiés, mais
   `conditionDeCloture`, `refusalReason`, `nextAction` et `reviewVerdict`
   conservent encore les anciens refus. Le registre se contredit lui-même.

5. Le dossier v3 Gallery/Pricing n’archive pas le DOM/HTML primaire. Son README
   le reconnaît explicitement. Le fichier présenté comme
   `innerText COMPLET (4 479 caractères)` contient une ellipse éditoriale :
   `[… liste complète conservée dans metadata.json …]`, alors que
   `metadata.json` ne contient pas cette liste.

---

# A. CINQ CORRECTIONS V3

## `P0-V4-1` — REFUSÉ

**Réserve : preuve primaire absente et preuve du collecteur insuffisante.**

Le nouvel `evidenceId` pointe bien vers le dossier v3 et le compteur
`82 Results` y est reconnu honnêtement. Toutefois :

- le HTML/DOM complet de 1,5 Mo n’est pas archivé ;
- le texte « complet » est tronqué par une ellipse éditoriale ;
- `metadata.json` est une déclaration secondaire, pas la capture primaire ;
- aucun run de collecteur, script Playwright, log de navigation ou archive
  rendue ne permet de reproduire la collecte des routes produit et du canal de
  lancement ;
- les champs de clôture du P0 restent ceux de l’ancien refus.

**À fournir pour signer :** archive DOM/HTML réelle ou trace Playwright
rejouable, capture/trace du canal de lancement, hashes recalculables des
artefacts primaires, puis synchronisation de tous les champs du P0.

## `P0-V4-2` — REFUSÉ

**Réserve : les mesures sont maintenant plausibles, mais elles ne sont pas
adossées à une archive primaire reproductible.**

Le paquet rétablit correctement que `82 Results` existe et que le compteur
`Views` varie dans le temps. Cette correction sémantique est bonne. Elle ne
suffit toutefois pas au titre « mesures réelles, archive rendue » :

- aucun HTML rendu complet n’est archivé ;
- le hash DOM déclaré ne peut pas être recalculé à partir du paquet ;
- la liste présentée comme complète est tronquée ;
- il n’existe pas de capture primaire associant la date, la page et les
  valeurs, seulement un texte et des métadonnées auto-déclarées.

## `P0-V3-02` — REFUSÉ

**Réserve : requalification du critère au lieu de satisfaction du critère
enregistré.**

Le paquet dit désormais honnêtement qu’aucun report au niveau application
n’est observé sur le rendu public et que seul le footer générique existe.
Cependant, le registre exige encore de prouver le report spécifique à
l’application, et `nextAction` demande toujours cette preuve.

Une absence publique peut être enregistrée comme `UNKNOWN` ou
`NOT_OBSERVED_IN_PUBLIC_RENDER`, mais il faut d’abord modifier de façon cohérente
le titre, la condition de clôture et les références normatives. Le relecteur ne
peut pas remplacer lui-même le point soumis par un autre point.

## `P0-LS-13` — REFUSÉ

**Réserve : observation liée auto-déclarée, sans artefact primaire permettant
de relier prix, navigateur, cookies et géolocalisation au même instant.**

`metadata.json` regroupe dans un même objet les prix, la locale, les noms de
cookies, l’IP et l’horodatage. Cela améliore la traçabilité déclarative, mais ne
prouve pas que ces valeurs proviennent de la même session :

- pas de capture réseau ou trace navigateur ;
- pas de DOM Pricing archivé ;
- pas de screenshot contenant prix et contexte ;
- pas de journal de collecteur ;
- le hash DOM déclaré n’est pas recalculable sans le DOM ;
- la géolocalisation est une sortie séparée et ne lie pas, par elle-même,
  l’adresse IP à la session de navigation.

Le validateur peut recalculer le hash de fichiers présents, mais il ne peut pas
authentifier un DOM absent.

## `P0-LS-16` — REFUSÉ

**Réserve : mécanisme CI encore cassable et non validé dans cette PR.**

Constats sur la version soumise :

1. Le workflow déclare seulement `permissions: contents: write`. Le script
   appelle l’API « Get a workflow run », qui nécessite `actions: read`.
   L’étape peut donc échouer avec `Resource not accessible by integration`.

2. `verify-attestation-run.mjs` vérifie le SHA, la conclusion, l’URL et la date,
   mais pas le nom/ID du workflow ni l’événement. Un autre workflow réussi au
   même SHA peut être substitué au run « Parity registries ».

3. Le job `roll-attestation` est skippé sur la PR. C’est normal pour un job
   post-merge, mais cela signifie que cette nouvelle version n’a pas encore
   produit sa preuve vivante.

4. Le workflow global `Quality Gates` de la PR #37 est rouge.

**À corriger :**
`actions: read`, validation de `workflow_id` ou `name` et de `event`,
test négatif de substitution d’un run étranger, puis un vrai run post-merge
vert dont le commit bot et l’attestation sont cohérents.

---

# B. VINGT-DEUX P0 À RE-CONFIRMER

## P0 SIGNÉS / RE-CONFIRMÉS

### `P0-A2-04` — SIGNÉ

Le contrat distingue réellement Autoscale, Static, Reserved VM et Scheduled,
avec lifecycle, configuration, secrets, coûts, observabilité, changement de
type et preuve attendue. Cette signature valide **l’existence de la
contractualisation**, pas la disponibilité réelle des quatre produits.

### `P0-A2-06` — SIGNÉ

`APPROVAL_STATUS.json` sépare bien :

- `verticalBackendReady: passed: true` ;
- `verticalUserJourneyReady: passed: false`, avec absence de preuve UI pour
  Publish et Rollback.

Le faux positif UI est donc corrigé.

### `P0-A2-08` — SIGNÉ

Le snapshot distingue les deux produits Clerk/Replit Auth, documente le chemin
custom-auth vers Clerk, conserve honnêtement comme inconnu le guide
Replit Auth vers Clerk annoncé « coming soon », et ne revendique pas MFA,
SMS ou Organizations comme pris en charge.

### `P0-EX-01` — SIGNÉ

Le plan indique `stateEmbeddedInPlan: false` et renvoie l’état courant aux vues
et registres générés. Le plan normatif ne porte plus l’overlay manuel comme
source d’autorité.

### `P0-EX-03` — SIGNÉ

La persistance du layout côté Replit est bornée à `UNKNOWN`, tandis que
l’exigence E-Code est explicitement séparée. Aucune persistance non sourcée
n’est affirmée.

### `P0-EX-06` — SIGNÉ

Les montants tarifaires observés ont été sortis du plan durable et placés dans
un registre d’observations. Cette signature ne valide pas les nouvelles
observations de prix de `P0-LS-13`.

### `P0-EX-09` — SIGNÉ

Les quatre types de déploiement possèdent des sous-contrats séparés. Cette
signature porte sur la structure contractuelle, pas sur l’implémentation de
Static ou Reserved VM.

### `P0-LS-01` — SIGNÉ

Le registre des routes porte vingt entrées et toutes ont
`authenticated: false`. Le sujet observé est correctement qualifié de visiteur
anonyme.

### `P0-LS-02` — SIGNÉ

Recalcul effectué sur le registre :

- 20 routes ;
- 21 tentatives, car `/signup` porte deux captures ;
- 19 HTTP 200 ;
- deux tentatives anti-bot sur `/signup` ;
- 16 hashes distincts lorsque les deux hashes de `/signup` sont séparés.

### `P0-LS-07` — SIGNÉ

L’univers contient exactement `P001` à `P159`. Aucun `P160` à `P174` n’est
présent. L’addition mécanique 159 + 15 a bien été supprimée.

### `P0-LS-08` — SIGNÉ

Les six capacités sont présentes dans le corpus documentaire hashé et ont été
reclassées comme documentation courante : Spotlight, Resources, Preview
DevTools, Library, Android Emulator et Grouped Publish.

### `P0-LS-09` — SIGNÉ

Le registre distingue correctement l’API publique `UNKNOWN` du serveur MCP
documenté en bêta. MCP n’est plus présenté comme preuve de remplacement de
l’API.

### `P0-LS-10` — SIGNÉ

La conclusion sur `/@user` est bornée à la route testée et n’est plus
généralisée à toutes les routes de profil.

### `P0-LS-11` — SIGNÉ

`/bounties` est enregistré comme redirection externe vers l’Expert Network
opéré via Contra, sans inférence non prouvée sur l’ancien backend.

### `P0-LS-12` — SIGNÉ

Le retrait du plan Teams et l’existence de capacités de collaboration en équipe
sont désormais deux faits distincts.

### `P0-LS-15` — SIGNÉ

Le registre retire l’inférence « Parallel Agents = une microVM par tâche » et
classe l’isolation runtime par tâche comme `UNKNOWN`.

## P0 REFUSÉS

### `P0-A2-02` — REFUSÉ

**Réserve : preuve sur-revendiquée.**

`SURFACE_REGISTRY.yaml` contient bien 159 entrées `P001–P159`, mais aucun
ensemble réel de 56 IDs `S01–S56`. La mention des services apparaît comme
commentaire/source, pas comme univers exact verrouillé. Le champ `proof`
affirme donc plus que l’artefact.

### `P0-A2-11` — REFUSÉ

**Réserve : compteurs périmés.**

Le proof affirme `canonicalWorkItemCount=99`. Le registre courant
`WORK_ITEM_REGISTRY.yaml` annonce **122** work items. Le compteur 99 n’est donc
plus la source unique actuelle. Il faut régénérer le proof et toutes les vues
qui le reprennent.

### `P0-LS-05` — REFUSÉ

**Réserve : l’evidenceId ne contient qu’une taxonomie sur quatre.**

`ARTIFACT_KIND_REGISTRY.yaml` contient sept `ArtifactKind`, mais pas les huit
`GeneratedAssetKind`, les sept `ComponentKind` ni la taxonomie Deployment
annoncés dans le proof. Un renvoi au plan ne remplace pas les registres
spécialisés annoncés.

### `P0-LS-17` — REFUSÉ

**Réserve : le proof conserve 99 work items alors que le registre courant en
porte 122.**

Les 159 candidats et les 10 surfaces déclarées sont présents, mais le triplet
annoncé `159 / 99 / 10` est périmé. Par ailleurs, le registre distingue
correctement 159 candidats IDE et un univers canonique de 164 avec les surfaces
hors IDE ; ces deux notions doivent être nommées séparément au lieu d’être
présentées comme un compteur unique.

### `P0-LS-18` — REFUSÉ

**Réserve : attestation ancienne et nouveau mécanisme non validé.**

La preuve de ce point reste ancrée sur une ancienne exécution, tandis que le
nouveau mécanisme de la PR #37 présente les défauts `actions: read` et
workflow/event non vérifiés décrits sous `P0-LS-16`. Le calcul post-merge n’est
pas encore démontré par cette version.

### `P0-V3-14` — REFUSÉ

**Réserve : chaîne complète non reproductible dans cette revue et PR globale
rouge.**

Le job « Validate registries » est vert, mais le workflow global est rouge et
le contrôle d’attestation n’est pas fiable. Je n’ai pas pu rejouer localement
la chaîne Node/Vitest complète faute de checkout complet et de `node_modules`.
Je ne signe donc pas un proof qui revendique l’ensemble
génération + drift-check + validation négative tant que la chaîne officielle
complète n’est pas verte et reproductible.

---

# C. ONZE CONTRATS V2

## CONTRATS SIGNÉS

**Aucun.**

Le plan exige plus que la présence ou une rédaction améliorée : schéma,
sections requises, références croisées, tests négatifs et compatibilité doivent
être validés. Les onze contrats conservent soit une contradiction de
provenance, soit une dépendance centrale non satisfaite, soit des tests négatifs
annoncés sans artefact rejouable.

## CONTRATS REFUSÉS

### `CTR-BILLING-LEDGER` — REFUSÉ

- Le contrat dit encore que la PR #28 est non mergée ; elle est mergée.
- Le code mergé passe une réservation à `COMMITTED` avant de poster
  atomiquement l’écriture de settlement.
- Le plafond est lu et contrôlé hors transaction/lock : deux réservations
  concurrentes peuvent dépasser la limite.
- `postTransaction` ne vérifie pas que les comptes appartiennent à
  l’organisation ni que leur devise correspond.
- La compensation fiscale dépend d’un `taxMinor` fourni de nouveau par
  l’appelant au lieu de dériver la ventilation persistée.

Ces défauts contredisent directement I-LED-4, l’atomicité et la réconciliation
organisation/devise du contrat.

### `CTR-IMPORT-REMIX` — REFUSÉ

La machine Import unique est mieux alignée, mais le lot complet reste
non signable :

- le contrat dit encore que la PR #27 est non mergée ; elle est mergée ;
- le mini-ledger indexe la réservation par clé brute, sans namespace
  organisation ;
- deux organisations utilisant la même clé peuvent partager la même
  réservation ;
- deux retries concurrents peuvent tous deux créer un import avant
  l’écriture dans la map d’idempotence ;
- le ledger est explicitement in-process et ne survit pas au redémarrage.

### `CTR-GALLERY-COMMUNITY` — REFUSÉ

Le contrat dépend du paquet Gallery v3 qui n’archive pas la preuve primaire. Le
report par application n’est pas démontré et la preuve publique ne montre que
le footer générique.

### `CTR-DEPLOYMENT-TYPES` — REFUSÉ

Le document est mieux structuré et honnête, mais sa propre règle dit qu’un type
n’existe que s’il est spécifié **et prouvé live**. Static reste sans E2E dédié,
Reserved VM est `NOT_STARTED`, et le contrat UI/coût de Scheduled est incomplet.
Les tests négatifs listés ne sont pas accompagnés d’un artefact exécutable
rejoué dans cette revue.

### `CTR-RELEASE-PUBLISH` — REFUSÉ

`ReleaseCatalog`/`ReleaseManifest` persistant et UI live restent explicitement
ouverts. Le refus initial n’est donc pas levé.

### `CTR-PROJECT-MANIFEST-SCHEMA` — REFUSÉ

Le schéma v3 est nettement amélioré (`additionalProperties:false`,
`minLength`, `minItems`, contrainte `maxContains:1` pour `MOBILE_APP`), mais :

- `x-repoCommit` reste ancien (`1692f981`) ;
- aucun fichier de tests négatifs rejouable n’est fourni dans le dossier ;
- aucune preuve de compatibilité/migration de versions de manifest n’est
  jointe.

Le schéma est proche d’une signature, mais le niveau `contractsValidated`
demande ces contrôles, pas seulement une inspection visuelle du JSON.

### `CTR-DOMAIN-MODEL` — REFUSÉ

CloudTenant complet et câblage Checkpoint restent ouverts. Les ancres Import et
Billing sont en outre périmées ou en contradiction avec les états de merge et
les nouveaux objets ledger.

### `CTR-RUNTIME-NIX` — REFUSÉ

Le format `ecode.lock` et la rotation/révocation des générations restent des
dépendances ouvertes. Le refus initial n’est pas levé.

### `CTR-IAM-POLICY-BASELINE` — REFUSÉ

Deux tests négatifs ponctuels ne remplacent pas l’inventaire exhaustif, le
négatif par identité et les trois chemins WIF encore ouverts.

### `CTR-CHECKPOINT` — REFUSÉ

L’implémentation annoncée est sur une PR #32 non mergée ; le snapshot DB
physique et la preuve PITR live restent ouverts. Un contrat ne vaut pas une
implémentation mergée ni un exercice réel.

### `CTR-SECURITY-PRIVACY` — REFUSÉ

Le threat model formel et les règles de rétention/effacement restent ouverts.
Ces éléments font partie du périmètre même du contrat.

---

# D. CODE FACTURATION

## PR #27 — Import + billing de sûreté — REFUSÉE COMME LOT COMPLET

**Partie reconnue :** la machine à quatorze états et les branches
clean/quarantaine sont substantiellement mieux alignées avec le contrat.

**Blocages :**

1. `ImportCreditLedger.byKey` est indexé par la clé brute. Il ne vérifie pas
   `organizationId` ou `importJobId` lorsqu’une réservation existe déjà.
2. La création idempotente n’est pas sérialisée : deux requêtes concurrentes
   peuvent toutes deux constater l’absence de la clé, puis créer deux jobs.
3. La réservation reste in-process et disparaît au redémarrage.
4. Le contrat et le dossier présentent ce billing comme une sûreté
   idempotente générale, alors que les cas multi-tenant et concurrents ne le
   sont pas.

**Correction minimale :** contrainte unique durable
`(organizationId, idempotencyKey)`, transaction/upsert ou verrou par clé,
contrôle d’ownership de la réservation, stockage durable et tests concurrents
multi-organisations.

## PR #28 — Grand livre double entrée — REFUSÉE

La migration additive et les triggers d’immutabilité sont des acquis utiles.
Le store mergé conserve néanmoins quatre défauts bloquants :

1. transition de réservation vers `COMMITTED` avant le post du settlement,
   sans transaction DB commune ;
2. contrôle du hard limit non sérialisé ;
3. absence de validation organisation/devise des comptes fournis à
   `postTransaction` ;
4. compensation fiscale non dérivée de l’écriture originale.

**Correction minimale :** une transaction DB unique pour état +
écritures, verrouillage/compteur atomique pour le plafond, validation des
comptes contre organisation/devise et reversal dérivé des écritures
persistées.

---

# E. CONTRATS BLOQUÉS — INFORMATION

Les trois contrats annoncés comme bloqués ne sont pas signés et n’ont pas été
réévalués :

- `CTR-IDENTITY-COLLABORATION` ;
- `CTR-PROJECT-FACTORY` ;
- `CTR-OPERATIONS-DR`.

---

# COMMANDES ET CONTRÔLES REJOUÉS

Contrôles locaux sur les artefacts extraits du commit de PR :

```text
sha256sum README.md gallery-capture.txt
gallery-capture.txt = 4b5195421757a2fc9950865584468eaa0ab3197844006f5511cc0c5ac23a61ef

grep -n '82 Results' gallery-capture.txt
→ compteur présent

grep -n -E 'liste complète|…' gallery-capture.txt
→ ellipse éditoriale présente

grep -n -Ei 'HTML.*non.*archiv|HTML complet' README.md
→ le paquet reconnaît que le HTML complet n'est pas archivé
```

Calculs YAML rejoués :

```text
P0 total = 65
status = OPEN 30 / PROVEN_REVIEW_PENDING 27 / PROVEN 5 / CLOSED 3
reviewVerdict = REFUSED 30 / SIGNED 25 / absent 10
reviewer = OpenAI-Codex 25 / UNKNOWN 40

ROUTE_OBSERVATION_REGISTRY :
20 routes / 19 HTTP 200 / 1 entrée HTTP 403 correspondant à 2 tentatives
signup / 20 authenticated:false / 16 hashes après séparation des 2 hashes
signup.

SURFACE_REGISTRY :
10 surfaces déclarées
159 candidats P001–P159
0 ID S01–S56
0 ID P160–P174
canonicalSurfaceCount = 164

ARTIFACT_KIND_REGISTRY :
7 kinds seulement.
```

Contrôles GitHub :

```text
PR #37 : OPEN
Validate registries : SUCCEEDED
Quality Gates : FAILED, exit code 1
Roll CI attestation : SKIPPED sur la PR

PR #27 : MERGED
PR #28 : MERGED
PR #29 : OPEN
PR #30 : OPEN
```

## Limite de reproduction

Le checkout complet du dépôt et ses `node_modules` n’étaient pas disponibles
dans l’environnement local de revue, et la résolution DNS du conteneur ne
permettait pas de cloner le dépôt. Les sources exactes et les artefacts publics
ont été ouverts au commit de la PR, les contrôles statiques ci-dessus ont été
rejoués, et les résultats GitHub Actions officiels ont été inspectés.

En conséquence, aucun point ou contrat dépendant uniquement d’une suite
Node/Vitest non rejouée n’a été signé.

---

# RÉPONSE PROPRIÉTAIRE À ENVOYER À L’AGENT

> Je ne donne pas le feu vert à la PR #37 et je ne valide pas le dossier comme
> « transmissible tel quel ». Le reçu expert joint re-confirme 16 P0 et refuse
> 11 P0 ; aucun des 11 contrats n’est signé ; les lots code #27 et #28 sont
> refusés dans leur état mergé.
>
> Corrige d’abord les contradictions de statut (#29/#30 sont ouvertes,
> #27/#28 sont mergées), le comptage qui omet 5 points PROVEN, et les champs
> périmés conditionDeCloture/refusalReason/nextAction des cinq P0 v3.
>
> Pour Gallery/Pricing, archive la preuve primaire réelle : DOM/HTML ou trace
> Playwright reproductible, sans ellipse, avec une capture liant au même run
> prix, locale, cookies et contexte réseau.
>
> Pour LS-16, ajoute `actions: read`, vérifie le workflow ID/nom et l’événement,
> ajoute un test négatif avec substitution d’un run étranger, puis fournis un
> vrai run post-merge vert. Tous les Quality Gates doivent être verts.
>
> Pour #27, rends l’idempotence durable, sérialisée et scoppée par organisation.
> Pour #28, rends atomiques la transition de réservation et les écritures,
> sérialise le hard limit, valide organisation/devise des comptes et dérive les
> compensations des écritures persistées.
>
> Ne marque rien CLOSED ou SIGNED au-delà des décisions explicites du reçu.
