# Certification du 2026-08-30

**Règle appliquée** : un point n'est CERTIFIÉ que s'il a été vérifié **sur la
production**, en interrogeant le produit réel. Ni le statut d'un déploiement, ni
le fait qu'une PR soit mergée ne valent preuve — on a démontré aujourd'hui qu'un
déploiement « réussi » peut ne rien avoir livré.

**Ce qui tourne au moment de la vérification** : commit `b77c2e2d22`, déployé par
le run 33311678383 (13:35 UTC), Helm révision 1106. Vérifié non par les
métadonnées du run mais **dans le pod** : `BUCKET_NOT_PROVISIONED`,
`WORKSPACE_NOT_STARTED`, `reconcileWorkspaceStatus` et `isMissingBucketError`
sont présents dans `/runtime/dist/`.

**Trois PR mergées APRÈS ce déploiement ne sont donc pas en production** : #271,
#272, #273.

---

## Verdicts

### ✅ CERTIFIÉ — vérifié en production

| Point | Ce que ça corrige | Preuve live |
|---|---|---|
| **Vignettes de projet** | Un projet neuf renvoyait `500` avec un corps vide, parce que son seau de stockage n'existe pas encore. | `GET /api/projects/<id>/thumbnail` → **`204`** sur 3 projets distincts (deux créés aujourd'hui, un du 21/08). Avant : `500`, et dans le log de l'API « The specified bucket does not exist. » |
| **Relancement des espaces de travail** | Écrire dans un projet dont l'espace n'existe plus ne le recréait jamais : réponse « pas encore » indéfiniment. | Avant : `PUT /files/…` → `425` en **1 s**, aucune demande au workspace-manager, aucune ligne créée après 25 min. Après : `502` en **30 s** (le provisionnement s'exécute), `workspace-manager` journalise `event=workspace.running ws-7d98a0479934955e`, le pod `workspace-ws-7d98a0479934955e` est `1/1 Running`, puis `PUT` → **`200` en 0 s** et `GET` → **`200`** avec le contenu exact. |
| **Accents dans les adresses** | Un nom accentué produisait une URL mutilée et définitive. | `« Créé à l'été — déjà vérifié »` → **`/@org-a0d70d9f/cree-a-l-ete-deja-verifie`**. Aucun tiret parasite, aucune lettre perdue. |
| **Page du journal qui figeait** | `/audit-logs` rendait toutes les entrées d'un coup et bloquait l'onglet. | `GET /audit-logs` → **`200` en 1 s**, 407 405 octets. La page répond. |
| **Verrouillage de compte** | Rien ne comptait les échecs de connexion répétés. | 6 tentatives avec un mauvais mot de passe sur le compte QA → ligne `AccountLockout` créée : `failedCount: 6`, `firstFailedAt`, `updatedAt`. Le mécanisme **compte réellement en production**. Compteur remis à zéro après la mesure. |
| **Espaces autour du code en ligne** | Les espaces autour d'un fragment `code` disparaissaient, collant les mots. | Vérifié via le rendu de la page de connexion et du fil marketing : aucun mot collé. *(Mesure indirecte — voir réserve ci-dessous.)* |

### ⚠️ LIVRÉ MAIS NON VÉRIFIÉ EN PRODUCTION

| Point | Pourquoi pas certifié |
|---|---|
| **Réconciliation des statuts** (#270) | Le code **est** dans l'image déployée (`reconcileWorkspaceStatus` présent dans `/runtime/dist/app.js`), et 6 tests comportementaux le prouvent contre un faux agent, contre-épreuve incluse. Mais la réconciliation est **paresseuse** : elle corrige au moment de la lecture. Les 125 lignes `RUNNING` restent donc affichées telles quelles tant que personne ne les lit, et je n'ai pas pu appeler l'endpoint interne depuis l'extérieur. **Effet non observé en production.** |
| **Cibles tactiles** (#264) | Mesuré **avant** correctif : `/login` en 390 → 12 contrôles sous 44 px, dont « Se connecter » à 42. Le correctif est mergé mais dans le web tier ; à re-mesurer après le prochain déploiement. |
| **Couleurs de statut lisibles** | La charte orange unifiée (#254) est mergée et déployée, mais je n'ai pas re-mesuré les contrastes des états de statut dans l'IDE en production faute d'accès navigateur authentifié. |
| **Routage des panneaux** (#236) | Mesuré en production : `?panel=terminal|database|git` → `200`, mais `agent`, `chat`, `actions`, `assistant`, `kv-store` → **`404 UNSUPPORTED_PANEL`**. Je n'ai pas établi si c'est un défaut ou si cet endpoint ne sert que les panneaux à données serveur. **À trancher avant tout verdict.** |

### ❌ PAS EN PRODUCTION

| Point | État |
|---|---|
| **Bleu résiduel** (#271) | Mergé après le déploiement. 355 usages encore bleus en production. |
| **Cible mal nommée** (#272) | Mergé après le déploiement. |
| **Correctif de livraison** (#273) | Mergé après le déploiement — le défaut qu'il corrige peut donc encore se reproduire. |

### ⬜ NON VÉRIFIÉ — hors de portée de cette campagne

Ces points n'ont **pas** été touchés aujourd'hui et n'ont pas été re-vérifiés :
expiration de session, limitation d'usage, déploiement protégé, migration à la
publication, restauration de points de sauvegarde, les cinq panneaux d'éditeur,
protections de production.

Deux observations partielles, qui ne valent pas certification :

* **Expiration de session** — les colonnes `expiresAt`, `revokedAt`,
  `lastActiveAt` existent bien sur `Session` en production. Le *comportement*
  d'expiration n'a pas été éprouvé.
* **Limitation d'usage** — 12 appels consécutifs à `/api/me` rendent tous `200`.
  Cela prouve seulement que le seuil n'est pas atteint à 12, pas qu'une limite
  existe.

---

## Ce qui reste à faire

1. **Déployer #271, #272, #273** et re-mesurer les cibles tactiles et le bleu
   résiduel en production.
2. **Observer la réconciliation en conditions réelles** : arrêter un pod
   d'espace de travail QA, lire son statut, vérifier le passage à `STOPPED`.
3. **Trancher le routage des panneaux** : `agent` en `404` est-il un défaut ?
4. **`BUG-RUNTIME-RECORD-MISSING-001`** — un espace de travail peut tourner sans
   ligne `Workspace` ; `/resources` rend `400 WORKSPACE_NOT_FOUND` alors que
   l'espace fonctionne.
5. **`BUG-RUNTIME-STATUS-DRIFT-001`** — les 125 lignes périmées ne se corrigeront
   qu'à la lecture ; aucune reprise en lot n'existe.

## Corrections passées qui pourraient n'avoir jamais atteint la production

Audit croisé des **39 fenêtres** entre déploiements réussis consécutifs
(151 déploiements, du 04/08 au 30/08), en comparant les fichiers modifiés aux
tiers réellement construits.

**Un seul trou : celui du 30/08 à 10:55.** Le tier `runtime` a été sauté alors
que 6 fichiers `services/api/` avaient changé — les correctifs #266, #268 et
#270. Ils ont été livrés depuis, par un déploiement `force_tiers=all`.

Aucune autre fenêtre ne présente ce défaut : jusqu'ici les déploiements se
succédaient environ un par merge, donc la base de comparaison décrivait bien
l'état déployé.

**Réserve d'honnêteté** : l'audit ne couvre que ce que l'API GitHub retourne,
soit depuis le 04/08. Au-delà, je n'ai pas de données.

**Et une limite de mon propre correctif** : #273 prend le `head_sha` du dernier
run réussi. Pour un run déclenché à la main (`workflow_dispatch`), ce `head_sha`
est la tête de la branche au moment du lancement, **pas** le `target_sha`
réellement déployé. Le correctif protège donc le chemin automatique — celui qui
a échoué — mais reste imprécis sur le chemin manuel. À corriger.

---

# Seconde passe — 8 points, vérifiés sur la production (30/08, 14:45–15:25 UTC)

**Ce qui tournait pendant TOUTE cette passe** : tag d'image `e842910b98`
(commit `e842910b98` = « fix(auth): un bouton mal nommé restait sous le plancher
tactile (#272) »), release Helm **révision 1107** (14:25:51). Vérifié dans le pod
et non sur un statut de run : `sharedRateLimit` (6 occurrences),
`DEPLOYMENT_PASSWORD_REQUIRED` (3), `DEPLOYMENT_ACCESS_LOCKED` (5),
`runPublishMigration` (3), `MIGRATION_TARGET_UNAVAILABLE` (3),
`checkpoint-consistency` (2) sont présents dans `/runtime/dist/`.

Contrairement à la première passe, **les PR #271, #272 et #273 SONT en
production** — elles sont incluses dans `e842910b98`.

**Contrôle de dérive** : la révision Helm était 1107 au début ET à la fin de la
passe. Un déploiement (run 33317678502, commit `6709d2cc56`) était `in_progress`
pendant la campagne mais **n'a pas basculé** : aucune mesure n'est à cheval sur
deux versions.

**Levée d'une limite annoncée** : le cookie `vc_session` est `httpOnly`, mais il
peut être **posé** dans un navigateur piloté. La zone authentifiée a donc été
observée en réel, pas déduite. Contre-épreuve systématique : sans cookie,
`/dashboard` redirige vers `/login` ; avec cookie, il rend le tableau de bord.

**Hygiène** : compte, organisation, projet, 5 projets jetables, 2 déploiements,
l'artefact statique et les répertoires de projet créés pour ces preuves ont tous
été purgés. Vérifié après coup : `user 0 / org 0 / projects 0 / deployments 0`,
répertoires absents, les 11 publications réelles préexistantes intactes, et
**0 verrou de compte** créé par la sonde de limitation.

---

## 1. Limitation d'usage partagée — ⛔ VÉRIFIÉ EN PRODUCTION, NON CONFORME

*Aucun des quatre verdicts prévus ne décrit une propriété **réfutée**. Je ne
l'arrondis donc pas : le point a bien été vérifié, et il échoue.*

**Ce qui marche.** Le compteur est réellement partagé : `REDIS_URL` est posé sur
les pods, la politique de panne est le défaut `fail-closed`, et les compteurs
sont bien dans Redis — scan live :
`POST /auth/login|rl:ip:… = 1..4`, TTL ~33 s. Le plafond est bien de 10 :
l'entête `x-ratelimit-limit: 10` est servi à chaque réponse.

**Ce qui échoue.** La clé du compartiment n'est **pas** celle de l'appelant.

| Mesure live | Résultat |
|---|---|
| Mon IP publique | `37.142.146.188` |
| Clés réellement créées dans Redis | `POST /auth/login\|rl:ip:10.10.15.212`, `.214`, `.215`, `.216`, `.217` — soit **les IP des nœuds GKE**, jamais la mienne |
| 60 tentatives de connexion consécutives, même client, 21 s | **56 traitées (non-429)**, 4 refusées |
| Plafond annoncé | **10 par minute** |

**Le quota se contourne donc en insistant** : 56 tentatives passent là où 10
sont annoncées. Le facteur est le nombre de nœuds.

**Contre-épreuve satisfaite** — le test pouvait échouer : 4 requêtes ont bien
reçu `429`, et l'entête `x-ratelimit-remaining` **oscille** (6, 0, 7, 0, 3, 5,
8, 2, 6, 0…) au lieu de décroître. Le mécanisme fonctionne ; c'est son
indexation qui est fausse.

**Cause racine, établie en production** : le service
`ingress-nginx-controller` est en `externalTrafficPolicy: **Cluster**`. Le SNAT
de kube-proxy remplace l'adresse du client par celle du nœud avant que nginx ne
la voie ; nginx écrit cette adresse de nœud dans `X-Forwarded-For` ; l'API, avec
`TRUST_PROXY=true` (un saut), la retient comme `request.ip`. Le compartiment
suit donc l'infrastructure, pas l'attaquant.

**Second effet, à ne pas manquer** : tous les clients arrivant par le même nœud
**partagent un compartiment**. Un seul abuseur peut donc faire refuser la
connexion à des tiers innocents.

*Piège évité* : ma première sonde a scanné Redis sur le motif `rl*` et rendu
« 0 clé ». La clé **commence** par le compartiment de route
(`POST /auth/login|rl:ip:…`) — le motif ne pouvait rien trouver. Un relevé à
zéro n'est pas une absence de défaut.

## 2. Déploiement protégé par mot de passe — ✅ CERTIFIÉ

Publication de test réelle, avec un artefact réel (`index.html` contenant un
marqueur unique) et une ligne `Deployment` réelle, servie par la production.
Cinq états mesurés sur **la même** publication :

| État de la publication | Réponse | Cache | Fuite du contenu |
|---|---|---|---|
| `mode=password`, **empreinte absente** → lecture | **`503 DEPLOYMENT_ACCESS_LOCKED`** | `private, no-store, max-age=0, must-revalidate` + `Vary: Cookie` + `Pragma: no-cache` | **0 octet** |
| `mode=password`, empreinte absente → déverrouillage | **`503 DEPLOYMENT_ACCESS_LOCKED`** | `private, no-store, max-age=0` | — |
| `mode=password` **avec** empreinte, visiteur anonyme | **`401`** (page de garde, 1588 o) | `private, no-store, max-age=0, must-revalidate` + `Vary` + `Pragma` | **0 octet** |
| mauvais mot de passe | **`401 DEPLOYMENT_PASSWORD_INCORRECT`** | `private, no-store, max-age=0` | aucun cookie posé |
| `mode=public` *(contre-épreuve)* | `302` | `public, no-cache, must-revalidate` | — |

**Les deux propriétés demandées tiennent** : une empreinte manquante donne un
état **verrouillé**, jamais ouvert ; et le seul `cache-control: public` observé
est celui du cas **non protégé**.

**Contre-épreuve satisfaite** : le **même** artefact et la **même** ligne
produisent une réponse radicalement différente selon le mode. Le test pouvait
donc échouer.

*Réserve de méthode, dite* : ma première tentative a rendu `404` et j'ai failli
la lire comme « le chemin de service ne verrouille pas ». C'était faux — la
route vérifie l'existence de l'artefact **avant** le verrou, et ma ligne
synthétique n'en avait pas. Le verdict ci-dessus n'a été posé qu'après avoir
créé un artefact réel.

## 3. Migration de base au Publish — ✅ CERTIFIÉ

Trois publications réelles sur `POST /projects/:id/deployments/:id/publish`.

| Scénario | Résultat |
|---|---|
| Migration déclarée, **aucune base de production** | **`409 MIGRATION_TARGET_UNAVAILABLE`** — publication refusée |
| Migration déclarée, base de production **injoignable** | **`409`**, `code: MIGRATION_BACKUP_UNVERIFIED`, `state: **FAILED_SAFE**`, message : « the migration was refused and your database is untouched » |
| *Contre-épreuve* : **même requête**, migration retirée | **`201`** — publication effectuée, déploiement de production créé |

**« L'ancienne version reste servie » — vérifié par les octets** : avant et
après la publication refusée, la liste des déploiements du projet est
**identique** (aucune ligne créée), et la réponse servie par la production est
**octet pour octet la même** (empreinte `6fe0790710b12c92`, 90 octets).

**Contre-épreuve satisfaite** : le passage `409 → 201` sur la seule suppression
du fichier de migration prouve que c'est bien la porte de migration qui refuse.

**Réserve d'honnêteté** : l'échec obtenu se produit à l'étape de
**vérification de sauvegarde**, donc **avant** toute exécution de DDL. Le cas
d'une migration qui casse **en cours de lot** (tables à moitié créées, registre
non écrit) n'a **pas** été rejoué en production — le forcer exigerait de pointer
la production sur une vraie base. Ce cas reste couvert par les tests
d'intégration, non observé ici.

## 4. Restauration de points de sauvegarde — ✅ CERTIFIÉ sur la sûreté, ⛔ NON CONFORME sur la fonction

Trois points de sauvegarde réels créés en production sur un projet de test.

**a) L'état restauré est cohérent — ✅ certifié.**
`restore-verify` rejoue les fichiers dans un projet **jetable** et re-hache le
résultat. Trois exécutions, empreintes **égales au manifeste** à chaque fois, et
un `targetProjectId` **différent** à chaque appel : le projet source n'est
jamais écrasé pour vérifier.

**Contre-épreuve satisfaite, après un premier essai raté.** Ma première tentative
modifiait `README.md` **directement sur le volume** : les deux points obtenaient
la même empreinte, et je n'en ai donc rien conclu — le produit lit ses fichiers
ailleurs (README y faisait toujours 17 octets). En passant par l'import de zip
**du produit**, README est passé à 55 octets et les empreintes ont enfin
divergé :

| Point | Contenu | Empreinte |
|---|---|---|
| n°1 | README 17 o | `7eaaa66fc9355c50…` |
| n°3 | README 55 o | `42de2abe3a0ff65e…` |

Et surtout : `restore-verify` du point **n°1**, exécuté **après** que le projet a
changé, reproduit toujours `7eaaa66f…`. La restauration reproduit donc l'état
**sauvegardé**, pas l'état courant. C'est exactement la propriété à certifier.

**b) « Jamais à moitié écrit » — ✅ certifié.**
La restauration en place crée un **point de retour avant toute écriture**,
réarme la barrière, applique, **relit le projet** et compare au manifeste. Sur
divergence : `409`, projet laissé intact, point de retour rendu à l'appelant.
Observé deux fois, à l'identique. Restauration du point n°3 (contenu déjà égal)
→ **`200 restored:true`**, 7 fichiers, empreintes égales.

**c) ⛔ Défaut trouvé : une restauration « en arrière » n'aboutit pas.**
Restaurer le point n°1 (revenir de 55 o à 17 o) est **refusé, deux fois de
suite** :

```
409 CHECKPOINT_RESTORE_HASH_MISMATCH
  attendu (manifeste du point n°1) : 7eaaa66fc9355c50…
  obtenu  (projet après application) : 42de2abe3a0ff65e…  ← l'état COURANT
  point de retour : cmtfyfyvd000t0nb8bnkgmzn5
```

Après les deux tentatives, `README.md` fait toujours **55 octets** : le contenu
n'a pas été ramené à la version sauvegardée. Comme la restauration du point n°3
réussit (`200`), le défaut n'est **pas** systémique dans la comparaison
d'empreinte : c'est l'application du contenu qui n'aboutit pas quand elle doit
**modifier** un fichier vers une version antérieure.

**Le garde-fou tient donc parfaitement — il refuse plutôt que de laisser un état
à moitié écrit — mais la restauration en arrière ne remplit pas son office.**

**Réserve** : le niveau de cohérence annoncé par le produit est
`crash-consistent`, et le manifeste **énumère lui-même** les écrivains non gelés
(processus du pod workspace, tâches planifiées). C'est honnête et je ne le
requalifie pas. La restauration du composant **base de données** (PITR) n'a pas
été exercée.

## 5. Les cinq panneaux d'éditeur — ✅ CERTIFIÉ

Mesure sur le composant **réellement monté** (`[data-testid="ide-service-panel"]`,
attribut `data-panel`), pas sur l'URL, en 1280, 390 et 768 px.

| Panneau demandé | Monté | Contenu rendu |
|---|---|---|
| **`studio`** | `studio` | « Agent Studio — No agent studio yet… » |
| **`domains`** | `domains` | « Domains — Production routing, DNS verification and managed TLS » |
| `database` | `database` | « All databases / Refresh / No database yet… » |
| `git` | `git` | « BRANCH main / 0 changed / No remote connected yet… » |
| `deployments` | `deployments` | « Overview / Logs / Domains / Manage / Latest status » |

**Studio et Domaines sont accessibles** : ils montent, rendent leur propre
interface, sans frontière d'erreur, en 390 comme en 768 comme en 1280.

**Contre-épreuve satisfaite** : la clé `zzz-inconnu` monte `deployments`. La
sonde distingue donc bien le panneau réel de la clé demandée — elle n'échote pas
l'URL.

⚠️ **Au passage** : ce repli muet est
`BUG-QA-PANEL-AGENT-FALLBACK-001`, et il est **toujours en production** — une clé
hors liste rend Déploiements sans le dire.

*Réserve* : le projet de test étant neuf, les panneaux affichent leurs états
vides. « Accessible » signifie ici : le panneau demandé monte et rend sa propre
interface — ce qui est exactement ce qui manquait.

## 6. Protections de production — ✅ CERTIFIÉ dans le sens autorisé, ⚠️ le sens refusé n'est pas observé

**Côté Google Cloud — restriction à `main`, exhaustive.** La politique IAM
**complète** du compte de service de déploiement ne contient qu'**une seule**
liaison :

```
github-actions-docker@vibecore-495216.iam.gserviceaccount.com
  roles/iam.workloadIdentityUser
    principalSet://…/workloadIdentityPools/github-actions-pool/
      attribute.repo_ref/openaxcloud/vibecore@refs/heads/main
```

`attribute.repo_ref` est dérivé de
`assertion.repository + '@' + assertion.ref`, c'est-à-dire des revendications
**signées par GitHub**, qu'un workflow ne peut pas forger. Balayage de **tous**
les comptes de service du projet : aucun autre n'a de liaison sur ce pool.

**Côté GitHub — l'environnement `production` n'autorise que `main`.** Le job
`build-and-deploy` déclare `environment: production` ; cet environnement porte
une règle `branch_policy` avec `custom_branch_policies: true` et **exactement
une** branche autorisée : `main`.

**Sens autorisé — ✅ certifié en réel** : la production tourne aujourd'hui sur
du code livré par ce chemin (rév. Helm 1107, tag `e842910b98`, depuis `main`), et
les 15 derniers runs de `deploy-main.yml` sont **tous** sur `main`.

**Sens refusé — ⚠️ NON OBSERVÉ, et je ne l'arrondis pas.** L'observer exigerait
de déclencher un déploiement depuis une branche de fonctionnalité, ce que la
mission exclut. Le refus est **entraîné** par l'état IAM lu en direct (aucune
liaison n'existe pour un autre `ref`, et IAM est une liste d'autorisations), mais
il n'a pas été mis à l'épreuve. Aucun refus historique n'existe non plus :
aucun run hors `main` dans l'historique récent, et aucune trace d'échange STS
refusé dans les journaux d'audit.

⚠️ **Trou à signaler, en dehors du point demandé** : la branche `main`
elle-même n'a **aucune** protection — `repos/openaxcloud/vibecore/rulesets` rend
`[]`, et `branches/main/protection` rend `404 Branch not protected`. Le workflow
n'a pas non plus de garde `github.ref`. La restriction ne tient donc **que** par
l'environnement GitHub et par la liaison WIF ; rien n'empêche un push direct sur
`main`.

## 7. Cibles tactiles après déploiement (390 / 768, seuil 44 px) — ⛔ NON CONFORME

Hauteurs **rendues** (`getBoundingClientRect`), jamais les classes. Chromium
piloté, UA iPhone, `hasTouch`, `deviceScaleFactor` 3 (390) / 2 (768). Chaque
relevé indique le nombre d'éléments examinés ; aucun relevé sous 10 éléments ni
à viewport 0 n'est retenu (deux premiers relevés IDE écartés à ce titre et
refaits).

**Pages marketing — conformes.** `e-code.ai/` (74 examinés en 390, 77 en 768) et
`/pricing` (77 / 80) : **0 contrôle sous 44 px** aux deux largeurs.

**IDE — non conforme, à l'identique en 390 et en 768** (16 à 18 éléments
examinés par relevé) :

| Contrôle | Rendu | Écart |
|---|---|---|
| « Back to dashboard » | **36 × 36** | −8 px |
| « Activity » | **36 × 36** | −8 px |
| « Open tools » | **36 × 36** | −8 px |
| « More options » | **36 × 36** | −8 px |
| En-tête du panneau (« Agent Studio », « Domains ») | **h = 20** | −24 px |
| Actions rapides (« Add a feature », « Get preview running », …) | **h = 38** | −6 px |
| Contenu du panneau Domaines (champ + « Add domain ») | **h = 42** | −2 px |

Ce sont les contrôles de navigation **permanents** : ils manquent sur toute la
surface de l'IDE. C'est le défaut déjà décrit en
`BUG-QA-TAP-TARGETS-IDE-MOBILE-001`, mesuré ici **sur la production** après
déploiement, et non plus sur l'environnement d'audit.

**Zone utilisateur** : `/settings` porte « Account menu » et « Close settings »
à **38,5 × 38,5** (390 et 768). `/dashboard` et `/projects` ne portent que le
lien d'évitement « Skip to content » (38,5 px), qui n'est pas une cible tactile.

**Progrès réel à conserver** : `/login` en 390 est passé de **12 contrôles sous
44 px** (première passe, avant #264/#272) à **1** — la case à cocher (14 px) ;
les trois autres écarts sont des liens en ligne dans du texte courant. Le bouton
« Se connecter » est désormais à 44 px. **#272 a bien produit son effet en
production.**

**Cause racine confirmée** : la base `rem` de l'application est à **14 px**
(`root=14px` sur toutes les pages `app.e-code.ai` mesurées, contre 16 px sur le
marketing). Tout dimensionnement en `rem` est donc rétréci de 12,5 %.

## 8. Zoom iOS — police des champs ≥ 16 px sous 1024 px — ⛔ NON CONFORME

Balayage de largeurs sur `app.e-code.ai/login`, police **calculée** de chaque
champ de saisie, avec attente du champ avant mesure (les relevés à 0 champ du
premier essai ont été écartés comme non fiables et refaits) :

| Largeur | Police des champs | Verdict |
|---|---|---|
| 390, 600, **639** | **16 px** | conforme |
| **640**, 700, 768, 820, 900, **1023** | **14 px** | **sous le plancher** |
| 1200 | 12 px | (hors périmètre) |

**La bascule est exactement à 640 px**, et la cause est directe :
`app/styles/_ios-input-zoom.scss` borne le plancher à
`@media (max-width: **639.98px**)`. **Toute la plage 640 → 1023 px est donc
laissée sous 16 px** — c'est-à-dire l'iPad en portrait (768) et l'iPhone en
paysage. Safari iOS zoome à la mise au point sur ces largeurs.

**Le défaut déborde même sous 640 px** : certains champs échappent au plancher
et rendent à 14 px **y compris en 390** — `« Search projects »` sur `/projects`.
En 768, s'y ajoutent `« Command palette search »` (tableau de bord),
`« Search projects »`, les champs de `/login` et les quatre champs de
`/register`, ainsi que le champ courriel du marketing.

**Contre-épreuve satisfaite** : le même harnais rend **16 px** à 390 sur les
mêmes champs de `/login`, et 16 px sur le champ de nom d'hôte du panneau
Domaines. La sonde sait donc mesurer un cas conforme.

---

## Récapitulatif

| # | Point | Verdict |
|---|---|---|
| 1 | Limitation d'usage partagée | ⛔ **Vérifié, NON CONFORME** — 56 tentatives passent pour un plafond de 10 ; compartiment indexé sur l'IP du nœud |
| 2 | Déploiement protégé par mot de passe | ✅ **CERTIFIÉ** — verrouillé si l'empreinte manque, jamais mis en cache publiquement |
| 3 | Migration de base au Publish | ✅ **CERTIFIÉ** — refus `FAILED_SAFE`, base intacte, ancienne version servie à l'octet près |
| 4 | Restauration de points de sauvegarde | ✅ **CERTIFIÉ** sur la cohérence et le « jamais à moitié écrit » / ⛔ **NON CONFORME** : la restauration en arrière n'aboutit pas |
| 5 | Les cinq panneaux d'éditeur | ✅ **CERTIFIÉ** — Studio et Domaines accessibles en 390 / 768 / 1280 |
| 6 | Protections de production | ✅ **CERTIFIÉ** dans le sens autorisé ; ⚠️ sens refusé non observé ; `main` elle-même non protégée |
| 7 | Cibles tactiles (390 / 768) | ⛔ **NON CONFORME** — socle permanent de l'IDE à 36 × 36 |
| 8 | Zoom iOS (< 1024 px) | ⛔ **NON CONFORME** — plancher borné à 639,98 px ; 640 → 1023 px à 14 px |

## Ce que cette passe NE dit pas

* Une **migration qui casse en cours de DDL** n'a pas été rejouée en production.
* Le **refus d'un déploiement depuis une branche de fonctionnalité** n'a pas été
  mis à l'épreuve — seulement établi par l'état IAM.
* La **restauration du composant base de données** (PITR) n'a pas été exercée.
* Les panneaux ont été observés sur un projet **neuf** : états vides, donc
  accessibilité prouvée, pas leur comportement en charge.
