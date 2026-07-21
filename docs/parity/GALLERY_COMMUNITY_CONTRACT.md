# GALLERY_COMMUNITY_CONTRACT — Gallery & Community (audit v4 F)

contractId: CTR-GALLERY-COMMUNITY
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED (« hash obsolète + décision ouverte ») — les DEUX motifs sont levés et SIGNÉS en resoumission (P0-LS-04/A2-10 CLOSED, reçu RR-20260720-CODEX-02) ; hash 1f5f27bc… rejoué ; re-soumission du contrat requise
implementationAnchor: "Curation admin + remix sécurisé MERGÉS en prod (7bd91bcf) ; licence FAIL-CLOSED en prod (#25, 7e001f3d) ; preuve écran CI run 29747404378"

## Préconditions
- P-GAL-1 : un listing n'existe QUE par curation admin (aucun self-publish in-product — DEC-GALLERY-NO-SELF-PUBLISH, DECIDED) ; il épingle un snapshot IMMUABLE.
- P-GAL-2 : FAIL-CLOSED — non-remixable par défaut ; remixable = licence explicite + confirmation des droits + politique PII acceptée (codes 400 REMIX_LICENSE_REQUIRED / REMIX_RIGHTS_CONFIRMATION_REQUIRED).

## Invariants
- I-GAL-1 : le remix clone le SNAPSHOT épinglé, jamais la source vivante.
- I-GAL-2 : lecture publique, remix authentifié, consentement explicite versionné (checkbox + 400 serveur sans acceptation).
- I-GAL-3 : toute stat publique citée provient d'un artefact rendu HASHÉ présent en repo (plus jamais une valeur périmée — leçon V4-1/V4-2).

## Tests négatifs (existants)
- non-admin crée un listing → refus ; snapshot d'un autre projet → 400 ; remix sans consentement → 400 ; remixAllowed=false → 403 ; sans licence en base → 403 (défense en profondeur) ; slug dupliqué → 409.

## Compatibilité
- Aucune migration de listings réels (curation naissante) ; rétroactif fail-closed appliqué (mig 0077).

## Résultat de signature
- v1 : REFUSED (RR-20260720-CODEX-01). v2 : PENDING_REVIEW — motifs de refus levés et signés par ailleurs (reçu -02) ; signature du CONTRAT à re-obtenir.

Ce contrat sépare STRICTEMENT ce qui est **CONFIRMÉ** (observé+rendu+hashé sur
replit.com le 2026-07-16) de ce qui est **UNKNOWN** (non observable de
l'extérieur). On ne suppose JAMAIS un comportement interne depuis la surface
publique. Sources : `SRC-GALLERY-RENDERED` (sha256 1f5f27bc…, re-vérifié 20/07),
`SRC-GALLERY-DETAIL`, `SRC-COMMUNITY-RENDERED` (sha256 e9b562a2…) — voir
`SOURCE_REGISTRY.yaml`. Décision produit associée : `DEC-GALLERY-NO-SELF-PUBLISH`
(`DECISION_REGISTRY.yaml`).

## A. CONFIRMÉ — capacités observées sur le rendu public

Chaque ligne est adossée à un fait rendu/hashé, pas à une déduction.

| capacité | preuve rendue | claimId |
|---|---|---|
| Parcourir la galerie (grille d'apps + auteurs) | `/gallery` rendu, cartes + auteurs | RPL-17 |
| Recherche | champ + « 82 Results » | RPL-17 |
| Catégories (~22) | liste de catégories rendue | RPL-17 |
| Page détail d'une app | `/gallery/work/…` rendu | RPL-17 |
| Stats publiques par app | « 20,653 » vues (liste) / « 20,649 » vues + « Used 79 times » (détail) — compteurs vivants | RPL-17 |
| Ouvrir l'app (View App) | lien sortant vers l'app déployée | RPL-17 |
| Utiliser comme template / Remix | CTA « Use Template » / Remix | RPL-17 |
| Auteurs / Community Profiles | profils publics liés, page community rendue | RPL-19 |
| Signaler (Report) | affordance Trust & Safety | RPL-18 |
| Soumettre une app = **formulaire EXTERNE** | « Submit your App » → `form.typeform.com/to/yVYAWg79` | RPL-17 |

**Fait structurant** : la soumission passe par un **Typeform externe** =
**intake humaine curée**, PAS un self-service. C'est la base de
`DEC-GALLERY-NO-SELF-PUBLISH` : un bouton « Publish to Gallery » self-service
dans l'IDE serait un **DÉPASSEMENT de parité**, pas de la parité. Décision
E-CODE : soit assumer le coût de modération, soit ne pas le faire — mais ne
jamais le présenter comme « parité Replit ».

## B. UNKNOWN — non observable depuis la surface publique

Traçés SÉPARÉMENT. Aucun de ces points ne doit apparaître comme « CONFIRMED »
tant qu'une source vérifiable n'existe pas. Chacun a une entrée dans
`UNKNOWN_REGISTRY.yaml`.

| inconnu | pourquoi non observable | unknownId |
|---|---|---|
| Publish / Unpublish self-service **dans l'IDE** | nécessite un compte auteur + parcours interne non rendu | UNK-GALLERY-SELF-PUBLISH |
| Preview embarquée **dans la carte** (vs lien sortant) | le rendu ne montre qu'un lien, pas d'iframe live confirmée | UNK-GALLERY-EMBED-PREVIEW |
| Workflow interne de revue / sanctions / appels | back-office, jamais exposé publiquement | UNK-GALLERY-REVIEW-WORKFLOW |
| Licence / attribution du remix | pas de mention de licence sur le rendu détail | UNK-GALLERY-REMIX-LICENSE |

## Invariants

- I-GAL-1 : une capacité ne passe `CONFIRMED` que si elle est adossée à une
  source rendue+hashée dans `SOURCE_REGISTRY.yaml` (pas de déduction depuis
  « Replit doit sûrement… »).
- I-GAL-2 : tout comportement interne (publish self-service, review, sanctions,
  licence remix) reste `UNKNOWN` jusqu'à source vérifiable — il ne se
  transforme jamais en `CONFIRMED` par ressemblance.
- I-GAL-3 : self-service Publish = décision E-CODE explicite
  (`DEC-GALLERY-NO-SELF-PUBLISH`), jamais un acquis de parité.

## C. E-CODE IMPLEMENTATION (TPL-02) — « on l'a construit », distinct de « Replit le fait »

**États TPL-02** — 📤 Dispatché ✅ · 💻 Codé ✅ (`266fefac`/`e6afdfbf`/`c59674e8`/
`3181b31f`, 23 tests + build strict verts) · ✅ **Testé live** (prod, 2026-07-17) :
curation admin → browse anonyme → détail (vues comptées 0→3) → **remix → clone dans
l'org du remixeur, RemixJob COMPLETED épinglé `sourceSnapshotId`+`sourceListingId`**,
clone = 7 fichiers du snapshot épinglé, `secrets:[]` (DB-absent live), `useCount=1` ;
rendu UI grille + détail (desktop + mobile). Preuves : `docs/deploy-evidence/2026-07-17-gallery/`.
**Reste** : le clic-connecté « Remix » → IDE en navigateur (handoff Chrome d'Avi, comme
PUBLISH-UI-01) ; secret-absent fichiers+DB+job exhaustif = test `gallery-routes.spec.ts`.


Ce qui suit est CODÉ chez E-Code (commits `266fefac`/`e6afdfbf`/`c59674e8`/
`3181b31f`). Chaque ligne dit explicitement si notre implémentation **rejoint une
capacité CONFIRMÉE** (§A, adossée au rendu Replit) ou si c'est une **DÉCISION
E-CODE** dont le pendant Replit reste **UNKNOWN** (§B). On n'écrit jamais
« comme Replit » sur un mécanisme interne qu'on n'a pas observé.

| ce qu'on a construit | surface | statut parité |
|---|---|---|
| Browse (grille DB) + auteur + stats publiques | `GET /gallery`, `/gallery` (web) | **rejoint CONFIRMÉ** RPL-17 |
| Recherche + catégories (facettes) | `GET /gallery?category=&q=` | **rejoint CONFIRMÉ** RPL-17 |
| Page détail par app | `GET /gallery/:slug`, `/gallery/:slug` (web) | **rejoint CONFIRMÉ** RPL-17 |
| « View App » (lien sortant) | `appUrl` → `_blank rel=noopener` | **rejoint CONFIRMÉ** RPL-17 (lien sortant, PAS une preview embarquée) |
| Remix / Use Template (CTA → clone → IDE) | `POST /gallery/:slug/remix` | **rejoint CONFIRMÉ** RPL-17 (le CTA existe) ; la **licence/attribution** du remix reste `UNK-GALLERY-REMIX-LICENSE` |
| Report (Trust & Safety) | affordance mailto trust-safety | **rejoint CONFIRMÉ** RPL-18 (l'affordance) ; le **workflow review/sanctions/appels** reste `UNK-GALLERY-REVIEW-WORKFLOW` |
| Stats « Used N times » = compteur de remix | `useCount++` au remix | **DÉCISION E-CODE** : Replit affiche la stat (CONFIRMÉ) mais l'assiette exacte du compteur n'est pas observable → notre choix (uses == remix), pas une parité prouvée |
| **Pin de release immuable** au remix (`sourceSnapshotId`) + secrets détachés | `runSecureRemixClone` | **DÉCISION E-CODE** (notre modèle de repro + sécurité). Non observable chez Replit → ne se présente pas comme parité |
| **Curation = admin, pas self-service** | `POST /admin/gallery-listings` (platform-admin) | **DÉCISION E-CODE** conforme à `DEC-GALLERY-NO-SELF-PUBLISH`. On n'a construit QUE l'étape « créer un listing » ; le workflow d'intake/review complet reste `UNK-GALLERY-REVIEW-WORKFLOW` |

**Ce qu'on n'a PAS construit (reste UNKNOWN, inchangé)** :
- `UNK-GALLERY-SELF-PUBLISH` — pas de bouton « Publish to Gallery » self-service (choix assumé).
- `UNK-GALLERY-EMBED-PREVIEW` — la fiche ne montre PAS de preview live embarquée ; seulement le lien sortant « View App » (fidèle au rendu Replit observé).
- `UNK-GALLERY-REVIEW-WORKFLOW` — pas de back-office review/sanctions/appels ; seulement l'affordance Report + la création de listing par un admin.
- `UNK-GALLERY-REMIX-LICENSE` — aucune licence/attribution de remix par défaut affichée.

**Invariant de sécurité prouvé (test)** : le remix depuis la galerie détache les
secrets AVANT le clone et re-scanne le clone ; une valeur de secret n'apparaît ni
dans les fichiers, ni en base, ni dans le job du clone — et le clone reproduit le
**snapshot épinglé** (V1), pas une édition ultérieure de la source (V2). Voir
`services/api/src/tests/gallery-routes.spec.ts` (I-RMX-1/2 + I-GAL-PIN).
