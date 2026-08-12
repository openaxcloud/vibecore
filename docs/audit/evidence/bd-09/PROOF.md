# BD-09 — NotificationsTab requalifié honnêtement — PREUVE LIVE

Env test `app.34.163.208.161.sslip.io`, image web **`7369b39436`** (build de ce commit, déployée), 2026-08-12. Jamais la prod.

## Correctif
Le @settings NotificationsTab rend `logStore` (événements IDE locaux : système/màj/erreurs/fournisseurs/réseau) sous un label « Notifications » + description « Consultez et gérez vos notifications » — se faisant passer pour le centre de notifications du compte. Ajout d'une **bannière honnête** en tête d'onglet : c'est le **journal d'activité IDE local (cet appareil)**, avec un **lien vers le vrai centre** `/notifications`. Copie En + Fr (`notificationsTab.ideNotice.*`).

## Preuve live (Playwright, `/settings/notifications`, onglet ouvert)
Contenu rendu du dialog (verbatim) :
- Bannière : **« Il s'agit des événements d'activité locale de l'IDE sur cet appareil (système, mises à jour, erreurs, fournisseurs, réseau) — pas des notifications de votre compte. »**
- Lien : **« Gérer les notifications du compte → »** (`<a href="/notifications">`).
- Puis les logs IDE réels (« Toutes les notifications », « Tout effacer », entrées « Application initialized » / « Debug logging ready » catégorie Système).

Assertions : `hasIdeNotice=true`, `manageLink (a[href="/notifications"])=true`, `hasFilterAll=true`. Screenshot : `bd09-honest-notice.png`.

**Verdict : FAIT_PROUVE** — l'onglet est requalifié honnêtement (activité IDE locale, pas le compte) avec lien vers le vrai centre de notifications. Fin du masquerade.
