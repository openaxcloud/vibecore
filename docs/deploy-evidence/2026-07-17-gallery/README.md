# TPL-02 Gallery/Remix — preuve LIVE prod (2026-07-17)

Déploiement : `3181b31f` (api tier) + `e6afdfbf` (web tier) — `deploy-main.yml`
**completed success**. Migration `0075_gallery_listing` appliquée par le hook Helm
pre-upgrade (`GET /gallery` répond 200 avec une table vide au premier hit).

## Parcours prouvé bout-en-bout (api.e-code.ai + e-code.ai)

Users QA réels créés via `POST /auth/register`. Source = projet réel créé par
`from-template` (7 fichiers), **snapshotté** (archive `.zip` réelle, `storageKey`
`snapshots/…/…​.zip`, 7 fichiers, 4286 o) = la **release immuable épinglée**.

### 1. Curation (admin only — pas de self-service)
`POST /admin/gallery-listings` (admin `platformAdmin=true` + reauth) → **201** :
```
{"listing":{"id":"cmrocsw2v00050ndsj275kx77","slug":"realtime-chat-starter",
 "status":"PUBLISHED","featured":true,"sourceProjectId":"cmrobki8g00040nd4csslu1hj",
 "sourceSnapshotId":"cmrobkvt2000b0mdw1s5gw93y","authorName":"E-Code QA",
 "viewCount":0,"useCount":0}}
```

### 2. Browse ANONYME (public, aucun header auth)
`GET https://api.e-code.ai/gallery` →
```
total=1  categories=[{'id':'web','count':1}]
 - realtime-chat-starter | author=E-Code QA views=0 uses=0 featured=True
```

### 3. Détail ANONYME (compteur de vues incrémenté)
`GET /gallery/realtime-chat-starter` → `views=1 uses=0 pinnedSnapshot=cmrobkvt2000b0mdw1s5gw93y`
(le compteur monte 0→1→2→3 au fil des hits API + navigateur = compteur live réel.)

### 4. Remix par un AUTRE user → clone dans l'org du remixeur
`POST /gallery/realtime-chat-starter/remix` (Bearer remixeur, `organizationId`=org remixeur) → **201** :
```
project: { id: cmroctby500080nds68nwi214,
           organizationId: cmrobuxem000c0m8wyc2ap2dp   ← org du REMIXEUR (pas l'auteur)
           sourceType: "duplicate" }
remix:   { remixJobId: cmroctao000070ndsooez0ugp, state: "COMPLETED",
           sourceSnapshotId: cmrobkvt2000b0mdw1s5gw93y   ← PIN immuable
           sourceListingId:  cmrocsw2v00050ndsj275kx77   ← provenance
           scrubbedValueLines: 0 }
```

### 5. Vérifications post-remix
- **useCount incrémenté** : `GET /gallery/realtime-chat-starter` → `uses=1`.
- **Clone = fichiers du snapshot épinglé** : `GET /projects/<clone>/files` → **7 fichiers**
  (README.md, index.html, package.json, src/App.tsx, src/main.tsx, src/styles.css,
  vite.config.ts) = exactement le set du snapshot.
- **Secret absent en base (live)** : `GET /projects/<clone>/secrets` → `{"secrets":[]}`.
  (La preuve exhaustive fichiers+DB+job avec un VRAI secret matérialisé est le test
  `gallery-routes.spec.ts` — il cherche activement la valeur dans les 3 surfaces et
  ne la trouve nulle part, comme la preuve RMX de l'autre session.)

## Rendu UI LIVE (e-code.ai, navigateur)
- `/gallery` : grille rendue — carte « Realtime Chat Starter », badge « web »,
  « Featured », tags react/vite/starter, « by E-Code QA », **« 2 views » / « 1 remixes »**
  (stats DB live), recherche, chips catégories (All / web).
- `/gallery/realtime-chat-starter` : page détail — auteur, **Views 3 / Used 1 time**,
  CTA orange **« Remix this app »**, note « Secrets from the original are never copied »,
  affordance **« Report this app »** (Trust & Safety, RPL-18). « View App » masqué
  correctement (source non déployée → appUrl null).
- **Responsive** : desktop 1600px ET mobile 375×812 — le rail d'action passe en pleine
  largeur, hamburger, zéro débordement horizontal.

## Honnêteté — ce qui reste
- Le **clic authentifié « Remix this app » dans un navigateur connecté → l'IDE s'ouvre
  sur le clone** n'est PAS fait en autonome : le navigateur in-app est anonyme (le clic
  redirige alors vers `/login?returnTo=` — comportement anon correct). Le remix
  authentifié est prouvé par l'API (201, clone dans l'org du remixeur) et le CTA rend.
  La preuve visuelle du clic-connecté→IDE demande le Chrome connecté d'Avi (handoff,
  comme PUBLISH-UI-01).
- Le lien « Gallery » dans la nav desktop n'apparaît pas encore (le tier web déployé
  semble antérieur au changement `SaaSLayout`) — fast-follow ; la page est atteinte par
  URL directe et par les liens de carte.

## États TPL-02
📤 Dispatché ✅ · 💻 Codé ✅ (`266fefac`..`3181b31f`, 23 tests + build strict verts)
· ✅ **Testé live** : parcours API bout-en-bout + rendu UI (grille + détail, desktop +
mobile) PROUVÉS en prod. Reste le clic-connecté→IDE en navigateur (handoff Avi).
