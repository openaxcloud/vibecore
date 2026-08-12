# TPL-02.3 — aperçu par connecteur : ce qui est prouvé live, et ce qui ne l'est pas

**Date** : 2026-08-12 · **Environnement** : env de test dédié à l'audit
(`vibecore-audit-test-20260807`), jamais la production.

Verdict honnête : le **contrat d'aperçu** est prouvé live jusqu'à la porte de
commit. Le **parcours complet** ne l'est pas, parce que la campagne a mis au
jour un défaut qui le bloque — voir §3.

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

## 4. Décision : le câblage n'est pas livré

Un commit intermédiaire faisait passer `/import-zip` — qui sert **5 des 12
tuiles** du hub (ZIP, Bolt, Lovable, Base44, export d'agent précédent) — par le
flux de staging, afin que l'écran d'aperçu soit réellement atteignable.

Livré en l'état, il aurait cassé 5 connecteurs qui fonctionnent aujourd'hui,
environ une fois sur deux. Le câblage a donc été **retiré** ; `/import-zip`
reprend son chemin direct éprouvé. L'écran et le contrat d'API restent en
place, prêts à être câblés dès que le registre de crédits sera persisté.

C'est la raison pour laquelle **TPL-02.3 ne passe pas ✅** : l'écran existe,
son contrat est prouvé, mais aucun utilisateur ne peut encore l'atteindre.

## 5. Restauration de l'environnement

L'environnement est partagé avec une autre session. Les images qui y tournaient
avant cette campagne ont été relevées puis **restaurées** à l'identique :

```
api = …/api:82603d55f7
web = …/web:c3636dad2b
```
