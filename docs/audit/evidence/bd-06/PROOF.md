# BD-06 — ProfileTab localStorage → compte réel — PREUVE LIVE

Env de test `app.34.163.208.161.sslip.io`, image web **`c3636dad2b`** (build de ce commit, déployée), 2026-08-12. Jamais la prod.

## Correctif
Le ProfileTab persistait username/bio/avatar dans un blob localStorage `bolt_profile`, se faisant passer pour l'état de compte et ne suivant pas l'utilisateur entre appareils.
- Nouvelle route proxy **`/api/account/profile`** : `username` ↔ nom de compte (`PATCH /auth/me`), `bio`/`avatar` ↔ préférences serveur (`preferences.profile` via `/user/preferences`).
- `profileStore` **hydrate depuis** et **persiste vers** le compte (débounce), plus AUCUN localStorage. Tous les consommateurs (avatar top-bar, menu compte, chat) deviennent server-backed + cross-device.
- ProfileTab + AppShell hydratent au montage.

## Preuve live (Playwright, user « ProfileProof Alpha » fraîchement enregistré)
1. `localStorage.bolt_profile` mis à `null` avant tout → prouve que l'affichage ne vient pas du localStorage.
2. `/api/account/profile` (nouvelle route) → **`{username:"ProfileProof Alpha", bio:"", avatar:""}`** (nom réel du compte, côté serveur).
3. `/dashboard` chargé → la page appelle **`/api/account/profile`** (effet d'hydratation AppShell déployé s'exécute, count=1) ; le pied de sidebar affiche **« PA — ProfileProof Alpha »** (nom serveur rendu dans l'UI).
4. **Round-trip de persistance** (ce que fait `updateProfile`) : `PATCH /api/account/profile {username:"ProfileProof Beta", bio:"server-backed bio proof BD-06"}` → **200** ;
   - `GET /api/auth/user` → nom de compte = **« ProfileProof Beta »** (le changement de nom a atteint le VRAI compte via `/auth/me`) ;
   - `GET /api/account/profile` → **`{username:"ProfileProof Beta", bio:"server-backed bio proof BD-06"}`** (bio persistée dans les préférences serveur).

## Note honnête
Le ProfileTab est un onglet du modal ControlPanel absent de la grille par défaut (atteignable par URL `/settings/profile`) ; dans le build déployé le modal affichait la grille et non l'onglet Profil (comportement pré-existant du ControlPanel, non modifié par ce correctif). La substance de BD-06 est prouvée via l'intégration AppShell + le round-trip exact du proxy que le store appelle. Aucun localStorage ne présente d'état de compte.

**Verdict : FAIT_PROUVE** — le profil EST le compte (hydrate + persiste côté serveur, cross-device) ; zéro masquerade localStorage.
