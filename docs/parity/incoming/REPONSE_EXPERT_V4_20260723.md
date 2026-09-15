# REVIEW RECEIPT — RR-20260723-CODEX-07

**Reviewer :** `OpenAI-Codex`  
**Dépôt :** `openaxcloud/vibecore`  
**Date de revue :** 2026-07-23  
**Dossier soumis :** `DOSSIER_EXPERT_V4_20260723 2.md`  
**SHA-256 du dossier joint :** `e7d08004aff1e3cf2c0f289fa56962c9dcb535065f41cf4710b631ed65abf44c`  
**SHA-256 du message de demande :** `f6c49cef35aba54b511c3cc2aa11a19a2c7fd667ed01cf5d8c8c2c6752e1bc22`

> Canonicalisation du message : texte UTF-8 reproduit tel qu’affiché, fins de
> ligne LF, tabulations de la liste conservées, aucun saut de ligne final.
>
> Le message nomme le reçu antérieur `RR-20260722-CODEX-05`, tandis que
> l’en-tête du dossier V4 nomme `RR-20260722-CODEX-06`. Cette divergence de
> référence est consignée, mais ne change aucune décision technique ci-dessous.

## 1. Commits et runs audités

| Périmètre | Référence auditée |
|---|---|
| Attestation v6 / PR #50 | merge `e1794fe6939a55fb1902c5e73629ae81d1b01e1a` |
| Preuve vivante d’attestation | run `30005939249`, commit bot `ee0aedd1` |
| HAR LS-13 + livescan LS-03 / PR #48 | tête `bc629fe1512ad82d8e1d0aa443438b2cf14e7626` |
| CI LS-13 / LS-03 | run `30003958808` |
| WIF / PR #46 | `f08189719797278512da831030b4ff18b4110697` |
| Import/billing / PR #39 | `22dbfaa19618b1b63a22d21aa5b1a03212151fa4` |
| Purge DB / PR #51 | `2d2ff0a0f4413654896935371410b287a981a9e6` |
| Purge physique / PR #52 | `035ee9ed275cff7171aaddf9989a96befec747cb` |
| Operations/DR / PR #36 | `9b9f0c4db95563e4155d101cce6a504e9aaea186` |
| Runtime Nix / PR #45 | tête de preuve `01de5fcef1dd344c1cefa9badeaa20c8cf5ec98f` |

## 2. Verdict global

**Pas de feu vert global au dossier V4.**

| Catégorie | Acceptés | Refusés |
|---|---:|---:|
| P0 soumis à re-signature | **2** | **4** |
| Contrats | **0** | **2** |
| Lots de code | **1** | **2** |

### P0 à signer

Écrire `reviewer: OpenAI-Codex` uniquement pour :

- `P0-LS-13`
- `P0-LS-03`

### P0 refusés

- `P0-LS-16`
- `P0-LS-18`
- `P0-V3-14`
- `P0-A2-09`

### Contrats refusés

- `CTR-OPERATIONS-DR`
- `CTR-RUNTIME-NIX`

### Lots de code

- **PR #39, correctif Import/billing : ACCEPTÉ à portée ciblée.**
- **PR #51, purge DB : REFUSÉE.**
- **PR #52, purge physique : REFUSÉE.**

Le correctif grand livre de la PR #39 demeure accepté à la portée limitée du
reçu précédent. L’acceptation du nouveau correctif Import/billing signifie que
les deux réserves code ciblées de cette PR sont désormais levées. Elle ne signe
pas automatiquement `CTR-BILLING-LEDGER`, ne déclare pas toute la facturation
achevée et ne vaut pas preuve de production.

**Aucun refus ci-dessous n’est fondé sur le seul rouge Playwright.**

---

# 3. P0 SIGNÉS

## `P0-LS-13` — SIGNÉ

**Commit audité :** `bc629fe1512ad82d8e1d0aa443438b2cf14e7626`  
**Run CI audité :** `30003958808` — `Parity registries`, succès.

La réserve du reçu V3 est levée :

- le README et le proof sont générés depuis le manifeste final ;
- la capture lève une erreur sur échec de navigation, statut autre que 200 ou
  URL finale inattendue ;
- `sameValueCarried` n’est vrai que lorsque deux empreintes non nulles existent
  et sont égales ;
- les négatifs `null/null`, une seule valeur, valeurs vides, valeurs
  différentes, HTTP 403/404/000 et mauvaise URL sont couverts ;
- le HAR unique contient les deux navigations et les deux DOM du même run ;
- les observations tarifaires réellement soutenues par cette session sont
  reliées explicitement ; les autres conservent honnêtement leur provenance
  propre.

**Portée de la signature :** preuve de session navigateur fail-closed pour les
observations explicitement reliées au run. Cette signature ne transforme pas
les autres observations historiques en observations capturées par ce HAR.

**Directive registre :**

```yaml
p0Id: P0-LS-13
reviewer: OpenAI-Codex
```

---

## `P0-LS-03` — SIGNÉ

**Commit audité :** `bc629fe1512ad82d8e1d0aa443438b2cf14e7626`  
**Run CI audité :** `30003958808` — succès.

La commande est désormais ancrée dans le job CI officiel :

```text
Verify livescan hash coverage (P0-LS-03 — fails on hash drift)
```

Le contrôle couvre le paquet annoncé de 71 fichiers, dont les 21
`*.links.txt`. Le test négatif modifie un octet, exige un échec, restaure le
fichier puis exige le retour au vert. Le chemin d’artefact et la condition de
clôture portent la même unité de preuve : couverture de hash complète du
paquet.

**Portée de la signature :** intégrité et couverture des fichiers du paquet.
Elle ne valide pas automatiquement la justesse sémantique de chaque observation
contenue dans ces fichiers.

**Directive registre :**

```yaml
p0Id: P0-LS-03
reviewer: OpenAI-Codex
```

---

# 4. P0 REFUSÉS — MOTIFS VERBATIM

## `P0-LS-16` — REFUSÉ

**Commit audité :** `e1794fe6939a55fb1902c5e73629ae81d1b01e1a`  
**Preuve vivante reconnue :** run `30005939249` réussi sur `main`, puis commit
bot `ee0aedd1`.

**Motif verbatim :**

> Le run post-merge `30005939249` et le commit bot `ee0aedd1` sont réels,
> mais le vérificateur v6 reste fail-open sur l’absence de `mergedCommit`,
> `repoCommit` et `runUrl` : `checkAttestationFields` ne contrôle ces champs
> que s’ils existent, `validate-registries` ne les exige pas, et les tests
> négatifs falsifient des valeurs présentes sans tester leur suppression.
> Une attestation amputée peut donc encore passer.

Constat dans le code :

```js
if (att.mergedCommit !== undefined && !sameCommit(...)) { ... }
if (att.repoCommit !== undefined && !sameCommit(...)) { ... }
if (att.runUrl !== undefined && (...)) { ... }
```

Le validateur structurel requiert `runId`, `runCommit`, `runDate` et
`conclusion`, mais pas les trois champs ci-dessus. Le message de succès du
script affirme pourtant que tous les champs ont été liés, y compris lorsqu’ils
sont absents.

**Correction minimale exigée :**

1. rendre `mergedCommit`, `repoCommit` et `runUrl` obligatoires et non vides
   dans le validateur et dans le vérificateur pur ;
2. rejeter explicitement leur absence ;
3. ajouter un test négatif indépendant supprimant chacun de ces champs ;
4. produire un nouveau roll post-merge avec cette version.

---

## `P0-LS-18` — REFUSÉ

**Commit audité :** `e1794fe6939a55fb1902c5e73629ae81d1b01e1a`

**Motif verbatim :**

> `mergedCommit` reste facultatif dans le chemin de validation ; sa
> suppression n’est ni rejetée ni testée. Le mécanisme ne prouve donc pas
> fail-closed que les vues ont été recalculées sur le commit mergé.

Le run courant contient effectivement le champ et correspond au SHA du run.
Cela prouve cette instance, mais pas la garde cassante demandée par le point :
une édition ultérieure retirant `mergedCommit` peut conserver un contrôle vert.

**Correction minimale exigée :** même correction que `P0-LS-16`, puis nouveau
roll post-merge.

---

## `P0-V3-14` — REFUSÉ

**Commit audité :** `e1794fe6939a55fb1902c5e73629ae81d1b01e1a`

**Motif verbatim :**

> La chaîne documentaire revendique une authentification complète de
> provenance, mais elle accepte encore une attestation sans `mergedCommit`,
> `repoCommit` ou `runUrl`. Le maillon d’attestation n’est donc pas
> fail-closed ; l’ensemble génération → drift-check → validation →
> authentification ne peut pas être signé comme chaîne complète.

La présence d’un run vivant et vert ne corrige pas ce défaut logique du
vérificateur.

---

## `P0-A2-09` — REFUSÉ

**Commit audité :** `f08189719797278512da831030b4ff18b4110697`

Les autres réserves du reçu V3 sont substantiellement traitées : `gh` est
obligatoire en préflight, le run GitHub est corrélé par nonce, le négatif GKE
attend 401/403 avec contenu contrôlé, et les trois chemins sont décrits comme
rejoués.

**Motif verbatim :**

> `repro.sh` installe le trap de teardown après `gcloud projects create` et
> `gcloud billing projects link`. Si le projet est créé puis que la liaison
> billing échoue sous `set -e`, le script sort avant l’installation du trap et
> peut laisser le projet actif. La correction annoncée « trap teardown dès la
> 1re ressource » n’est donc pas présente.

L’ordre observé est :

```text
création du projet
liaison billing
définition de teardown
trap teardown EXIT
```

**Correction minimale exigée :**

- définir un teardown idempotent et installer le trap avant
  `gcloud projects create` ;
- rendre le teardown sûr lorsque le projet n’existe pas encore ;
- rejouer les trois chemins après cette modification et archiver la trace du
  cas négatif où la liaison billing échoue.

---

# 5. CODE FACTURATION

## PR #39 — Import/billing — ACCEPTÉ À PORTÉE CIBLÉE

**Commit audité :** `22dbfaa19618b1b63a22d21aa5b1a03212151fa4`

La réserve précise du reçu V3 est levée :

- la réservation porte une version optimiste ;
- le reaper sélectionne `{id, version}` ;
- son compare-and-set exige à la fois l’ancienne version et
  `expiresAt <= now` ;
- une revive étend l’expiration et incrémente la version, ce qui invalide le
  CAS ancien ;
- `attachJob` exige `status: ACTIVE`, la version attendue, une expiration
  future et `importJobId: null` ;
- les tests C1/C2/C3 couvrent l’interleaving exact, l’attache après expiration
  et une série concurrente ;
- l’artefact annonce 74/74 tests contre Postgres réel.

**Décision :** le défaut `revive/reaper/attach` est considéré corrigé. Avec
l’acceptation antérieure du grand livre, la PR #39 est techniquement recevable
dans le périmètre exact examiné. La décision de merge reste celle du
propriétaire.

**Limite :** aucune signature de contrat n’est déduite de cette décision.

---

# 6. PURGE DE COMPTE

## PR #51 — purge DB — REFUSÉE

**Commit audité :** `2d2ff0a0f4413654896935371410b287a981a9e6`

**Motif verbatim :**

> La cessation externe de facturation n’est pas fonctionnelle pour une
> subscription Stripe active : le client appelle
> `POST /v1/subscriptions/{id}/cancel`, alors que l’annulation immédiate
> utilise la suppression de la subscription. Le chemin échoue et maintient le
> compte dans la file. En outre, les IDs de subscription sont sélectionnés
> avant les verrous de topologie, et la matrice PII laisse du contenu libre
> dans plusieurs lignes détachées.

Réserves observées :

1. `StripeBillingClient.cancelSubscription` envoie la requête vers
   `/v1/subscriptions/<id>/cancel`.
2. `soleOrgActiveSubscriptionExternalIds(userId)` est exécuté avant la
   transaction qui verrouille organisations et memberships. Une variation de
   topologie entre lecture et transaction peut annuler le mauvais périmètre,
   ou ne pas annuler une organisation devenue sole-owner.
3. `SupportTicket.userId` est mis à `null`, mais le sujet, les métadonnées et
   les `TicketMessage.body` restent inchangés.
4. D’autres payloads libres relevés dans la revue, notamment certains
   snapshots/metadata, ne sont pas couverts par la preuve « anonymized ».

Les cinq tests Postgres ne couvrent donc pas tous les chemins de production
annoncés.

**Correction minimale exigée :**

- utiliser l’opération Stripe correcte et tester son échec/réussite avec un
  fake HTTP strict ;
- prendre les verrous de topologie avant de sélectionner les subscriptions à
  annuler, puis conserver cette topologie jusqu’au commit ;
- compléter la matrice PII champ par champ et nettoyer les contenus libres
  avant de détacher les références utilisateur ;
- ajouter les négatifs correspondants.

---

## PR #52 — purge physique — REFUSÉE

**Commit audité :** `035ee9ed275cff7171aaddf9989a96befec747cb`

Les E2E GCS et kind démontrent des suppressions réelles sur leurs scénarios.
Ils ne couvrent pas plusieurs chemins fail-open du câblage de production.

**Motif verbatim :**

> La purge physique reste fail-open : la barrière Kubernetes utilise
> `Promise.allSettled` sans rejeter ses suppressions échouées ; le mode
> `NoopObjectStorage` peut certifier l’absence de buckets réels ; la barrière
> ne bloque pas les écritures object-storage ; et l’inventaire omet les
> workspaces accessibles par membership d’organisation partagée sans ligne
> `ProjectCollaborator`.

Réserves observées :

1. des suppressions Secret/Pod/Service rejetées peuvent être ignorées et la
   barrière annoncée comme acquise ;
2. lorsque l’object storage fonctionnel est désactivé, le no-op peut retourner
   « absent » pour un bucket qui existe encore réellement ;
3. la barrière workspace ne révoque pas les voies d’écriture object-storage,
   ce qui permet une recréation après le contrôle zéro ;
4. l’inventaire ajoute les collaborations explicites, mais pas tous les projets
   atteignables par membership normale d’une organisation partagée ;
5. le contrôle Kubernetes doit aussi distinguer un vrai `NotFound` des erreurs
   réseau/RBAC, au lieu de transformer une erreur de lecture en « PVC absent ».

**Correction minimale exigée :**

- faire échouer la barrière si une seule suppression Kubernetes échoue ;
- exiger le backend GCS réel pour une purge destructive, indépendamment du
  feature flag utilisateur ;
- bloquer/révoquer toutes les écritures object-storage du sujet pendant la
  purge ;
- inventorier les projets via toutes les règles d’autorisation réelles,
  notamment les memberships d’organisation ;
- traiter seulement un `NotFound` authentifié comme preuve d’absence ;
- étendre les E2E à ces négatifs.

---

# 7. CONTRATS

## `CTR-OPERATIONS-DR` — REFUSÉ

**Commit audité :** `9b9f0c4db95563e4155d101cce6a504e9aaea186`

Preuves individuelles reconnues :

- compteur normatif 30/30 régénéré depuis l’artefact brut ;
- SLO web 702/702 ;
- métrique par requête `api_request_duration_seconds` ingérée par Managed
  Prometheus ;
- failover/failback et autres drills documentés.

**Motif verbatim :**

> Le contrat entier conserve explicitement des obligations centrales
> `BLOCKED` ou `UNTESTED` : snapshots PD planifiés, astreinte outillée,
> réplique cross-région et RTO applicatif complet. Des preuves individuelles
> valides ne satisfont pas encore le contrat complet.

**Décision :** les nouveaux sous-artefacts peuvent être enregistrés comme
preuves individuelles. Ne pas écrire le reviewer du contrat.

---

## `CTR-RUNTIME-NIX` — REFUSÉ

**Commit audité :** `01de5fcef1dd344c1cefa9badeaa20c8cf5ec98f`

Les corrections documentaires et de code sur le pin, la persistance
release/rollback et la validation catalogue sont reconnues.

**Motif verbatim :**

> Le négatif live exigé n’est pas présent : le code de refus d’une génération
> révoquée n’est pas encore déployé, la configuration production
> `NIX_STORE_GENERATIONS` est déclarée vide, et le scénario attend un
> mini-merge futur. Une commande prête à jouer n’est pas une preuve exécutée.

**Décision :** ne pas écrire le reviewer du contrat avant le run live négatif,
son artefact brut et la restauration vérifiée de la configuration.

---

# 8. CONTRÔLES REJOUÉS OU CONTRE-VÉRIFIÉS

## Rejoués localement

- SHA-256 exact du dossier joint :
  `e7d08004aff1e3cf2c0f289fa56962c9dcb535065f41cf4710b631ed65abf44c`
- SHA-256 du message canonique :
  `f6c49cef35aba54b511c3cc2aa11a19a2c7fd667ed01cf5d8c8c2c6752e1bc22`
- inspection statique des conditions fail-closed des scripts et des chemins
  de production aux commits indiqués ;
- contre-exemples logiques :
  - suppression de champs facultatifs d’attestation ;
  - échec entre création projet et installation du trap WIF ;
  - échecs Kubernetes absorbés par `allSettled` ;
  - backend object-storage no-op produisant une fausse absence.

## Runs officiels inspectés

- `30005939249` : push `main` sur `e1794fe6`, succès, roll post-merge exécuté ;
- commit bot `ee0aedd1` produit par ce run ;
- `30003958808` : validation des registres de la PR #48, succès, incluant la
  garde livescan.

## Limites

Le checkout complet avec `node_modules`, un Postgres local, des accès GCP, un
cluster Kubernetes externe et les secrets GitHub n’étaient pas disponibles
dans l’environnement de revue. Je ne prétends donc pas avoir relancé localement
les 74 tests Postgres, les trois chemins WIF ou les E2E GCS/k8s.

Les deux P0 signés disposent toutefois d’un job CI officiel vert et de gardes
négatives inspectables. Les refus reposent sur des défauts présents dans le
code ou sur des preuves explicitement encore futures, et non sur la seule
absence d’environnement local.

---

# 9. DÉCISION MACHINE À ENREGISTRER

```yaml
reviewReceiptId: RR-20260723-CODEX-07
reviewer: OpenAI-Codex
reviewedAt: "2026-07-23"
requestMessageSha256: "f6c49cef35aba54b511c3cc2aa11a19a2c7fd667ed01cf5d8c8c2c6752e1bc22"
submittedDossierSha256: "e7d08004aff1e3cf2c0f289fa56962c9dcb535065f41cf4710b631ed65abf44c"
decisions:
  accepted:
    - P0-LS-13
    - P0-LS-03
  refused:
    - P0-LS-16
    - P0-LS-18
    - P0-V3-14
    - P0-A2-09
contracts:
  accepted: []
  refused:
    - CTR-OPERATIONS-DR
    - CTR-RUNTIME-NIX
codeLots:
  accepted:
    - PR-39-IMPORT-BILLING-RACE-FIX
  refused:
    - PR-51-ACCOUNT-PURGE-DB
    - PR-52-ACCOUNT-PURGE-PHYSICAL
```

---

# 10. RÉPONSE COURTE À ENVOYER À L’AGENT

> Revue V4 terminée. Je signe uniquement `P0-LS-13` et `P0-LS-03`.
>
> Je refuse `P0-LS-16`, `P0-LS-18` et `P0-V3-14` : le run vivant et le commit
> bot sont réels, mais `mergedCommit`, `repoCommit` et `runUrl` restent
> facultatifs dans le vérificateur/validateur, et leur suppression n’est pas
> testée. Une attestation amputée peut encore passer.
>
> Je refuse `P0-A2-09` : le trap WIF est installé après la création du projet
> et la liaison billing. Un échec de liaison peut donc sortir avant le trap et
> laisser le projet actif.
>
> J’accepte à portée ciblée le correctif Import/billing de la PR #39 : le CAS
> version+expiration, `attachJob` sur `ACTIVE` et les tests concurrents ferment
> l’interleaving refusé.
>
> Je refuse la PR #51 : endpoint d’annulation Stripe incorrect, sélection des
> subscriptions avant les verrous de topologie et matrice PII encore
> incomplète.
>
> Je refuse la PR #52 : erreurs Kubernetes absorbées, object storage no-op
> susceptible de produire une fausse absence, écritures object-storage non
> gelées et inventaire incomplet pour les memberships d’organisation partagée.
>
> `CTR-OPERATIONS-DR` reste refusé comme contrat entier tant que ses obligations
> BLOCKED/UNTESTED subsistent. `CTR-RUNTIME-NIX` reste refusé tant que le
> négatif live sur génération révoquée n’a pas été exécuté.
>
> Ne marque `CLOSED` ou `SIGNED` que `P0-LS-13` et `P0-LS-03`.
