# REÇU DE REVUE — DOSSIER EXPERT V3 DU 22 JUILLET 2026

**Reviewer :** `OpenAI-Codex`  
**Date :** 2026-07-22  
**Dossier examiné :** `DOSSIER_EXPERT_V3_20260722.md`  
**Objet :** relecture individuelle des preuves soumises après le reçu `RR-20260722-CODEX-05`

---

## VERDICT GLOBAL

**Pas de feu vert global aux PR regroupées dans ce dossier.**

La soumission contient des corrections valides, mais elle mélange encore des
points signables et des points refusés dans les mêmes branches.

| Périmètre | Acceptés | Refusés |
|---|---:|---:|
| P0 soumis à signature | 4 | 6 |
| Contrats soumis | 0 | 2 |
| Lots de code examinés | 1 | 3 |

### P0 À SIGNER

Écrire `reviewer: OpenAI-Codex` uniquement pour :

- `P0-V4-1`
- `P0-V4-2`
- `P0-V3-03`
- `P0-V4-3`

### P0 REFUSÉS

- `P0-LS-16`
- `P0-LS-18`
- `P0-V3-14`
- `P0-LS-13`
- `P0-A2-09`
- `P0-LS-03`

### CONTRATS REFUSÉS

- `CTR-OPERATIONS-DR`
- `CTR-RUNTIME-NIX`

### LOT DE CODE ACCEPTÉ, À PORTÉE LIMITÉE

- Correctif **grand livre** de la PR #39 : accepté pour les quatre défauts
  précédemment signalés.

Cette acceptation ne signe pas automatiquement `CTR-BILLING-LEDGER` et ne
constitue pas une approbation globale de toute la facturation.

### LOTS DE CODE REFUSÉS

- Correctif **Import/billing** de la PR #39
- Purge DB de la PR #43
- Purge physique de la PR #47

---

# A. P0 EXAMINÉS

## `P0-V4-1` — SIGNÉ

**Titre examiné :** collecteur des routes produit rendues en JavaScript,
désormais scindé du canal de lancement.

La correction répond à la réserve précédente :

- le titre ne promet plus le canal de lancement ;
- la condition de clôture est limitée aux routes produit rendues ;
- l’inconnu sur le canal de lancement est déplacé vers
  `UNK-LAUNCH-CHANNEL` ;
- le DOM Gallery complet est archivé ;
- les ancres `/gallery/` sont présentes dans le markup ;
- la trace `_next/data` soutient l’existence de routes produit rendues.

**Portée de la signature :** cette signature valide uniquement la collecte des
routes produit rendues en JavaScript. Elle ne valide ni ne ferme
`UNK-LAUNCH-CHANNEL`.

---

## `P0-V4-2` — SIGNÉ

La mesure a été corrigée de façon cohérente :

- le proof ne parle plus de « 43 cartes » ;
- il parle de **43 ancres `/gallery/` dans le DOM** ;
- le lazy-loading est décrit séparément : vingt cartes chargées avant
  l’action `Load all apps` ;
- le compteur `82 Results` est conservé comme valeur réellement observée ;
- le DOM complet et son empreinte sont présents.

Le titre, le proof et l’artefact portent désormais la même unité de mesure.

**Portée de la signature :** 43 ancres ne sont pas requalifiées en 43
applications ou 43 cartes distinctes.

---

## `P0-LS-16` — REFUSÉ

**Réserve : la preuve post-merge est réelle, mais le vérificateur n’authentifie
pas encore toute la provenance de manière fail-closed.**

Les corrections suivantes sont bien présentes :

- vérification de `head_branch === "main"` ;
- test déterministe fondé sur une fixture étrangère ;
- merge réel de la PR #42 ;
- run post-merge réussi ;
- commit bot d’attestation réellement produit.

Le run vivant n’est donc plus contesté.

Trois défauts restent cependant dans le mécanisme examiné :

1. Le vérificateur lie `runCommit` au `head_sha` retourné par GitHub, mais ne
   lie pas avec la même exigence les autres champs de provenance tels que
   `mergedCommit` et le commit de dépôt déclaré. Un run authentique peut ainsi
   être associé à des métadonnées de provenance incohérentes.

2. La vérification de l’URL accepte un préfixe au lieu d’exiger l’égalité
   normalisée exacte avec l’URL du run retournée par l’API. Une URL suffixée
   peut donc être acceptée.

3. Le test négatif étranger cumule plusieurs différences à la fois. Il ne
   démontre pas indépendamment que chaque garde — workflow, événement, branche,
   SHA, conclusion, URL et date — casse lorsqu’elle est la seule valeur
   falsifiée.

**Correction minimale exigée :**

- lier tous les champs de commit de provenance au `head_sha` authentifié, avec
  une règle explicite si un préfixe court est autorisé ;
- exiger l’égalité exacte de l’URL après normalisation ;
- ajouter un test négatif indépendant pour chaque champ ;
- produire un nouveau roll post-merge avec ce vérificateur corrigé.

---

## `P0-LS-18` — REFUSÉ

**Réserve : le run est vivant, mais le commit dit « mergé » n’est pas lui-même
authentifié par l’API avec la même force que `runCommit`.**

Ce point demande précisément que les vues soient recalculées sur le commit
mergé. Tant que `mergedCommit` peut diverger du `head_sha` du run authentifié
sans faire échouer le vérificateur, la condition spécifique de ce point n’est
pas établie de façon fail-closed.

Les corrections requises sont celles de `P0-LS-16`, suivies d’un nouveau roll
post-merge.

---

## `P0-V3-14` — REFUSÉ

**Réserve : la chaîne documentaire existe, mais elle incorpore encore un
contrôle d’attestation incomplet.**

Les générateurs, le drift-check, le validateur et le test de substitution
existent. Toutefois, le proof revendique une chaîne complète comprenant
l’authentification de l’attestation. Les lacunes de `P0-LS-16` empêchent de
signer l’ensemble comme chaîne cohérente et reproductible.

La signature pourra être réexaminée après correction du vérificateur,
tests négatifs unitaires par champ et nouveau run post-merge.

---

## `P0-LS-13` — REFUSÉ

**Réserve : le HAR constitue une vraie amélioration, mais l’artefact, son
README et le script de capture ne forment pas encore une preuve fail-closed et
cohérente.**

Éléments positifs vérifiés :

- un HAR unique contient les deux navigations Gallery puis Pricing ;
- les deux navigations principales sont enregistrées en HTTP 200 ;
- des empreintes caviardées de cookies sont utilisées ;
- les DOM du run sont hashés ;
- aucune valeur de cookie sensible n’est publiée en clair.

Blocages restants :

1. Les nombres et horaires décrits dans le README ne correspondent pas
   exactement à l’artefact final examiné : le texte annonce notamment un
   nombre d’entrées différent de celui du HAR. Une preuve générée ne doit pas
   conserver de métriques éditoriales divergentes.

2. Le script de capture intercepte certaines erreurs de navigation, les
   journalise puis poursuit l’exécution. Il peut donc produire un DOM ou un HAR
   après une navigation échouée au lieu de sortir en erreur.

3. Le booléen de liaison de cookie peut être vrai lorsque les deux empreintes
   comparées sont absentes. L’égalité de deux valeurs nulles ne prouve pas
   qu’un cookie a été transporté.

4. Le nouveau dossier démontre une session donnée, mais ne rattache pas de
   manière complète chacune des observations tarifaires historiques à son
   artefact primaire. Le point porte encore sur la contextualisation et les
   divergences du registre, pas seulement sur l’existence d’une session
   récente.

**Correction minimale exigée :**

- générer le README et le proof directement depuis le manifeste final ;
- faire échouer la capture sur erreur de navigation, statut non 200 ou URL
  finale inattendue ;
- exiger deux empreintes non nulles avant de conclure
  `sameValueCarried: true` ;
- ajouter les tests négatifs correspondants ;
- rattacher explicitement la session HAR à l’observation concernée et
  conserver une provenance honnête pour chacune des autres observations.

---

## `P0-A2-09` — REFUSÉ

**Réserve : les résultats live sont plausibles, mais `repro.sh` reste capable
de finir sans avoir reproduit correctement les trois chemins.**

Les défauts antérieurs suivants sont bien corrigés :

- les trois chemins ne sont plus de simples commentaires ;
- le Dockerfile copie le bon fichier ;
- le paquet contient un vrai refus GKE 403 ;
- le workflow GitHub vérifie les lectures autorisées de façon plus stricte.

Le reproducer conserve néanmoins plusieurs comportements non fail-closed :

1. L’absence de `gh` ne fait pas nécessairement échouer le scénario GitHub :
   le script peut continuer en imprimant une commande manuelle.

2. Après le dispatch du workflow, le script attend puis sélectionne le run le
   plus récent au lieu de conserver l’identifiant exact du run déclenché. Un
   autre run concurrent peut être lu par erreur.

3. Le négatif GKE accepte comme succès tout statut différent de 200. Un échec
   réseau `000`, un `404` ou un `5xx` ne prouve pas un refus IAM attendu.

4. Aucun cleanup trap global n’est installé immédiatement après la création
   du projet. Une erreur intermédiaire peut laisser des ressources et des coûts
   actifs.

**Correction minimale exigée :**

- rendre `gh` obligatoire avant tout provisioning ;
- récupérer et suivre l’identifiant exact du workflow dispatché ;
- exiger précisément un refus IAM attendu, par exemple 401 ou 403, avec
  contenu de réponse contrôlé ;
- installer un trap de teardown dès la première ressource créée ;
- rejouer les trois chemins après ces corrections et archiver le nouveau run.

---

## `P0-V3-03` — SIGNÉ

La preuve ancre les constantes utilisées à une source GCP archivée et hashée :

- maximum de 300 dossiers enfants ;
- quota de création de dossiers à 0,1 requête par seconde ;
- profondeur maximale documentée de dix niveaux.

Le script d’ancrage vérifie les citations exactes et doit échouer si elles
disparaissent. Ces constantes soutiennent la conclusion selon laquelle un
folder par tenant ne constitue pas une stratégie scalable à grande échelle.

**Portée de la signature :** validation des limites et de leur conséquence
architecturale au moment de l’archive ; pas garantie que les quotas GCP ne
changeront jamais.

---

## `P0-V4-3` — SIGNÉ

Le point repose sur les mêmes limites autoritatives que `P0-V3-03` et sur un
calcul de capacité cohérent. La déduplication est explicitement documentée.

**Portée de la signature :** identique à `P0-V3-03`.

---

## `P0-LS-03` — REFUSÉ

**Réserve : le vérificateur et l’index sont présents, mais la commande annoncée
n’a pas été rejouée dans un environnement équivalent et son exécution n’est pas
ancrée à un job CI officiel du point.**

L’inspection statique montre que le script :

- énumère les fichiers attendus ;
- recalcule les SHA-256 ;
- détecte les fichiers absents et les dérives ;
- compare les compteurs ;
- doit sortir avec un code non nul en cas d’écart.

L’index annonce 71 fichiers, dont les 21 fichiers `*.links.txt`.

Cependant, la règle de revue demande de rejouer une commande de reproduction
lorsqu’elle est fournie. Le checkout complet et ses dépendances n’étaient pas
disponibles dans l’environnement du relecteur, et le clonage a échoué sur la
résolution DNS. Je ne remplace donc pas l’exécution par une simple lecture du
script.

**Correction minimale exigée :**

- câbler explicitement
  `node scripts/parity/verify-livescan-hashes.mjs --check`
  dans un job CI officiel vert au commit soumis, ou joindre la sortie brute
  d’une exécution traçable à ce commit ;
- joindre aussi le test négatif où un fichier ou un hash est modifié et où le
  job devient rouge.

---

# B. CONTRATS

## `CTR-OPERATIONS-DR` — REFUSÉ

**Décision : le drill Cloud SQL individuel est recevable, mais le contrat DR
complet ne l’est pas encore.**

Éléments positifs :

- failover et failback Cloud SQL réellement joués ;
- fenêtres d’indisponibilité mesurées ;
- écritures acquittées retrouvées ;
- correction du monitoring persistée ;
- exercices PITR, snapshot/restore et perte de zone documentés.

Réserves bloquant la signature du contrat :

1. Des obligations centrales sont encore marquées `BLOCKED` ou `UNTESTED` :
   SLO web, snapshots planifiés, astreinte outillée, SLI par requête,
   réplication cross-région et autres dépendances opérationnelles.

2. Les 13 min 06 s mesurent la restauration et la validation d’un clone, pas
   un RTO applicatif complet incluant bascule de configuration, rollout,
   vérification de santé et retour utilisateur.

3. La preuve disque porte sur l’empreinte du marqueur vérifié, pas sur une
   comparaison bit-à-bit de l’intégralité pertinente du volume.

4. Le dossier consolidé annonce 276/276 probes, tandis que la trace primaire
   examinée en rapporte 270/270. Le chiffre normatif doit être régénéré depuis
   l’artefact brut, sans transcription manuelle.

**Conclusion :** enregistrer le drill failover/failback comme preuve
individuelle acceptée, mais ne pas écrire le reviewer du contrat tant que ses
obligations normatives restent ouvertes.

---

## `CTR-RUNTIME-NIX` — REFUSÉ

**Réserve : l’implémentation améliore le lock et les générations, mais ne
prouve pas encore un lock immuable et un enforcement complet sur tous les
chemins.**

Blocages observés :

1. `generationRef` demeure optionnel et peut entraîner la sélection de la
   génération active. Le même lock peut donc résoudre vers une génération
   différente sans modification du fichier, ce qui affaiblit son caractère
   réellement pinné.

2. Le chemin de rollback par digest ne transporte pas clairement le pin de
   génération associé au release original. Un rollback peut donc être évalué
   contre la génération active courante plutôt que contre celle de la release.

3. La validation du lock vérifie notamment la génération et la révision Nix,
   mais ne lie pas encore exhaustivement les noms de bundles, store paths et
   hashes au catalogue signé.

4. La preuve E2E live « Publish avec lock révoqué → refus » est explicitement
   encore bloquée par le CD post-merge.

**Correction minimale exigée :**

- rendre le pin de génération obligatoire pour tout lock publiable ;
- persister et réutiliser ce pin dans chaque release et rollback ;
- valider l’intégralité des bundles/store paths/hashes contre le catalogue ;
- jouer le négatif live de révocation avant signature du contrat.

---

# C. FACTURATION — PR #39

## Correctif grand livre — ACCEPTÉ À PORTÉE LIMITÉE

L’inspection du correctif soutient les quatre remédiations ciblées :

1. transition d’état de réservation et écritures de settlement regroupées dans
   une transaction DB ;
2. contrôle du hard limit sous verrou, avec nouvelle vérification de la clé
   idempotente après acquisition du verrou ;
3. validation de l’existence, de l’organisation et de la devise des comptes
   avant écriture ;
4. compensation dérivée des écritures de settlement persistées, sans
   ventilation fiscale refournie librement par l’appelant.

**Portée :** ces quatre défauts de code sont considérés corrigés. Cette décision
ne signe pas à elle seule `CTR-BILLING-LEDGER`, ne garantit pas tous les
parcours de facturation et ne vaut pas preuve d’exploitation production.

---

## Correctif Import/billing — REFUSÉ

**Réserve : une course subsiste entre récupération d’une réservation orpheline,
reaper d’expiration et attache du job.**

Interleaving possible :

1. le reaper sélectionne une réservation `ACTIVE` expirée ;
2. un retry la ravive et étend son expiration ;
3. le reaper applique ensuite son passage à `EXPIRED` sans comparer la version
   ou l’ancienne expiration sélectionnée ;
4. le retry crée le job ;
5. `attachJob` peut attacher ce job à une réservation désormais `EXPIRED`,
   car son prédicat ne requiert pas explicitement `status: ACTIVE`.

Le settlement peut alors échouer après la création du job, ou le job peut
poursuivre sans hold actif.

**Correction minimale exigée :**

- inclure `expiresAt <= now` ou une version dans le compare-and-set du reaper ;
- sérialiser la séquence revive/reap par verrou ou version ;
- exiger `status: ACTIVE` et la bonne génération/version dans `attachJob` ;
- ajouter un test concurrent reproduisant exactement cet interleaving.

---

# D. PURGE DE COMPTE

## PR #43 — purge DB — REFUSÉE

Réserves :

1. Les abonnements actifs d’une organisation dont l’utilisateur est seul
   propriétaire ne sont pas nécessairement annulés avant la purge. Une
   suppression de compte ne doit pas laisser une facturation future orpheline.

2. L’écriture de la preuve d’effacement dans l’audit et la tombstone finale ne
   sont pas atomiques. Un crash entre les deux peut laisser un compte purgé
   sans preuve durable complète.

3. La classification « organisation partagée ou non » n’est pas sérialisée
   avec les changements de membership. Une course avec un ajout/retrait de
   membre peut modifier la décision de suppression.

4. Des champs susceptibles de contenir des données personnelles restent dans
   `EmailDeliveryEvent` et dans les métadonnées d’audit, alors que la preuve
   annonce une anonymisation plus large.

**Correction minimale exigée :**

- traiter explicitement la cessation ou le transfert de facturation ;
- rendre preuve et tombstone atomiques, ou utiliser une state machine
  récupérable ;
- verrouiller les memberships concernés ;
- fournir une matrice champ par champ des données retenues, supprimées et
  anonymisées, avec tests sur les payloads libres.

---

## PR #47 — purge physique — REFUSÉE

Réserves :

1. Les écritures ne sont pas gelées pendant l’effacement externe. Des objets
   GCS ou ressources workspace peuvent être recréés après la vérification mais
   avant la tombstone.

2. Le code peut se fier à l’état DB `DELETED` alors que les suppressions
   Kubernetes utilisent des résultats partiels. Un PVC peut survivre malgré un
   état logique supprimé.

3. La purge vise principalement le workspace attribué à l’utilisateur supprimé
   et ne démontre pas l’effacement exhaustif des ressources utilisateur
   dispersées dans des organisations partagées ou des workspaces collaborateurs.

4. La preuve physique annoncée utilise des adaptateurs mémoire de test ; elle
   ne constitue pas une preuve d’effacement sur de vrais GCS et Kubernetes.

**Correction minimale exigée :**

- poser une barrière d’écriture avant l’effacement ;
- exiger et vérifier la disparition réelle de chaque objet/PVC ;
- inventorier les ressources par sujet de données, pas seulement par
  `workspaceId` principal ;
- jouer un E2E sur un bucket et un cluster de test réels, avec preuve avant/après.

---

# E. CONSÉQUENCE POUR LES PR

Aucun feu vert global ne peut être donné aux branches qui mélangent les
éléments ci-dessus :

- **PR #40 :** les deux points Gallery sont signables, les trois points
  d’attestation sont refusés ;
- **PR #48 :** les deux points de limites GCP sont signables, tandis que
  `P0-LS-13` et `P0-LS-03` restent refusés ;
- **PR #39 :** le correctif grand livre est accepté dans sa portée ciblée, mais
  le correctif Import/billing reste refusé ;
- **PR #36, #43, #45 et #47 :** pas de signature de contrat ou de lot complet
  selon les réserves ci-dessus ;
- **PR #46 :** `P0-A2-09` reste refusé tant que le reproducer n’est pas
  fail-closed.

Les éléments acceptés peuvent être isolés dans des commits ou PR séparés. Ne
pas convertir en `CLOSED` ou `SIGNED` les éléments refusés.

---

# LIMITES DE REPRODUCTION

Les fichiers publics, diffs, scripts, métadonnées, artefacts et résultats de CI
accessibles ont été ouverts et comparés aux affirmations du dossier.

Le checkout complet du dépôt, ses `node_modules`, les accès GCP et les secrets
GitHub n’étaient pas disponibles dans l’environnement local de revue. Une
tentative d’accès Git depuis le conteneur a échoué sur la résolution DNS. Je
n’affirme donc pas avoir rejoué localement les commandes qui exigent ces
éléments.

Cette limite est la raison directe du refus de `P0-LS-03`. Pour les autres
points, les refus reposent sur des défauts observables dans les scripts,
artefacts ou contrats eux-mêmes, et non uniquement sur l’absence
d’environnement local.

---

# RÉPONSE À ENVOYER À L’AGENT

> Revue V3 terminée. Je signe uniquement `P0-V4-1`, `P0-V4-2`,
> `P0-V3-03` et `P0-V4-3`.
>
> Je refuse `P0-LS-16`, `P0-LS-18` et `P0-V3-14` parce que le roll
> post-merge est réel mais que le vérificateur ne lie pas encore tous les
> commits de provenance au `head_sha`, accepte l’URL par préfixe et ne teste
> pas indépendamment chaque garde.
>
> Je refuse `P0-LS-13` : le HAR est utile, mais le README diverge de
> l’artefact, la capture peut continuer après erreur de navigation et la
> liaison cookie peut être vraie avec deux hashes absents.
>
> Je refuse `P0-A2-09` : le reproducer WIF peut continuer sans `gh`, sélectionner
> le mauvais run, accepter tout non-200 comme négatif GKE et laisser des
> ressources sans cleanup trap.
>
> Je refuse `P0-LS-03` tant que la commande de vérification des 71 fichiers
> n’est pas reliée à un job CI officiel vert ou fournie avec une trace
> d’exécution et son test négatif au commit soumis.
>
> `CTR-OPERATIONS-DR` reste refusé comme contrat entier, même si le drill
> failover/failback Cloud SQL individuel est recevable. `CTR-RUNTIME-NIX`
> reste refusé jusqu’au pin obligatoire, au rollback sur la génération
> originale, à la validation complète du catalogue et au négatif live de
> révocation.
>
> Dans la PR #39, j’accepte uniquement la correction ciblée du grand livre.
> Le correctif Import/billing reste refusé à cause de la course
> revive/reaper/attach.
>
> Les PR #43 et #47 restent refusées pour les réserves de facturation,
> atomicité, concurrence, barrière d’écriture et preuve physique réelle.
>
> Ne marque `CLOSED` ou `SIGNED` que les quatre P0 explicitement acceptés.

---

# SOURCES EXAMINÉES

- Dossier soumis : `DOSSIER_EXPERT_V3_20260722.md`
- Dépôt : https://github.com/openaxcloud/vibecore
- PR #36 : https://github.com/openaxcloud/vibecore/pull/36
- PR #39 : https://github.com/openaxcloud/vibecore/pull/39
- PR #40 : https://github.com/openaxcloud/vibecore/pull/40
- PR #42 : https://github.com/openaxcloud/vibecore/pull/42
- PR #43 : https://github.com/openaxcloud/vibecore/pull/43
- PR #45 : https://github.com/openaxcloud/vibecore/pull/45
- PR #46 : https://github.com/openaxcloud/vibecore/pull/46
- PR #47 : https://github.com/openaxcloud/vibecore/pull/47
- PR #48 : https://github.com/openaxcloud/vibecore/pull/48
