# P0-V3-05 — correction des 3 réserves du bloque-lancement

**Date** : 2026-08-04 · **PR** : #77 · **Statut du point** : reste **OPEN** (signature expert)

Les 3 réserves corrigées ici sont celles que j'avais moi-même levées dans l'audit du
2026-08-03 (`docs/deploy-evidence/2026-08-03-v305-remix-live/`). Elles étaient réelles :
le lot précédent prouvait « une licence a été déclarée et acceptée », pas « la licence
autorise la dérivation », et laissait les noms de personnes traverser le clone.

---

## Réserve #2 — masquage des NOMS DE PERSONNES

**Avant** : aucun matcher. Le clone produit par l'e2e contenait encore `Jane Doe`.

**Difficulté réelle** : un nom n'a pas de forme lexicale distinctive. `Jane Doe` et
`Meridian Supply` sont indiscernables hors contexte ; un regex « deux mots capitalisés »
masquerait la moitié de n'importe quel code source. Le masquage se fait donc sur **signal
structurel**, jamais sur de la prose :

| Signal | Masqué ? |
|---|---|
| clé personnelle explicite (`firstName`, `lastName`, `nom`, `prenom`, `contactName`…) | ✅ |
| colonne CSV `name` **accompagnée** d'une colonne personnelle (`email`/`phone`/`iban`/adresse) | ✅ |
| colonne CSV `name` dans un catalogue (`name,price,stock`) | ❌ laissé intact |
| `"name"` de `package.json`, prose d'un README, `displayName` d'UI | ❌ laissé intact |
| valeurs non-nom sous une clé personnelle (`{{first}}`, `admin`, `user_1`, vide) | ❌ laissé intact |

`displayName` est **volontairement exclu** : c'est massivement un libellé d'interface.

**Le re-scan n'est plus une tautologie de façade** : masquage et vérification partagent
littéralement la même fonction (`rewritePersonNames`), donc ils ne peuvent pas diverger.
Cela ne corrige pas la limite de fond (réserve #4 : le re-scan ne peut pas détecter une
catégorie inconnue des matchers) — cette limite reste déclarée.

**Biais assumé** : sur signal structurel on masque aussi une raison sociale
(`contactName: "Acme Corp"`). Sur-masquer une entreprise coûte infiniment moins cher que
laisser fuiter le nom d'une personne.

## Réserve #7 — allowlist SPDX des licences réellement dérivables

**Avant** : `licenseId` était `z.string().max(64)`. Un curateur pouvait publier
`licenseId: "PROPRIETARY — NO DERIVATIVES"` avec `remixAllowed: true` : **tous les gates
passaient**. C'était le trou juridique du bloque-lancement.

**Après** : `services/api/src/license-policy.ts` — allowlist de 33 identifiants SPDX qui
accordent réellement le droit de produire des œuvres dérivées (permissives + copyleft +
CC autorisant les dérivées). **FAIL-CLOSED** : tout le reste est refusé, y compris un SPDX
valide mais non listé, un `LicenseRef-*` ou une faute de frappe.

- **On ne devine jamais une version ambiguë** : `GPL-3.0` nu (indécidable entre `-only` et
  `-or-later`) est **refusé**. Deviner l'intention juridique de l'auteur est exactement ce
  qu'on refuse de faire.
- **Choix produit assumé** : les variantes **NonCommercial** (`CC-BY-NC-*`) sont refusées.
  Elles autorisent la dérivation, mais E-Code est une plateforme commerciale. C'est une
  décision, pas une lecture du texte de licence — elle est écrite dans le module.
- **Enforcement en deux points** : curation (`400 REMIX_LICENSE_NOT_DERIVATIVE`) **et**
  remix (`403`, défense en profondeur pour toute ligne créée avant l'allowlist ou écrite
  directement en base).
- **L'identifiant canonique est persisté**, jamais la saisie brute : `apache 2.0` → `Apache-2.0`.

## Réserve #8 — trace auditable des confirmations

**Avant** : `rightsConfirmed` / `piiPolicyAccepted` étaient validés par la route puis
**jetés** — ni colonne, ni métadonnée d'audit. La confirmation des droits par le curateur
était inauditable a posteriori.

**Après** : migration **0081** — `rightsConfirmedAt/By` + `piiPolicyAcceptedAt/By`
(horodatage + `userId` de l'admin qui a curé), persistés **et** recopiés dans l'événement
d'audit `admin.gallery_listing.create`. Un listing non-remixable ne porte aucune trace.

### Sûreté prod de la migration (vérifiée AVANT déploiement)

4 colonnes nullables (pas de réécriture de table) + une clause rétroactive qui referme les
listings à licence non dérivable. Cette clause a été **rejouée en SELECT sur la base de
prod** : voir `migration-0081-dryrun.txt` — **0 ligne impactée** (les 14 listings
remixables de prod sont en MIT, qui est dans l'allowlist). No-op sur l'existant.

---

## Ce qui est prouvé, et comment

- **1327 tests verts** sur `services/api`, dont **9** pour l'allowlist SPDX, **6** pour le
  masquage des noms, **6** au niveau route (refus SPDX à la curation et au remix,
  normalisation canonique, persistance des confirmations, absence de trace si non-remixable).
- **Build strict** `services/api` : 0 erreur.
- **Le test route ET l'e2e cherchent désormais les 5 catégories dans le clone réel** —
  `name`, `email`, `phone`, `iban`, `card` — et **échouent à les trouver**, avec assertion
  de **non-vacuité** (texte non vide + les 5 marqueurs présents), plus une non-régression
  qui vérifie qu'un catalogue produit (`Desk Lamp`) traverse le remix **intact**.

## Ce qui N'EST PAS corrigé (réserves qui restent ouvertes)

Les 6 autres réserves de l'audit du 03/08 sont **inchangées** et restent déclarées :

3. Hors périmètre du masquage : IP, NIR/passeport, adresses postales, dates de naissance,
   téléphones au format national, **fichiers binaires**, **chemins de fichiers**.
4. Le re-scan résiduel ne peut pas détecter une catégorie de PII inconnue des matchers.
5. `POST /projects/:id/remix` ne masque rien (`sanitizePii: false`, même org) — et
   `requireProject` accepte aussi un **collaborateur** non-membre de l'org.
6. `piiConsentVersion` désactive tout le masquage sans vérifier le consentement réel.
9. `Production E2E` ne se déclenche pas sur push `main`.

Et une limite propre à ce lot : le masquage des noms **ne couvre pas la prose**. Un nom
cité dans un commentaire ou un README n'est pas masqué — c'est un choix délibéré, pas un
oubli, mais il doit être connu de l'expert.

---

# Preuve LIVE PROD exécutée le 2026-08-04 (image `api:e41821f377`)

Transcript complet : `live-prod-transcript.txt` · fouille du clone : `live-clone-scan-e41821f377.txt`

| Réserve | Preuve live | Résultat |
|---|---|---|
| #7 licence non dérivable | `POST /admin/gallery-listings` `licenseId="PROPRIETARY — NO DERIVATIVES"` | **400 `REMIX_LICENSE_NOT_DERIVATIVE`** |
| #7 licence dérivable | même route, `licenseId="mit"` | **201**, persisté **`MIT`** (canonique) |
| #8 trace auditable | relecture SQL de la ligne après curation | `rightsConfirmedAt/By` + `piiPolicyAcceptedAt/By` **renseignés**, acteur = userId admin |
| #2 masquage | remix réel puis fouille du clone | **201**, `piiMaskedCount=5`, **les 5 catégories ABSENTES** |

Le clone curé, verbatim :

```
data/products.csv  | name,price,stock
data/products.csv  | Desk Lamp,4200,7          <- catalogue produit INTACT
seed/customers.csv | name,email,phone,iban,card
seed/customers.csv | [PII:name masked on remix],[PII:email masked on remix],[PII:phone masked on remix],[PII:iban masked on remix] 189,[PII:card masked on remix]
```

## Exposition publique : 6 secondes, sans PII

Contrainte tenue : **aucun listing porteur de PII n'a été laissé dans la gallery publique.**
Le listing a été curé en `PENDING_REVIEW` (invisible), publié **6 secondes** le temps de
l'appel de remix, puis dépublié. Les métadonnées publiques (titre, description, licence)
n'ont jamais contenu de PII — celle-ci n'existe que dans le snapshot source, ce que le
masquage neutralise précisément. La PII utilisée est **synthétique**.

## Défaut trouvé PENDANT la preuve

L'extrait verbatim ci-dessus le montre : `[PII:iban masked on remix] **189**`. Le dernier
groupe de l'IBAN français (3 caractères, pas 4) **survivait**. L'IBAN complet était bien
introuvable — la recherche de chaîne passait — mais **seule la lecture du contenu curé** a
révélé le fragment. Un masqueur qui laisse des résidus ne tiendra pas devant un expert.

Corrigé (branche `fix/iban-trailing-group`) : `IBAN_RE` consomme désormais un groupe
terminal de 1 à 3 caractères précédé d'une espace. Ajouté : 2 tests unitaires couvrant
5 formats nationaux (FR/DE/GB/NL/ES) et une assertion **anti-résidu** au niveau route et e2e.
**Ce correctif n'est pas encore déployé en prod** au moment où ces lignes sont écrites.

## Leçon de méthode

Chercher les chaînes exactes ne suffit pas : il faut **relire le contenu curé**. La fouille
disait « les 5 catégories sont absentes » et c'était vrai ; le fragment d'IBAN n'apparaissait
que dans l'extrait verbatim. Les assertions anti-résidu ajoutées ferment cet angle mort.

---

# Refus expert du correctif IBAN (#89) — corrigé en v3

## Le refus était fondé

Rejeu ciblé de l'expert : `ES91 2100 0418 4502 0005 1332 EUR`. Reproduit sur le code de #89 :

```
"ES91 2100 0418 4502 0005 1332 EUR"      -> "[MASK]"            <- « EUR » DÉTRUIT
"FR76 3000 6000 0112 3456 7890 189 EUR"  -> "[MASK] EUR"
```

`ES` fait **24 caractères**, atteints pile après `1332`. Le groupe optionnel
`(?:\s?[A-Z0-9]{1,3})?` de la v2 avalait alors ` EUR`. Ce n'est plus une fuite de PII
mais une **corruption des données voisines** — plus insidieux, car silencieux.

## Pourquoi aucune regex générique ne peut marcher

Un IBAN **n'est pas auto-délimitant** : c'est une suite d'alphanumériques dont seule la
**longueur nationale** dit où elle s'arrête. Deux tentatives, deux échecs symétriques :

| version | motif du groupe final | défaut |
|---|---|---|
| v1 | `[A-Z0-9]{0,3}` (collé) | `FR76 … 189` : fragment terminal **laissé en clair** |
| v2 | `(?:\s?[A-Z0-9]{1,3})?` | `ES91 … 1332 EUR` : **avale** les données voisines |

Trop court → fuite. Trop long → corruption. Il n'existe pas de réglage intermédiaire :
il faut **lire le code pays**.

## v3 — détection par longueur de registre

1. **Code pays** lu sur les 2 lettres initiales.
2. **Longueur nationale exacte** depuis `IBAN_LENGTH_BY_COUNTRY` — table **ISO 13616-1 /
   Swift IBAN Registry**, `Object.freeze`, avec provenance et date
   (`IBAN_REGISTRY_PROVENANCE`, figée le 2026-08-04). Pays absent → **jamais masqué**
   (fail-open assumé : mieux vaut ne pas masquer que corrompre).
3. **Correspondance normalisé ↔ original** : `ibanSpans()` consomme exactement N
   alphanumériques en franchissant les espaces internes (y compris **insécables**), et
   rend les bornes `[start, end)` dans le **texte d'origine**.
4. **Masquage de la plage exacte** — ni plus, ni moins. Un séparateur n'est jamais
   consommé en fin ; la borne droite refuse de couper au milieu d'un jeton.
5. **Checksum ISO 7064 MOD-97-10** (`ibanChecksumValid`) pour écarter les sosies.

## Rejeu — 14/14

`replay-iban-expert.ts` (sortie complète : `replay-iban-expert-output.txt`) :

```
OK    REFUS EXPERT — EUR doit survivre
        in  "ES91 2100 0418 4502 0005 1332 EUR"
        out "[PII:iban masked on remix] EUR"
...
14/14 cas conformes
```

Couverture : devises EUR/USD/GBP/CHF adjacentes · colonnes CSV · tabulation ·
ponctuation · **deux IBAN dans la même phrase** · espaces **insécables** · forme
**compacte** · et 4 sosies non masqués (checksum faux, pays inconnu, jeton
alphanumérique, chaîne plus longue que la longueur nationale).

Tests unitaires : 10 formats nationaux (NO 15 → MT/SC 31), plages sur le texte original,
provenance de la table, gel de l'objet.

## Contrepartie DÉCLARÉE

Le contrôle MOD-97 est ce qui permet de ne pas masquer un sosie — mais **un IBAN
comportant une faute de frappe échappe au masquage**. C'est un arbitrage explicite,
pas un oubli : sans checksum, tout jeton de la bonne longueur commençant par un code
pays valide serait masqué, ce que le test « sosie » interdit.
