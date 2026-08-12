# BD-05 — cloche + badge non-lus dans le shell — PREUVE LIVE

**Env de test** : `https://app.34.163.208.161.sslip.io` (projet `vibecore-audit-test-20260807`, jamais la prod).
**Date** : 2026-08-12. **Base code** : origin/main `722a224c` (déployé sur l'env de test).

## Constat re-audit
`SaaSLayout.tsx:2395 TopBarNotifications` rend une cloche + badge non-lus dans la top-bar de `AppShell` (routes user-area : `/dashboard`, etc.), poll `/api/notifications` toutes les 60 s, `/api/notifications/read-all` sur clic. La feature EXISTAIT déjà sur main (registry périmé) → il restait à la **prouver en réel**.

## Reproduction (exercée)
1. `POST /auth/register` (env test) → user `cmspq4nv4003n0nd31t50ujix`, session `vc_session`.
2. Baseline : `/dashboard` → cloche présente, **aucun badge** (`unreadCount=0`).
3. **Insertion d'une vraie notification** côté serveur (pod api de l'env test, `pg`) :
   `INSERT INTO "Notification"(id,"userId",category,title,body) VALUES(..,'GoBolt live proof',..)` → `unread=1`.
4. Reload `/dashboard`.

## Résultat observé (assertions DOM + API, viewport 1440)
- `GET /api/notifications` (proxy same-origin, cookie authentifié) → **`unreadCount: 1`**, `notifications[0].title = "GoBolt live proof"` (ma notification réelle).
- Bouton top-bar : `aria-label = "Notifications (1 non lues)"`.
- Badge visible : élément `<span class="absolute right-0.5 top-0.5 flex h-4 min-w-4 …">` contenant **`1`**.

## Responsive (3 formats) — cloche + badge visibles
| Format | Largeur | Cloche visible | Badge |
|---|---|---|---|
| Desktop | 1440 | ✅ | `aria="Notifications (1 non lues)"` + badge `1` |
| Tablette | 768 | ✅ | `aria="Notifications (1 non lues)"` |
| Mobile | 390 | ✅ | bouton `Notifications (1 non lues)`, `hasBadge=true` |

Screenshots capturés : `bd05-bell-baseline.png` (sans badge) et `bd05-bell-badge-1.png` (badge « 1 »).

**Verdict : FAIT_PROUVE** — le badge se met à jour sur une vraie notification, prouvé à l'écran sur 3 formats.
