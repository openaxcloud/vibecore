# Bolt → vibecore : matrice définitive feature → état → emplacement

Re-audit du 2026-06-30 (4 agents read-only sur l'état **réel actuel** du code, croisé avec
`docs/IDE_PANEL_AUDIT.md` et l'historique git). Remplace `docs/AUDIT_BOLT_HIDDEN_FEATURES.md`
(snapshot Step-0, désormais largement périmé : la majorité des « surfaced=no/partial » sont
aujourd'hui câblés).

Légende état :
- ✅ surfacé **et au bon endroit**
- 🔧 surfacé mais **mal placé** / partiel
- ⛔ **existe mais PAS surfacé**

Emplacements : **Admin** (global/ops) · **User** (perso, hors projet) · **IDE** (onglet projet).

---

## A. IDE — onglets/panneaux projet (29/29 câblés ✅)

Tous montés via `BaseChat.tsx` `IDE_MANAGEMENT_PANELS` (319-343) + `ProjectIdePanelContent()`
(10661-11096) et accessibles par `?panel=`. Source : `docs/IDE_PANEL_AUDIT.md` (81/81 PASS).

| Feature | Ce que ça fait | État | Emplacement |
|---|---|---|---|
| Editor (CodeMirror) | édition, save, thèmes, masquage env | ✅ | IDE |
| Files / FileTree | CRUD, upload, indicateurs git | ✅ | IDE |
| Search | recherche projet | ✅ | IDE |
| Locks (LockManager) | verrouillage fichiers/dossiers | ✅ | IDE |
| Preview | iframe, ports, device mode, fullscreen, history, inspector, screenshot, Expo QR | ✅ | IDE |
| DevTools (Console/Network/Elements) | capture logs/requêtes/inspection | ✅ | IDE (Preview) |
| Terminal | xterm multi-onglets, runtime distant | ✅ | IDE |
| Git (GitTab) | status/branches/diffs/commit/push/pull (SSH dans pod) | ✅ | IDE |
| Overview | dashboard projet temps réel | ✅ | IDE |
| Database / SQL | 3-tab Overview/My Data/Settings, lecture+écriture SQL | ✅ | IDE |
| Object / App Storage | Objects/Settings, upload dossier, create folder (GCS réel) | ✅ | IDE |
| Packages | plan d'install, manifest | ✅ | IDE |
| Skills | catalogue + consommation par l'agent | ✅ | IDE |
| Ports | ports runtime réels, preview links, primary/visibility | ✅ | IDE |
| Monitoring | métriques/activité backend | ✅ | IDE |
| Extensions | extensions persistées | ✅ | IDE |
| Integrations | connect provider + webhooks (project-scoped) | ✅ | IDE |
| Workflows | création + dispatch runtime | ✅ | IDE |
| Security | scan/vulnérabilités | ✅ | IDE |
| Logs | webview + server logs | ✅ | IDE |
| Debugger | inspection process / log snapshot | ✅ | IDE |
| Snapshots / Checkpoints / Rewind | checkpoints manuels+auto, restore, rewind chat | ✅ | IDE |
| Deployments / Deploy Overview | Overview/Logs/Domains/Manage, backends réels | ✅ | IDE |
| Env vars | upsert persistant | ✅ | IDE |
| Secrets | upsert + reveal gardé par confirmation | ✅ | IDE |
| Collaborators / Presence | commentaires, share link, presence avatars, policy IA | ✅ | IDE |
| Domains | CRUD custom domains (consolidé dans Deploy) | ✅ | IDE |
| Activity | feed d'activité backend | ✅ | IDE |
| Settings projet (3-group nav) | nom/desc/run/install/git | ✅ | IDE |
| Agent : mémoire / self-repair / patch-review / studio | mémoire long-terme, auto-correction, review patches, branches conversation | ✅ | IDE (Agent panel) |
| SSH connections | ajout/gestion connexions SSH (keygen UI) | ✅ | IDE (Terminal) |

**Orphelins IDE : aucun.**

---

## B. User-area — navigation hors projet (27 routes liées ✅)

Navs dans `SaaSLayout.tsx` (workspaceNav/orgNav/accountNav/projectNav).

| Feature | État | Emplacement | Note |
|---|---|---|---|
| Dashboard / Projects / Templates / Command palette (⌘K) | ✅ | User (workspaceNav) | |
| Recent projects | ✅ | User | via « View all » |
| Usage & quotas | ✅ | User (orgNav) | |
| Billing (wallet, credits, PAYG, budget cap, plans, invoices, portail Stripe) | ✅ | User (orgNav) | gated/feature-flag |
| Organization members / roles | ✅ | User (orgNav) | |
| Support | ✅ | User (orgNav) | |
| Account settings | ✅ | User (accountNav) | |
| Security settings (hub MFA/sessions) | ✅ | User (accountNav) | |
| API keys | ✅ | User (accountNav) | |
| Connected accounts (GitHub/Google/Entra) | ✅ | User (accountNav) | |
| Notifications | ✅ | User (accountNav) | |
| Desktop settings | ✅ | User (accountNav) | bridge desktop |
| MFA setup / Recovery codes / Session security | ✅ (flux profond) | User | atteints depuis Security settings, pas en menu direct (intentionnel) |
| Audit logs (org export JSON/CSV/SIEM) | ✅ (flux profond) | User/Admin | |
| Share link (`/share/:token`) | ✅ | Public | généré par bouton Share IDE |
| Profile / Settings (langue, TZ, raccourcis) | ✅ | User (ControlPanel) | |
| Connections + GitHub/GitLab/Netlify/Vercel/Supabase tabs | ✅ | User (ControlPanel) | aussi IDE Integrations |
| MCP Servers tab (marketplace + config) | ✅ | User (ControlPanel, BETA) | exécution réelle, voir §D |
| Themes (dark/light, cross-domain cookie) | ✅ | User + IDE | |

**Orphelins user-area : aucun** (les routes hors-menu sont des flux contextuels voulus).

---

## C. Admin — control plane (28 sections)

`admin.$section.tsx` (+ routes dédiées billing/wallets/stripe/oauth-providers). Gate :
`requirePlatformAdmin`, step-up password sur les actions sensibles.

| Feature | État | Note |
|---|---|---|
| Overview / Health / Users (suspend/MFA-reset/strike/impersonate) | ✅ | UI riche |
| AI providers / models / feature-flags (toggle) | ✅ | ToggleListPanel |
| OAuth providers (éditer credentials) | ✅ | route dédiée |
| Quotas overrides / System settings | ✅ | UI dédiée |
| Billing (plan/quota overrides) / Wallets (crédit/débit) / Stripe config | ✅ | routes dédiées |
| **Developer tools** (Debug/TaskManager/ServiceStatus/Updates/EventLogs) | ✅ | réutilise les tabs bolt `window:'developer'` |
| **Cloud Providers / Local Providers (config BYOK)** | ✅ *(ce tour)* | déplacés dans Developer tools (étaient ⛔) |
| Organizations/Projects/Workspaces/Terminals/Previews/Deployments/Usage/AI-usage/Provider-health/Security-events/Audit-logs/Admin-audit-logs/Support-tickets/Account-deletions/Costs/Checkpoints/Stripe-health/Abuse-events | ✅ (lecture) | DataPanel tables read-only |
| Workspace stop/restart/delete | ⛔ | endpoint OK, **pas de bouton UI** |
| Abuse resolve / Support respond | ⛔ | endpoint OK, table read-only seulement |
| Org suspend | ⛔ | endpoint OK, pas d'action UI |
| Announcements / Incident-banner / Maintenance-mode / Logs redact | ⛔ | endpoints ops sans UI |
| **MCP catalog management** | ⛔ | voir §D (gap principal) |

---

## D. MCP — verdict

**Toute la partie MCP de bolt.diy est reprise ET étendue.** (preuve git : upstream
`5de162ee feat(mcp)` ⊂ vibecore).

Présent & **réellement câblé** :
- Tab settings (Marketplace + Configuration JSON façon Claude-Desktop), BETA, `window:'user'`.
- Stores + persistance **localStorage ET DB** (cross-device) — vibecore-only.
- Chargement server-side pour le runtime agent + merge install/template + substitution `{{token}}`.
- **Exécution réelle des outils par l'agent** : `api.chat.ts` instancie `MCPService` par requête,
  passe la toolset à `streamText` (`toolChoice:'auto'`, `maxSteps`), exécute `tool.execute()` et
  renvoie `tool_result` — **avec approbation human-in-the-loop**.
- Transports stdio / SSE / streamable-http réels.
- Marketplace DB (catalogue 25 entrées/16 domaines, installs per-user) — vibecore-only.
- Durcissements vibecore : isolation tenant par requête, garde RCE stdio (`MCP_ALLOW_STDIO_SERVERS`
  off par défaut), garde SSRF (IPv6-mapped/NAT64).

Gaps MCP (priorisés) :
1. **Admin catalog management** ⛔ — pas d'UI ni d'API write ; le catalogue n'entre que par seed +
   redeploy. → ajouter section `/admin/mcp` + `POST/PATCH/DELETE /mcp/catalog`.
2. **Policy org/global** ⛔ — enablement **per-user** uniquement ; `McpInstall.organizationId`
   existe mais aucune surface pour forcer/allow-list/désactiver par org.
3. **`/mcp` route = marketing** 🔧 — le vrai marketplace n'est que dans le panneau settings.
4. stdio désactivé en prod (par design sécurité) — ferait sens via runner sandboxé dans le pod.

---

## E. Ce qui RESTE inutilisé/récupérable (priorisé par valeur)

| # | Gap | Valeur | Emplacement cible | Effort |
|---|---|---|---|---|
| 1 | **Admin MCP catalog mgmt** (UI + write API) | élevée (gouvernance multi-tenant) | Admin | M (backend+UI) |
| 2 | **Boutons d'action sur tables admin** (workspace stop/restart/delete, abuse resolve, support respond, org suspend) — endpoints déjà là | élevée (ops quotidien) | Admin | S (UI sur endpoints existants) |
| 3 | **Ops controls** : announcements / incident-banner / maintenance-mode | moyenne-élevée | Admin | S-M |
| 4 | **MCP org policy** (allow-list/force-enable par org) | moyenne | Admin | M |
| 5 | **`/mcp` → marketplace fonctionnel** (ou retirer le doublon marketing) | faible-moyenne | User | S |
| 6 | Dashboards admin sur métriques Prometheus déjà collectées (cost par org, workspace lifecycle P50/P95, queue depth, auth-failure trends) | moyenne (sinon Grafana) | Admin | M chacun |
| 7 | SIEM webhooks / IP allowlist / SSO OIDC-SAML / SCIM : backends complets, UI d'admin org partielle | entreprise | Admin/Org | M |

> Note : `cloud-providers`/`local-providers` étaient les **2 seuls tabs bolt @settings réellement
> orphelins** — corrigés ce tour (§C). Tout le reste du legacy bolt (IDE, chat, runtime, providers,
> templates, électron, i18n, import zip/github/figma, expo/mobile) est déjà câblé et placé.
</content>
</invoke>
