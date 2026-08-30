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
