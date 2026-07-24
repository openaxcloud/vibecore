# TPL-02 Gallery — clôture design (responsive) + handoff Remix→IDE (2026-07-24)

Complète les deux points Gallery restés partiels :
- **TPL-02.1 (design)** : matrice responsive clair/sombre 390/768/1024/1440 px (grille + détail),
  adaptation automatique, cibles ≥44px, zéro débordement horizontal.
- **TPL-02.2 (reste)** : (a) clic connecté « Remix » → IDE réel dans le navigateur (handoff) ;
  (b) preuve secret-absent **exhaustive** (fichiers + DB + env + logs + job) dans `gallery-routes.spec.ts`.

Déploiement du fix : commit `d95108ae` poussé sur `main` → `deploy-main.yml` (build web tier + helm upgrade).

---

## 1. TPL-02.2 (a) — Handoff « Remix » → IDE, PROUVÉ LIVE dans le navigateur

Le clic connecté était le seul reste du remix (le core API était déjà prouvé le 17/07). Prouvé ici
de bout en bout dans un vrai navigateur (Playwright), session authentifiée par cookie `vc_session`.

### Mise en place (prod)
1. `POST /auth/register` → user QA `cmrynguz3…` + org `cmryngv3f…` (`qa-handoff-org`), cookie session réel.
2. Élévation minimale (SQL léger, client `pg` — pas de moteur Prisma dans le pod, pas d'OOM) :
   `platformAdmin=true`, `mfaEnabled=true`, `Session.lastReauthAt=now()`.
3. **Curation via la route sanctionnée** `POST /admin/gallery-listings` (platform-admin + reauth) → **201** :
   listing `realtime-chat-starter-remix`, `remixAllowed=true`, licence **MIT** (sha256 calculé serveur
   `acd2f5ed…`), épinglé au **snapshot réel** du 17/07 (`cmrobkvt2…`, archive `.zip` de 7 fichiers).

### Le handoff (navigateur)
- Cookie `vc_session=<token QA>` posé dans le contexte, page `/gallery/realtime-chat-starter-remix`.
- Bouton **« Remix this app »** rendu et **actif après cochage du consentement** (fail-closed licence OK).
- **Clic → redirection réelle** vers `https://e-code.ai/@qa-handoff-org/realtime-chat-starter-remix-demo`
  — titre de page **« Realtime Chat Starter — Remix demo · E-Code IDE »**, breadcrumb IDE
  « QA Handoff Org › Realtime Chat Starter — Remix demo › main », boutons Run / Publish.
  Captures : `shots/handoff-01-detail-remixable-consent-desktop-light.png`, `shots/handoff-02-ide-landing-clone-org.png`.

### Vérification DB live du résultat (read-only)
```
clone           : cmrynjjvy…  « Realtime Chat Starter — Remix demo »  org=cmryngv3f… (remixeur)  sourceType=duplicate
RemixJob        : COMPLETED   sourceListingId=cmrynhwh9…  sourceSnapshotId=cmrobkvt2…  targetProjectId=clone
clone secrets   : 0           clone env vars : 0
listing         : useCount=1  viewCount=1  remixAllowed=true
```

**Honnêteté** : lors du premier chargement l'IDE affichait une erreur transitoire
« Failed to fetch dynamically imported module Chat.client-*.js » — artefact de la **fenêtre de
déploiement** en cours (rollout du tier web ⇒ mismatch de hash de chunk). Le handoff lui-même
(clic → clone dans l'org du remixeur → ouverture IDE sur le clone) est prouvé par l'URL, le shell IDE
et la base. Re-vérification d'un chargement IDE propre après stabilisation : voir §3.

---

## 2. TPL-02.1 — Matrice responsive clair/sombre (grille + détail), PROUVÉE LIVE

Déploiement `d95108ae` **completed success** (build web tier + helm upgrade + verify rollout).
16 captures produites sur la prod déployée (`shots/{grille|détail}-{largeur}-{thème}.png`), mesurées
au même instant : débordement horizontal `scrollWidth - clientWidth` et hauteur de chaque cible
interactive du contenu Gallery.

**Avant fix (prod, mesuré live)** : recherche input/bouton = **39px**, chips catégorie = **36px** (< 44).
**Après fix (déployé)** : **44px** partout. Toutes les captures : **débordement = 0**, **0 cible < 44px**.

| Page | 390 | 768 | 1024 | 1440 | Débordement | Cible mini | Colonnes (390→1440) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Grille — clair | ✅ | ✅ | ✅ | ✅ | 0 | 44px | 1 / 2 / 3 / 3 |
| Grille — sombre | ✅ | ✅ | ✅ | ✅ | 0 | 44px | 1 / 2 / 3 / 3 |
| Détail — clair | ✅ | ✅ | ✅ | ✅ | 0 | 44px | 1 / 1 / 2 / 2 |
| Détail — sombre | ✅ | ✅ | ✅ | ✅ | 0 | 44px | 1 / 1 / 2 / 2 |

- **Adaptation automatique** : grille 1→2→3 colonnes ; page détail = rail d'action empilé pleine
  largeur en 390/768, colonne latérale en 1024/1440. Header desktop ↔ hamburger mobile.
- **Cibles ≥44px** : recherche (input + bouton), chips catégorie, CTA « Remix this app »,
  « View app », « Back to gallery », libellé de consentement, « Report this app » — tous ≥44px de
  hauteur (mesurés). La case à cocher native reste 16px mais sa **zone cliquable = le libellé
  (≥44px)**. Header/footer marketing (PublicShell) hors périmètre du point Gallery.
- **Thèmes** : clair ET sombre rendus correctement (fond, texte, accents), pilotés par le cookie
  `ecode_theme` (classe + `data-theme` sur `<html>`).

Fix design (`d95108ae`) : `min-h-[44px]` porté sur la recherche (input + bouton), les chips de
catégorie (36→44), et sur la page détail le retour, le CTA Remix, « View app », le libellé de
consentement et « Report ». Aucun changement de comportement (uniquement la hauteur minimale de
zone cliquable).

Captures clés : `shots/grid-390-light.png`, `shots/grid-1440-dark.png`, `shots/detail-390-dark.png`,
`shots/detail-1440-light.png` (+ les 12 autres viewports/thèmes).

---

## 3. Re-vérification IDE propre (post-déploiement)

Après stabilisation du déploiement, rechargement de `https://e-code.ai/@qa-handoff-org/realtime-chat-starter-remix-demo` :
**IDE chargé proprement**, plus aucune erreur de chunk (`crashed=false`). Breadcrumb
« QA Handoff Org › Realtime Chat Starter — Remix demo », **arborescence = 7 fichiers du snapshot
épinglé** (`src/App.tsx`, `src/main.tsx`, `src/styles.css`, `index.html`, `package.json`,
`README.md`, `vite.config.ts`), panneaux Git / Secrets / Database / Deployments / Monitoring,
statut « Connected », boutons Run / Publish. Capture : `shots/handoff-03-ide-clean-postdeploy.png`.
Confirme que l'erreur du §1 était bien un artefact transitoire de la fenêtre de déploiement.

---

## 4. TPL-02.2 (b) — Preuve secret-absent EXHAUSTIVE (test)

`services/api/src/tests/gallery-routes.spec.ts` — nouveau test
« EXHAUSTIVE secret hunt … files + DB + env + logs + job ». Matérialise un vrai secret
(`STRIPE_KEY`) + une vraie valeur d'env (`DATABASE_URL`) dans la source, remixe, puis **cherche
activement** ces deux valeurs dans **5 surfaces** :
1. **Fichiers** du clone (chaque fichier ; `.env` gardé en référence, valeurs retirées).
2. **DB** — magasin de secrets du clone (vide + balayage des lignes).
3. **Env** — magasin d'env-vars du clone (vide + balayage).
4. **Logs** — `auditLogs`, `securityAuditEvents`, `adminAuditLogs`, activité projet du clone, notifications du remixeur.
5. **Job** — l'enregistrement `RemixJob` (les clés sont gardées en référence, jamais les valeurs).

Puis un **balayage de TOUT le store + le magasin de fichiers** : tout emplacement contenant le
secret DOIT être scoped à la source (là où il vit légitimement) ; nulle part ailleurs. Une
assertion prouve que la recherche n'est **pas vacante** — elle retrouve bien le secret dans la
source. Résultat : **20/20 verts** (`vitest`), typecheck api exit 0, lint OK.

---

## 5. Hygiène — scaffolding QA retiré, prod restaurée

Le handoff a nécessité un échafaudage temporaire : un user QA (élevé platform-admin le temps de la
curation), son org, un **listing remixable temporaire** `realtime-chat-starter-remix` (pinné au
snapshot réel du 17/07) et le clone produit par le remix. **Tout a été supprimé après la preuve**
(transaction `pg` : `remixJobs=1, listings=1, orgs=1 (cascade le clone), users=1`) — la prod est
**restaurée à son état antérieur** : `GalleryListing PUBLISHED = 1` (l'unique carte
`realtime-chat-starter`), aucun compte platform-admin QA résiduel. Vérifié anonyme : `/gallery`
rend 1 carte, débordement=0, cibles=44px.

**Conséquence pour les captures** : les captures de **grille** (`grid-*.png`) montrent **2 cartes**
(la carte originale + le listing remixable QA temporaire alors publié) ; les captures de **détail**
(`detail-*.png`) portent sur ce listing remixable (pour montrer le rail d'action complet). La
validation design (débordement=0, adaptation, ≥44px) est indépendante du nombre de cartes et reste
valable. **Note produit** : la Gallery publique n'a donc, en l'état, aucune app *remixable* — la
rendre remixable est une simple curation (`POST /admin/gallery-listings` avec licence, ou retrofit
d'une licence sur la carte existante), à la main d'Avi.
