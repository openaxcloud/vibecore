# Compatibilité / migration des versions de manifeste — CTR-PROJECT-MANIFEST-SCHEMA

Répond à la réserve v2 du relecteur : « aucune preuve de compatibilité/migration de
versions de manifest n'est jointe ».

## Les deux champs de version (à ne pas confondre)

| Champ | Porté par | Valeur courante | Rôle |
|---|---|---|---|
| `manifestVersion` | **l'instance** (chaque manifeste de projet) | entier ≥ 1 | version déclarée par le manifeste lui-même (`type: integer, minimum: 1` dans le schéma) |
| `x-contractVersion` / `x-schemaVersion` | **le schéma** (`docs/parity/PROJECT_MANIFEST_SCHEMA.json`) | 3 | version du contrat de validation (v1 laxiste → v2 durcie → v3 = v2 + tests négatifs rejouables + ce dossier compat) |

## Matrice d'acceptation (schéma v3, telle qu'EXÉCUTÉE par le validateur)

| `manifestVersion` de l'instance | Accepté par le schéma v3 ? | Preuve rejouable |
|---|---|---|
| 0 (ou < 1) | **NON** — `minimum: 1` | `invalid/manifestversion-zero.json` (rejeté, motif `minimum`) |
| 1 (plus ancienne supportée) | **OUI** | `valid/compat-oldest-supported.json` (passe encore) |
| 2 | OUI | même forme que v1/v3 (aucune règle conditionnelle par version) |
| 3 (courante) | OUI | `valid/minimal.json`, `valid/complete.json`, `valid/mobile-app-single.json` |
| ≥ 4 (future) | OUI (syntaxiquement) | ⚠️ voir « Limite honnête » ci-dessous |

Ces preuves sont rejouées à chaque CI par
`scripts/parity/validate-project-manifest-samples.mjs` (workflow
`.github/workflows/parity-registries.yml`, job `validate`).

## Exemple de manifeste ancienne version (manifestVersion = 1)

```json
{
  "manifestVersion": 1,
  "projectId": "prj_compat_v1_sample",
  "artifacts": [
    { "artifactId": "art_web_legacy", "kind": "WEB_APP", "sourceRoot": "apps/web" }
  ]
}
```

(fixture réel : `valid/compat-oldest-supported.json` — DOIT passer, vérifié en CI.)

## Règle de migration écrite (v1 → v3)

1. **Le noyau requis n'a jamais changé** : `manifestVersion`, `projectId`,
   `artifacts[].{artifactId, kind, sourceRoot}` sont identiques depuis v1. Un
   manifeste v1 qui n'utilise que les champs documentés passe le schéma v3 **sans
   transformation** (preuve : fixture ci-dessus).
2. **Ce que v2/v3 ont durci, ce sont les REJETS, pas la forme** :
   `additionalProperties: false` (racine, artifact, component), `minLength: 1`,
   `minItems: 1`, `maxItems: 7`, ≤ 1 `MOBILE_APP` exécutable (`maxContains: 1`).
   Un manifeste ancien portant des propriétés non documentées (extensions
   sauvages) est désormais **rejeté** — règle de migration : supprimer les
   propriétés inconnues ou les faire entrer au contrat par revue (jamais de
   passe-droit runtime). Un manifeste ancien avec > 1 `MOBILE_APP` n'a jamais été
   légitime (plan §5) : migration = scinder en projets distincts.
3. **Aucune migration de données automatique n'est nécessaire ni fournie** pour
   v1 → v3 : la forme acceptée est un sous-ensemble strict, pas un renommage.

## Limite honnête + proposition (à trancher par revue)

Le schéma **a** un champ de version d'instance (`manifestVersion`) mais **aucune
règle conditionnelle par version** : toute valeur ≥ 1 (y compris une future
version 4, 5, …) est validée contre la même forme v3 et passe silencieusement.
Le schéma ne borne pas non plus le haut (`maximum` absent).

Proposition (NON appliquée au schéma — v3 ne change aucune règle de validation,
à trancher par revue) : ajouter `"maximum": 3` sur `manifestVersion` (rejet
explicite des versions futures inconnues), ou des branches `if/then` par version
le jour où la forme diverge réellement.
