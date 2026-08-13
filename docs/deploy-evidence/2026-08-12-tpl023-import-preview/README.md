# TPL-02.3 — aperçu par connecteur : ce qui est prouvé live, et ce qui ne l'est pas

**Date** : 2026-08-12 · **Environnement** : env de test dédié à l'audit
(`vibecore-audit-test-20260807`), jamais la production.

**Mise à jour 2026-08-13 — le point est clos.** Le défaut qui bloquait
(BUG-IMPORT-001) est corrigé dans ses deux moitiés, le parcours complet est
prouvé en API (17/17) ET dans un vrai navigateur, et le secret est absent des
octets du projet créé. Le §3 ci-dessous garde la trace du défaut tel qu'il a
été trouvé — c'est lui qui explique pourquoi le câblage avait d'abord été
retiré.

---

## 1. Ce qui a été construit et déployé

Images construites depuis un export propre du commit `1c091dc51e` et poussées
dans le registre du projet de test, puis déployées sur le cluster d'audit :

```
europe-west9-docker.pkg.dev/vibecore-audit-test-20260807/vibecore-audit-containers/api:1c091dc51e
europe-west9-docker.pkg.dev/vibecore-audit-test-20260807/vibecore-audit-containers/web:1c091dc51e
```

Deux écarts assumés dans la config de build, propres à cet environnement :

- les étapes **cosign** sont retirées — la clé KMS `ecode-supply-chain` n'existe
  que dans le projet de production ; les laisser aurait fait échouer le build ;
- `_VITE_RUNTIME_API_BASE_URL` est surchargé vers l'API de test. Sans cet
  override, l'URL de l'API de **production** est inlinée dans le bundle au build
  (piège documenté au §7 du runbook) et l'app de test appellerait la prod.

## 2. Prouvé LIVE contre l'API réelle

Rejeu : `replay.py` (script exact, sortie dans `live-run.txt`).

Contrôle de non-vacuité d'abord : on vérifie que le secret est réellement
présent dans la charge envoyée, sinon « aucune fuite » ne prouverait rien.

| # | Vérification | Résultat |
|---|---|---|
| 1 | `POST /orgs/:orgId/imports` renvoie la liste des fichiers stagés | ✅ `[{".env", 67}, {"README.md", 11}, {"src/index.js", 18}]` |
| 2 | l'aperçu ne porte **aucun contenu** ni aucun secret | ✅ |
| 3 | `GET` rejoue le même aperçu, **stable** entre deux lectures | ✅ |
| 4 | la lecture **n'avance pas** la machine à états | ✅ `AWAITING_USER_ACTION` inchangé |
| 5 | détections **recalculées** (l'écran ne peut pas afficher « propre » pendant que la porte bloque) | ✅ 1 détection, `requiresConsent=true` |
| 6 | commit **sans** décision → refusé | ✅ **409 `IMPORT_UNRESOLVED_FINDINGS`** |
| 7 | commit **avec** décision → projet créé, secret masqué | ❌ **bloqué par BUG-IMPORT-001** |

## 3. Le défaut trouvé — et pourquoi il change les conclusions

L'étape 7 a répondu **409 `IMPORT_STAGING_GONE`**. Ce n'est pas un défaut de
l'aperçu : les fichiers stagés vivaient dans une `Map` **en mémoire du
processus** API, et l'API tourne en **2 réplicas**. La requête suivante tombe
sur un autre pod, qui ne connaît pas ce staging.

Mesuré, pas déduit — 8 lectures consécutives du **même** import stagé :

```
['preview', 'preview', 'NULL', 'preview', 'preview', 'NULL', 'NULL', 'preview']
```

5 aperçus, 3 vides, en round-robin. Le défaut était **latent** : aucune UI
n'empruntait ce flux, donc personne ne le voyait.

**Correctif livré** (migration `0084_import_staging_shared`) : la copie jetable
passe en base, visible par tous les réplicas, remise à NULL sur chaque sortie
terminale.

**Reste ouvert** : une fois le staging partagé, le commit cross-réplica échoue
pour une **seconde** raison — `ImportCreditLedger` est lui aussi en mémoire du
processus, d'où `BILLING_RESERVATION_MISSING`. Détail complet et suivi :
`BUG-IMPORT-001` dans `BUG_INVENTORY_LIVE.md`.

## 4. Décision du 12/08 : le câblage avait été retiré (revenu depuis)

Un commit intermédiaire faisait passer `/import-zip` — qui sert **5 des 12
tuiles** du hub (ZIP, Bolt, Lovable, Base44, export d'agent précédent) — par le
flux de staging, afin que l'écran d'aperçu soit réellement atteignable.

Livré en l'état, il aurait cassé 5 connecteurs qui fonctionnent aujourd'hui,
environ une fois sur deux. Le câblage avait donc été **retiré** le 12/08 ;
`/import-zip` reprenait son chemin direct éprouvé.

**Le 13/08, la cause a été supprimée** (registre de crédits persisté, migration
`0085`) et le câblage a été **rétabli** — voir §6. Le retrait temporaire reste
consigné ici parce qu'il explique le va-et-vient dans l'historique git.

## 5. Restauration de l'environnement (passe du 12/08)

L'environnement est partagé avec une autre session. Les images qui y tournaient
avant la passe du 12/08 ont été relevées puis **restaurées** à l'identique :

```
api = …/api:82603d55f7
web = …/web:c3636dad2b
```

---

## 6. Clôture — 2026-08-13

Substrat : `api:91aff568ad` + `web:a1e893abe2`, migrations `0084` + `0085`
appliquées sur la base de l'environnement de test.

### Contrat d'API — 17/17 (`live-run.txt`)

Le point qui échouait (étape 7) passe désormais, et la robustesse
multi-réplicas est vérifiée explicitement :

```
8 lectures consécutives -> ['preview' × 8]      (avant : 5 aperçus / 3 vides)
commit SANS décision  -> 409 IMPORT_UNRESOLVED_FINDINGS
commit AVEC décision  -> 201, redacted=1
octets du projet      -> API_SECRET masqué, secret brut absent
après commit          -> preview=null, state=COMMITTED,
                         reservation={SETTLED, reserved 3, debited 3}
```

### Parcours navigateur (`browser-walkthrough.txt`)

Connexion par le vrai formulaire, dépôt d'une archive sur
`/import-zip?source=base44`, redirection vers l'écran d'aperçu rendu
**intégralement en français**, décision par détection, puis IDE du projet créé.
Les octets relus confirment le masquage.

### Ce que la campagne a coûté en défauts trouvés

Aucun de ces trois n'était visible en lisant le code — les trois viennent
d'avoir essayé de prouver en réel :

| # | Défaut | Comment il s'est montré |
|---|---|---|
| 1 | staging en mémoire du processus, API en 2 réplicas | 8 lectures → 5 aperçus / 3 vides |
| 2 | registre de crédits idem | commit cross-réplica en `BILLING_RESERVATION_MISSING` |
| 3 | clé d'idempotence indexée **globalement** alors qu'elle vient du client | 2 orgs, même clé → une seule réservation partagée |

Plus deux défauts d'affichage attrapés au navigateur : l'écran lisait la
mauvaise forme de payload (crash sur `.length`), et « Skip to content » partait
en anglais dans toute la zone authentifiée.

### Environnement partagé

Une autre session déploie sur le même environnement et a écrasé mes images à
deux reprises pendant la campagne (`api:1c68880b39`, `web:df1287d856`). Ses
images ont été relevées avant chaque déploiement et restaurées après.
