# GALLERY_COMMUNITY_CONTRACT — Gallery & Community (audit v4 F)

schemaVersion: 1
repoCommit: 57ab0a67d068e5dad0faea5166ac4d18c1713f03

Ce contrat sépare STRICTEMENT ce qui est **CONFIRMÉ** (observé+rendu+hashé sur
replit.com le 2026-07-16) de ce qui est **UNKNOWN** (non observable de
l'extérieur). On ne suppose JAMAIS un comportement interne depuis la surface
publique. Sources : `SRC-GALLERY-RENDERED` (sha256 fad9ec75…),
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
| Stats publiques par app | « Views 20,650 », « Used 79 times » | RPL-17 |
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
