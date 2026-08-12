# TPL-02.6 / BUG-REMIX-001 — rejeu LIVE du masquage PII au remix

**Date** : 2026-08-12 · **Verdict** : PASS · **Environnement** : env de test
dédié à l'audit (`vibecore-audit-test-20260807`), jamais la production.

Ce dossier lève la réserve inscrite dans `REPLIT_PARITY.md` (TPL-02.6) et
`BUG_INVENTORY_LIVE.md` (BUG-REMIX-001) : « ✅ Testé live à ne cocher qu'après
rejeu d'un remix réel post-déploiement ».

---

## 1. Substrat — pourquoi ce build est recevable

Le build déployé n'est pas un ancêtre de `origin/main` (l'environnement est
partagé avec une autre session qui y déploie sa branche). Ce qui est donc
vérifié, c'est l'identité du **code effectivement exécuté** :

| Fichier | Build déployé | `origin/main` | |
|---|---|---|---|
| `services/api/src/remix-pipeline.ts` | `ffda34f1cf09bad8…` | `ffda34f1cf09bad8…` | **byte-identique** |
| `services/api/src/remix-pii-metrics.ts` | `77d10ba550225c88…` | `77d10ba550225c88…` | **byte-identique** |

Vérifié pour les **deux** builds qui ont servi pendant la campagne
(`3a537e9a`, puis `82603d55` après rollout). De plus,
`git diff <build> origin/main -- services/api/src/app.ts` ne contient
**aucune** ligne `remix|gallery|maskPii|sanitizePii` (compte = 0) : le chemin
de remix exécuté est celui de `main`.

Le run final ci-joint a été servi par un substrat **stable et unique** :

```
europe-west9-docker.pkg.dev/vibecore-audit-test-20260807/vibecore-audit-containers/api
  @sha256:3e5bb2b94d70c9108b695c569850a4a68465d7971049fdf82ac98b0f2c7dbf86
```
(les 2 réplicas api servaient ce même digest pendant le run)

Correctif d'origine : `022f23fc` (PR #89, merge `7aa677ff`),
`git merge-base --is-ancestor 022f23fc origin/main` = vrai.

## 2. Scénario réellement exécuté

Tout passe par l'API publique de l'environnement de test, avec de vraies
sessions en base (aucun mock, aucune injection en base des résultats) :

1. **Auteur** crée un projet (`POST /orgs/:orgId/projects`).
2. **Auteur** y écrit 3 fichiers porteurs de PII via un **vrai import zip**
   (`POST /projects/:id/files/import/zip`) : `src/billing/customer.ts`,
   `docs/mandat-sepa.md`, `fixtures/payouts.json`.
3. **Auteur** fige un **snapshot immuable** (`POST /projects/:id/snapshots`).
4. **Platform admin** (MFA/step-up : `lastReauthAt` récent) cure le listing
   (`POST /admin/gallery-listings`) — `remixAllowed`, licence MIT,
   `rightsConfirmed`, `piiPolicyAccepted`, et **`piiConsentVersion`
   volontairement absent** : sans consentement de l'auteur, tout remix DOIT
   masquer.
5. **Un AUTRE utilisateur** remixe (`POST /gallery/:slug/remix`,
   `acceptLicense: true`) → **HTTP 201**, `piiMaskedCount = 9`.
6. Relecture des **octets réellement clonés**.

Charge utile : IBAN FR (27 caractères, registre ISO 13616) sous ses **deux**
formes réelles — compacte `FR7630006000011234567890189` et groupée
`FR76 3000 6000 0112 3456 7890 189` — plus email, téléphone, carte et nom.

## 3. Le piège écarté : une preuve vacante

Un premier passage lisait `GET /projects/:id/files`. Cette route passe par
`publicFiles()`, **qui supprime le contenu** (`path`/`updatedAt`/`sizeBytes`
seulement) : l'assertion « aucune fuite » passait au vert sur des chaînes
**vides**, sans rien prouver. La preuve retenue lit donc les **vrais octets**
via `GET /projects/:id/export/zip` (archive base64 décompressée).

Deux garde-fous rendent le résultat non-vacant :

- **Contrôle positif** — l'IBAN est bien **en clair dans le projet source**
  (les deux formes), donc la fixture porte réellement la PII ;
- **Détecteur exercé** — le **même** scanner de fragments trouve **10/10**
  fragments dans le source (dont `189`, `890189`, `7890189`) : il détecte
  réellement, il n'est pas aveugle.

## 4. Résultat

| Corpus | Fragments d'IBAN trouvés |
|---|---|
| Projet **source** (auteur) | **10 / 10** |
| Projet **cloné** (remixeur) | **0 / 10** |

Fragments testés : IBAN compact, IBAN groupé, chacun des groupes `3000`,
`6000`, `0112`, `3456`, `7890`, **`189`**, `890189`, `7890189`.

`189` est **le défaut exact de BUG-REMIX-001** — le dernier groupe qui restait
en clair. Il est absent du clone.

Contenu cloné, tel que relu (extrait de `live-run.txt`) :

```
// Fiche client de démonstration — données personnelles réalistes.
export const customer = {
  email: '[PII:email masked on remix]',
  phone: '[PII:phone masked on remix]',
  iban: '[PII:iban masked on remix]',
  card: '[PII:card masked on remix]',
};
```

```
# Mandat de prélèvement SEPA

Titulaire : Claire Dupont
IBAN : [PII:iban masked on remix]
Contact : [PII:email masked on remix] / [PII:phone masked on remix]
```

Email et carte sont également absents en clair (`emailStillClear: false`,
`cardStillClear: false`).

Identifiants du run final :

| | |
|---|---|
| Projet source | `cmspqndb0000y0nfzo6x9vhr9` |
| Snapshot épinglé | `cmspqnev300160ncqv8v0v4ge` |
| Listing | `tpl026-pii-1786517929` |
| Projet cloné | `cmspqnfg8001c0ncqmqlxkc19` |
| `piiMaskedCount` | 9 |

## 5. Rejouabilité

`replay.py` est le script exact du run (aucune retouche). Il se rejoue avec
`API=<api de l'env> ACTORS=<json des acteurs mintés>`. Les acteurs sont créés
par `mint.mts`, exécuté dans le pod api contre la vraie base.

## 6. Portée honnête

- Prouvé : le **contrat serveur** du masquage PII au remix, sur données
  réelles, bout-en-bout, avec contrôle positif et détecteur exercé.
- **Non** prouvé ici : le parcours **navigateur** (clic « Remix » depuis la
  Gallery rendue). Ce handoff clic-connecté est déjà prouvé séparément par
  TPL-02.2 (24/07). Le point ajouté ici est le masquage des octets clonés.
- Non prouvé ici : les codes pays hors registre ISO 13616 (règle R4 : non
  masqués, comptés et journalisés) — couvert par les tests unitaires 73/73.
