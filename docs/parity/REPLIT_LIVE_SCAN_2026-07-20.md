# REPLIT LIVE SCAN — 2026-07-20

**Document À PART** (demande Avi) — ne modifie ni `PLAN_PARITE_REPLIT.md` ni ses registres.
Ne rien fusionner au plan sans le feu vert d'Avi.

## Ce que ce document est

Un scan de **ce qui est réellement en ligne chez Replit aujourd'hui (20 juillet 2026)**, vu par
un **nouveau visiteur / nouveau compte** — pas la mémoire, pas les vieux articles de blog.
Chaque page a été **rendue avec un vrai navigateur (JS exécuté)** : Playwright + Chromium 147,
headless, écran 1440×900, en anonyme. Chaque capture est **hashée** (SHA-256) et archivée dans
[`docs/parity/livescan-2026-07-20/`](livescan-2026-07-20/) (PNG + texte visible + liens + `manifest.json`).

**robots.txt respecté** : `https://replit.com/robots.txt` autorise tout pour `User-agent: *`
(`Disallow:` vide). Aucune protection contournée, aucun faux compte créé.

## Limites — dites franchement

1. **Pas de compte créé.** La création de compte est interdite par mes règles de sécurité,
   et Avi demande de ne pas créer de faux comptes. Donc **tout ce qui est derrière le login
   n'a PAS été observé à l'écran** : premier écran connecté, IDE réel, panneaux, écrans de
   publication authentifiés. Ces surfaces sont marquées 🔒 ou 📘, **jamais** ✅ LIVE.
2. **`/signup` est bloqué par Cloudflare** pour un navigateur headless : HTTP 403
   « Just a moment... » à 2 tentatives (captures `signup.png` et `signup-retry.png`).
   Je n'ai pas contourné le contrôle anti-bot. Le **formulaire** d'inscription n'a donc pas
   été vu ; en revanche la page **Log In** (rendue, elle) liste les fournisseurs d'identité.
3. Pour combler le trou « derrière le login », j'utilise la **doc produit officielle du jour**
   (`docs.replit.com`, index `llms.txt` téléchargé et hashé le 2026-07-20). C'est une source
   **secondaire** : elle décrit le produit courant mais n'est pas une observation à l'écran.
   Ce statut est distingué partout (📘, jamais ✅).

## Légende des statuts

| Statut | Sens |
|---|---|
| ✅ **LIVE-OBSERVÉ** | Vu à l'écran en anonyme, capture + hash + date à l'appui |
| 📘 **DOC-JOUR** | Présent dans la doc produit officielle téléchargée et hashée le 2026-07-20 (derrière login, pas observable sans compte) |
| 🔒 **LOGIN** | La route existe mais redirige vers Log In — contenu invérifiable sans compte |
| ⬜ **SANS-TRACE** | Aucune trace ni sur les pages rendues ni dans la doc du jour — **candidat** retiré/renommé (une absence n'est pas une preuve) |
| ❌ **RETRAIT PROUVÉ** | Preuve positive du retrait (texte de la doc du jour ou observation directe) |
| 💰 **PLAN-GATE** | Réservé à un plan payant (le plan est indiqué) |

---

## 1. Pages rendues en direct (preuves)

Collecte : **2026-07-20T05:43Z**, Playwright/Chromium headless, anonyme.
Hashes complets et octets dans [`livescan-2026-07-20/manifest.json`](livescan-2026-07-20/manifest.json).

| Page | URL | HTTP | Statut | SHA-256 capture (16 premiers) |
|---|---|---|---|---|
| Landing | `replit.com/` | 200 | ✅ RENDUE | `eaff011fa23b0cda` |
| Signup | `replit.com/signup` | 403 | ⛔ BLOQUÉE (anti-bot Cloudflare, ×2) | `b854d8ebf7cc9715` / `a100279612a8a691` |
| Log In | `replit.com/login` | 200 | ✅ RENDUE | `0fa5718b881fb29d` |
| Pricing | `replit.com/pricing` | 200 | ✅ RENDUE | `0dea38e82de4c246` |
| Templates | `replit.com/templates` | 200 | ✅ RENDUE → **c'est la Gallery** | `5e0cb9bbf4794ce6` |
| Gallery | `replit.com/gallery` | 200 | ✅ RENDUE (identique à /templates, même hash) | `5e0cb9bbf4794ce6` |
| Gallery détail | `replit.com/gallery/life/education/solar-system-visualizer` | 200 | ✅ RENDUE | `0497c919bba187b8` |
| Community | `replit.com/community` | 200 | ✅ RENDUE | `a2e281d5d30c0193` |
| Bounties | `replit.com/bounties` | 200 | ✅ RENDUE → **« Replit Experts »** | `6beff99f6657f38a` |
| Agent (marketing) | `replit.com/ai` | 200 | ✅ RENDUE | `2ee3dedd9cf4287f` |
| Desktop | `replit.com/desktop` | 200 | ✅ RENDUE | `33477c21005aef7f` |
| Mobile | `replit.com/mobile` | 200 | ✅ RENDUE | `9bc8b426b1514fd7` |
| Teams | `replit.com/teams` | 200 | ✅ RENDUE | `36110602aa3ba732` |
| Enterprise | `replit.com/enterprise` | 200 | ✅ RENDUE | `dd8813a27f65b535` |
| Import | `replit.com/import` | 200 | 🔒 → page Log In | `0fa5718b881fb29d` |
| Usage | `replit.com/usage` | 200 | 🔒 → page Log In | `0fa5718b881fb29d` |
| Home connecté | `replit.com/~` | 200 | 🔒 → page Log In | `0fa5718b881fb29d` |
| Profil public | `replit.com/@mattpalmer` | 200 | 🔒 → page Log In | `0fa5718b881fb29d` |
| Docs | `docs.replit.com/` | 200 | ✅ RENDUE | `bc6ff814a7f387b0` |
| Status | `status.replit.com/` | 200 | ✅ RENDUE | `5bb08c718438ced9` |

**Preuve de la porte d'authentification** : `/import`, `/usage`, `/~` et `/@mattpalmer`
produisent une capture **pixel-identique** à `/login` (même hash `0fa5718b881fb29d`).
Notamment : **les profils utilisateurs `/@…` ne sont plus visibles en anonyme** —
les profils publics passent par « Community Profiles » (`community-hub.replit.app`,
lien « Claim your profile » sur la page Community).

Docs de référence téléchargées le même jour (source secondaire 📘, hashes 16 premiers) :
`llms.txt` (index complet, 303 lignes) `03cbdb0706d90455` · `doc-import-from-providers.md`
`56b145555f6d82a4` · `doc-agent-modes.md` `01fb6fbcf937e7ba` · `doc-starter-plan.md`
`019962efcfbe8b66` · `doc-usage.md` `282dcaa3e08837f5`.

---

## 2. Ce qu'un NOUVEAU compte voit aujourd'hui

### 2.1 Entrée dans le produit (✅ observé en anonyme)

- **Landing = un prompt Agent** : « What will you build? », avec **9 types de sortie
  proposés d'emblée** : Website, Mobile, Design, Slides, Animation, Data Visualization,
  3D Game, Document, **Spreadsheet**. Exemples de prompts cliquables.
- Le discours produit est **« Agent 4 »** : Parallel Agents (tâches en parallèle,
  micro-VMs), Multiple Artifacts (plusieurs artefacts par projet, design partagé),
  **Infinite Canvas** (exploration visuelle de designs), collaboration d'équipe.
- **Aucun sélecteur de modèle nulle part** sur les pages publiques (cohérent avec
  RPL-2026-004 de notre baseline).
- **Log In** : Email/username + mot de passe, « Use SSO login », et 5 fournisseurs :
  Google, GitHub, X, Apple, Facebook.
- Footer public : About us, **Vibe Coding 101**, Help, How to guides, Import from GitHub,
  Status, Brand kit, Certifications, Partnerships + pages légales.

### 2.2 Plans (✅ observé sur /pricing, prix affichés le 2026-07-20)

| Plan | Prix | Ce que la page affiche |
|---|---|---|
| **Starter** | Gratuit | Crédits Agent **quotidiens** gratuits, base de données intégrée, slides/vidéos/animations, **1 seul projet publié**, déploiements privés ou à mot de passe |
| **Replit Core** | $20/mois ($18 annuel) | $20 de crédits/mois, 5 collaborateurs, **2 agents en parallèle**, publication toutes régions, workspaces illimités, badge retirable, Replit AI Integrations |
| **Replit Pro** | $100/mois ($90 annuel) | $100 crédits/mois (paliers jusqu'à $2 000/mois), 15 collaborateurs + **50 viewers**, **10 agents en parallèle**, « most powerful models », rollback DB 28 jours, support premium |
| **Enterprise** | Sur devis | SSO/SAML, groupes custom, design system, connexions data warehouse, single-tenant, région au choix, IP sortantes statiques, VPC peering |

- FAQ pricing : « **Effort-Based Pricing (pay-as-you-go)** », crédits, budgets/limites.
- **Le plan « Teams » n'existe plus à la vente** ; la doc du jour parle de
  « migration from the former Teams plan » vers Pro (📘 `billing/teams-billing/overview`).
  La page `/teams` est du marketing qui renvoie vers l'offre actuelle.

### 2.3 Barrières du plan gratuit (📘 doc du jour `doc-starter-plan.md` — c'est CE qu'un nouveau compte gratuit a)

- **Lite build uniquement** — Full build (autonomie complète de l'Agent) = 💰 Core/Pro.
- **1 app publiée**, qui **expire automatiquement au bout de 30 jours**, avec badge
  « Made with Replit » (qui contient un lien de parrainage).
- 💰 Core requis pour : **Plan Mode**, **connecteurs tiers** (Google, Stripe…),
  **Replit AI Integrations**, conversion Design Canvas → artefact complet,
  **tous les types d'artefacts autres que web + mobile** (slides, data viz, vidéos…),
  retrait du badge, apps publiées supplémentaires.
- Stockage workspace Starter : 2 GB ; 20 apps simultanées max (tous plans).

---

## 3. État des 159 surfaces de notre univers (P001–P159) vu de ce scan

Rappel honnête : sans compte, une grande partie de l'IDE ne peut être qu'en 📘 (doc du jour)
ou 🔒. **Rien de 📘/🔒 n'est certifié live** ; c'est le meilleur constat possible sans login.

### Famille A — Accueil, navigation, shell IDE

| Pt | Surface | Constat 2026-07-20 |
|---|---|---|
| P001 | Accueil / Projects | 🔒 (`/~` → Log In) |
| P002 | Sélecteur de workspace | 📘 (`features/collaboration/workspaces`) |
| P003 | Cartes projet multi-artefacts | 📘 (`projects-and-artifacts/*`) |
| P004 | Spotlight / couverture | ⬜ aucune trace doc du jour |
| P005 | Barre supérieure | 🔒 |
| P006 | Windows, panes, tabs | 📘 (`editor/editor-and-tools`) |
| P007 | Tools Dock / All tools | 📘 (idem) |
| P008 | Search / command palette | 📘 (CLUI `clui-graphical-cli`) |
| P009 | Centre notifications | ⬜ |
| P010 | User Settings | 📘 (`editor/user-settings`) |
| P011 | Resources panel | ⬜ |
| P012 | Help / docs / status | ✅ docs + status rendus ; « Get help » sur /login |

### Famille B — Fichiers, code, exécution, versionnement

| Pt | Surface | Constat |
|---|---|---|
| P013–P014 | File Tree, Éditeur | 📘 (`editor-and-tools`) |
| P015 | Search & Replace | ⬜ (pas de page dédiée dans la doc du jour) |
| P016 | Symbols / Outline | ⬜ |
| P017 | Problems / Diagnostics | ⬜ |
| P018 | Formatter | ⬜ |
| P019 | Console | 📘 |
| P020 | Shell | 📘 |
| P021 | SSH | 📘 |
| P022 | Workflows | 📘 |
| P023 | Run / Stop | 📘 (workflows = run buttons) |
| P024 | Preview Web | 📘 |
| P025 | Preview DevTools | ⬜ (Preview documenté, DevTools non cités) |
| P026 | Ports | 📘 |
| P027 | Dependencies / Packages | 📘 |
| P028 | Advanced Project Settings | 📘 (`.replit` / `replit.nix`) |
| P029 | Git | 📘 (Git pane) |
| P030 | File History | 📘 |
| P031 | Checkpoints | 📘 |
| P032 | Disaster Recovery | 📘 (git disaster recovery) |
| P033 | Secrets | 📘 |

### Famille C — Agent, tâches, automatisations

| Pt | Surface | Constat |
|---|---|---|
| P034 | Agent Chat | ✅ le produit entier est vendu par ce prompt (landing) + 📘 |
| P035 | Agent Modes | 📘 Lite/Economy/Power + toggles App Testing / High effort / Turbo. **« Max mode is no longer available »** (❌ retrait prouvé, doc du jour). 💰 Starter = Lite seul |
| P036 | Plan Mode | 📘 · 💰 Core |
| P037–P040 | Task Board, lifecycle, follow-ups, message queue | 📘 (4 pages dédiées) |
| P041 | Agent activity | ⬜ (recouvert par task board ?) |
| P042 | Diff review | ⬜ |
| P043 | App Testing | 📘 |
| P044 | Skills Directory | 📘 |
| P045 | replit.md | 📘 |
| P046 | Workspace Instructions | 📘 (`agent-customization`) |
| P047 | Web Search | 📘 (+ ✅ incident status du 14/07 : « Agent Search » en panne puis rétabli — donc la fonction existe en prod) |
| P048 | Voice Mode | 📘 |
| P049 | Image Generation | 📘 |
| P050 | Audio Generation | 📘 |
| P051 | Video / 3D Generation | 📘 (animated videos ; 3D games) |
| P052 | Connectors in Agent | ✅ « 100+ integrations » (landing) + 📘 · 💰 Core |
| P053 | MCP tools | 📘 (MCP list, install links, Figma MCP) |
| P054 | Agent Inbox | ⬜ |
| P055 | Code Review | ⬜ |
| P056 | Security Agent | ⬜ sous ce nom ; la doc du jour parle de « Agent-powered security reviews » dans Project Security Center (P125) — probablement renommé/absorbé |
| P057 | Automations | 📘 (event-driven + scheduled ; Linear, Jira, Gmail, Slack, Discord) |

### Famille D — Artefacts, Library, Canvas

| Pt | Surface | Constat |
|---|---|---|
| P058 | Artifact Switcher | 📘 |
| P059 | Library | ⬜ |
| P060 | Asset Browser | ⬜ |
| P061 | Design Canvas | ✅ « Infinite Canvas » mis en avant sur la landing + 📘 (4 pages Canvas : frames, elements, toolbar) |
| P062 | Canvas media tools | 📘 (toolbar : Interact/Pan/Chat/Draw/Edit/Generate) |
| P063 | Visual Editor | 📘 partiel (« Edit elements » sur Canvas) |
| P064 | Web Artifact | ✅ (chip landing) + 📘 |
| P065 | Mobile Artifact | ✅ (chip) + 📘 |
| P066 | iOS Simulator | 📘 (mobile : test simulateur + App Review) |
| P067 | Android Emulator | ⬜ (Expo documenté, émulateur Android non cité) |
| P068 | Slides Editor | ✅ (chip Slides) + 📘 · 💰 Core |
| P069 | Presenter / Speaker Notes | ⬜ |
| P070 | Slides Export | ⬜ |
| P071 | Data Viz Artifact | ✅ (chip) + 📘 · 💰 Core |
| P072 | Animation / Video | ✅ (chip) + 📘 · 💰 Core |
| P073 | 3D / Game | ✅ (chip « 3D Game ») + 📘 |
| P074 | Design Artifact | ✅ (chip Design) + 📘 |
| P075 | Document Artifact | ✅ chip « Document » sur la landing (et chip « **Spreadsheet** », voir §4) |
| P076 | Artifact Management | 📘 (multiple artifacts, mise à niveau anciens projets) |
| P077 | Shared backend/data | ✅ « shared design » (landing) / 📘 partiel |
| P078 | Grouped Publish | ⬜ |

### Famille E — Data, Cloud, auth, intégrations

| Pt | Surface | Constat |
|---|---|---|
| P079–P085 | Database (landing, overview, My Data, SQL editor, settings, recovery, dev/prod) | 📘 (pages dédiées, dont « My Data » et rollback prod point-in-time) |
| P086 | Agent Prod Read-only | ⬜ |
| P087 | App Storage | 📘 (+ SDKs JS/Python) |
| P088 | Object Browser | 📘 partiel (géré dans App Storage) |
| P089 | Users & Auth | 📘 (Replit Auth **et Clerk Auth** — nouveau, voir §4) |
| P090 | External Access Tokens | 📘 |
| P091 | Integrations Catalog | ✅ « 100+ » (landing) + 📘 (+ **warehouse connectors** BigQuery/Databricks/Snowflake/Fabric, voir §4) |
| P092 | OAuth Setup | 📘 (sign-in providers custom via Clerk) |
| P093 | Integration Health | ⬜ (seulement des pages de dépannage Google/Salesforce) |
| P094 | MCP Management | 📘 |

### Famille F — Publish, production, domaines

| Pt | Surface | Constat |
|---|---|---|
| P095 | Publishing Overview | 📘 |
| P096 | Deployment Type | 📘 (Autoscale, Static, Reserved VM, Scheduled) |
| P097 | Machine Configuration | 📘 |
| P098 | Deployment Secrets | 📘 partiel |
| P099 | Publishing Geography | 📘 (💰 Starter : « publish in any region » listé côté Core sur /pricing ✅) |
| P100 | Connect Domain | 📘 |
| P101 | Buy Domain | 📘 (achat intégré) |
| P102–P104 | Accès Public / Privé / Password | ✅ « private or password-protected » affiché sur /pricing (Starter) + 📘 (public, password, workspace only, invite only) |
| P105 | Production Database | 📘 |
| P106 | App Monitoring | 📘 |
| P107 | Production Logs | 📘 (help) |
| P108 | Application Analytics | ⬜ sous ce nom (monitoring = uptime/requêtes/usage ; analytics = page Enterprise) |
| P109 | Production Resources | 📘 partiel (charts d'usage) |
| P110 | Feedback Widget | 📘 |
| P111 | Security Gate | ✅ indirect : incident status du 16/07 « apps stuck in the **'Security Scanner' stage** » — l'étape existe en prod |
| P112 | Deployment History | ⬜ |
| P113 | Rollback | 📘 (checkpoints/rollbacks + rollback DB prod) |
| P114 | Static Advanced | 📘 |
| P115 | Scheduled Deployments | 📘 |
| P116 | SEO Rating | 📘 |
| P117 | SEO Agent | 📘 (audit + fixes 1-clic) |
| P118 | Monetization Hub | 📘 (Stripe, RevenueCat, Whop) |

### Famille G — Collaboration, sécurité, enterprise, billing

| Pt | Surface | Constat |
|---|---|---|
| P119 | Multiplayer Presence | ✅ « live cursors » (page Enterprise) |
| P120 | Shared Agent Thread | 📘 (threads par personne sur un même projet) |
| P121 | Project Access | 📘 |
| P122 | Workspace Members | 📘 |
| P123 | Groups | 📘 (custom groups = Enterprise) |
| P124 | Guests | 📘 (rôles Admin/Member/Guest/Viewer) |
| P125 | Project Security Center | 📘 |
| P126 | Workspace Security Center | 📘 (CVE, SBOM export) |
| P127 | Package Firewall | 📘 (« On by default, powered by Socket ») |
| P128 | Workspace Policies | 📘 (enterprise privacy settings) |
| P129 | SSO / SAML | ✅ /pricing + /enterprise (SAML, OIDC ; Okta/Azure/Google) + 📘 |
| P130–P131 | SCIM users / groups | ✅ « SCIM » (page Enterprise) + 📘 |
| P132 | Audit Logs | ✅ (page Enterprise) + 📘 |
| P133 | SIEM | 📘 (dans audit-logs) |
| P134 | Budgets | 📘 (managing-spend) |
| P135 | Spend Limits | 📘 |
| P136 | Plans / Entitlements | ✅ /pricing rendu |
| P137 | Seats | 📘 (+ viewer seats) |
| P138 | Invoices / Billing | 📘 |
| P139 | Enterprise Analytics | 📘 (Analytics Dashboard) |

### Famille H — Imports, plateformes, écosystème

| Pt | Surface | Constat |
|---|---|---|
| P140 | Import GitHub | ✅ lien footer public + 📘 (repos publics ET privés) |
| P141 | Import GitLab | ❌ **absent de la table officielle des sources d'import du jour** (GitHub, Bitbucket, Vercel, Figma, Bolt, Lovable, Base44, ZIP, ré-import Agent) — pas de GitLab |
| P142 | Import Bitbucket | 📘 (dans la table) |
| P143 | Import ZIP | 📘 (dans la table) |
| P144 | Import Figma | 📘 (frame URL → app React) |
| P145 | Recreate from Screenshot | ✅ « Simply screenshot, upload, and Agent will build it » (/ai) |
| P146 | Export ZIP | ⬜ |
| P147 | Download Assets | ⬜ |
| P148 | Remix / Fork | ✅ « Use Template » sur la fiche Gallery + 📘 (Remix) |
| P149 | Desktop App | ✅ page téléchargement Mac/Windows/Linux |
| P150 | Mobile App Client | ✅ page dédiée (iOS/Android ; « vibe code from your phone » ; app native iOS → passer par le web + Expo Go + App Review) |
| P151 | ChatGPT Entry | 📘 (« Replit in ChatGPT ») |
| P152 | Claude Entry | 📘 (« Replit in Claude » + « Claude to app ») |
| P153 | Slack Entry | 📘 (@Replit dans Slack) |
| P154 | Open in Replit | 📘 |
| P155 | Linear Integration | 📘 (via Automations/connectors) |
| P156 | CLI / replit ai | ⬜ **aucune trace** d'un CLI dans la doc du jour (seul « CLUI », barre de commande interne à l'IDE) |
| P157 | Public API | ⬜ sous ce nom — remplacé en pratique par le **Replit MCP Server** (📘, voir §4) |
| P158 | Webhooks | ⬜ comme produit (mentionnés seulement comme consommateurs d'External Access Tokens) |
| P159 | Status Page | ✅ rendu : 10 services listés, tous « Operational » |

---

## 4. LA colonne importante — NOUVEAU chez Replit, ABSENT de nos 159

Ce qu'un nouveau compte voit aujourd'hui et que notre univers P001–P159 **n'a nulle part** :

| # | Surface nouvelle | Preuve | Statut |
|---|---|---|---|
| N1 | **Artefact « Spreadsheet »** — chip de création sur la landing, à côté de Document | ✅ landing (`home.png`) | LIVE (entrée de création) |
| N2 | **Replit Gallery publique** (`/gallery`, ex-`/templates`) : vitrine d'apps communautaires, 82 résultats, catégories, compteurs vues/« Used N times », bouton **Use Template**, **Submit your App** | ✅ `gallery.png`, `gallery-detail.png` | LIVE |
| N3 | **Community Profiles** — « Claim your profile », stats de builder, « proof of work », hébergé sur `community-hub.replit.app` ; en parallèle les profils `/@user` du domaine principal sont passés derrière login | ✅ `community.png` + hash identique login pour `/@mattpalmer` | LIVE |
| N4 | **Replit Experts** — pivot de Bounties : marketplace « Hire an Expert » / « Post a job » / « Apply to be an Expert » (171 experts, 229 embauches, $974K+) | ✅ `bounties.png` | LIVE |
| N5 | **Agent 4 + Parallel Agents** — exécution parallèle de tâches (micro-VMs isolées), file de requêtes séquencée par l'Agent | ✅ landing + enterprise | LIVE (marketing) / IDE 🔒 |
| N6 | **General Agent** — l'Agent « tout output, tout framework, lit/écrit les services connectés » | 📘 `features/agent/general-agent` | DOC-JOUR |
| N7 | **Clerk Auth** — deuxième système d'auth pour les apps construites (branding custom, comptes indépendants, migration depuis auth existante, OAuth custom Google/GitHub/Apple/X) | 📘 3 pages dédiées | DOC-JOUR |
| N8 | **Warehouse Connectors** — BigQuery, Databricks, Snowflake, Microsoft Fabric (+ « Data warehouse connections » listé sur /pricing Enterprise ✅) | ✅ pricing + 📘 | LIVE (offre) |
| N9 | **Replit MCP Server** — pilotage programmatique des apps via client MCP (remplace de fait une API publique) | 📘 `platforms/mcp-server` | DOC-JOUR |
| N10 | **Design System d'organisation** (Enterprise) — Agent applique la charte (composants, tokens, assets) à tout ce qu'il produit | ✅ /pricing (« Design system support ») + 📘 | LIVE (offre) |
| N11 | **Custom Templates d'organisation** (Enterprise) | 📘 `teams/custom-templates` | DOC-JOUR |
| N12 | **Écosystème communautaire opéré** — Buildathons (apps dédiées `buildathons.replit.app`, `mobile-buildathon.replit.app`), Ambassador Program (beta privée), livestreams hebdo, meetups (Luma), Discord, Discourse | ✅ `community.png` | LIVE |
| N13 | **Effort-Based Pricing + crédits quotidiens gratuits** — modèle de facturation affiché à tout nouveau compte (FAQ pricing), avec app gratuite qui **expire à 30 jours** et badge-parrainage | ✅ pricing + 📘 starter-plan | LIVE |
| N14 | **Import Vercel / Bolt / Lovable / Base44** — la table d'import officielle cible les concurrents (en plus de GitHub/Bitbucket/Figma/ZIP) | 📘 table du jour | DOC-JOUR |
| N15 | **Vibe Coding 101 / Learn** — parcours d'apprentissage grand public (lien footer sur toutes les pages) | ✅ footer | LIVE |

**À noter aussi (délta de comportement, pas de surface)** : le badge « Made with Replit »
du plan gratuit contient un **lien de parrainage** ; le nudge « Switch to Power » est affiché
**au plus une fois par projet** (📘 agent-modes).

## 5. Présent des deux côtés

L'essentiel des familles B, C, E, F, G, H est **confirmé côté Replit aujourd'hui**
(voir tables §3) : éditeur/console/shell/SSH/workflows/git/checkpoints/secrets ;
agent chat/modes/plan/tasks/skills/voice/web-search/génération média/automations/MCP ;
DB dev+prod/My Data/App Storage/Replit Auth ; publishing 4 types/domaines/accès/monitoring/
SEO/feedback/scheduled/static advanced ; multiplayer/groupes/SSO/SCIM/audit/SIEM/budgets/
seats ; imports GitHub/Bitbucket/ZIP/Figma/screenshot/remix ; desktop/mobile/ChatGPT/Claude/
Slack/Open-in-Replit/status. Statuts détaillés point par point en §3 (✅ vs 📘 vs 🔒).

## 6. Dans nos 159 mais SANS TRACE chez Replit aujourd'hui (candidats retirés)

**Retraits PROUVÉS (preuve positive du jour)** :

| Point | Preuve |
|---|---|
| **Max mode** (variante de P035) | doc du jour : « Max mode is no longer available » |
| **Starter templates par langage/framework** | doc du jour (`developer-frameworks`) : « Language and framework starter templates **have been removed** » — `/templates` sert désormais la Gallery (✅ observé, même hash que `/gallery`) |
| P141 **Import GitLab** | absent de la table officielle des sources d'import du jour |
| **Profils publics `/@user`** (anonymes) | `/@mattpalmer` → page Log In pixel-identique (hash) |
| **Plan Teams** | doc billing : « migration from the former **Teams plan** » ; /pricing n'affiche que Starter/Core/Pro/Enterprise |
| **Bounties** (comme produit de bounties) | `/bounties` sert « Replit Experts » (marketplace d'embauche) |

**SANS-TRACE dans la doc/les pages du jour** (⬜ — à trancher seulement avec un compte réel ;
une absence de doc n'est PAS une preuve de retrait) :

P004 Spotlight · P009 Notifications · P011 Resources panel · P015 Search & Replace ·
P016 Symbols · P017 Problems · P018 Formatter · P025 Preview DevTools · P041 Agent activity ·
P042 Diff review · P054 **Agent Inbox** · P055 **Code Review** · P056 Security Agent (probable
renommage → Security Center) · P059 **Library** · P060 Asset Browser · P067 Android Emulator ·
P069 Speaker Notes · P070 Slides Export · P078 Grouped Publish · P086 Agent Prod Read-only ·
P093 Integration Health · P108 Application Analytics (sous ce nom) · P112 Deployment History ·
P146 Export ZIP · P147 Download Assets · P156 **CLI / replit ai** · P157 **Public API** ·
P158 **Webhooks**.

Héritage plus ancien (pas dans les 159, pour mémoire) : **Cycles**, **Ghostwriter**,
**Assistant** — zéro occurrence dans la doc produit du jour (uniquement dans les archives
changelog 2024).

---

## 7. Chiffres

- **21 rendus tentés** → **19 pages rendues** en JS (17 uniques), **2 blocages** anti-bot
  (les 2 sur `/signup`), 0 invention.
- **15 surfaces produit distinctes observées LIVE en anonyme** (landing-prompt 9 artefacts,
  login/SSO, pricing 4 plans, gallery + fiche + Use Template, community, Experts, marketing
  Agent, desktop, mobile, teams, enterprise, docs, status, porte d'auth ×4 routes).
- Vs nos 159 : **≈ 15 nouveautés absentes de l'univers** (§4, N1–N15, dont 9 observées live) ·
  **6 retraits prouvés** (§6) · **28 points sans trace** à vérifier avec un compte réel ·
  le reste confirmé ✅/📘 (§3).
- **Ce que ce scan ne peut pas dire** : tout l'intérieur de l'IDE connecté (panneaux réels,
  écrans de publication, modes visibles pour un compte Starter). Il faut soit un compte de
  test légitime fourni par Avi, soit se limiter à la doc du jour comme ici.

## 8. Reproduire

Script (2 passes) : rendu Chromium headless 1440×900 anonyme, UA desktop, attente réseau
+ 4 s d'hydratation, capture pleine page + `innerText` + liens, SHA-256 de chaque artefact
→ `manifest.json`. Evidence complète : [`docs/parity/livescan-2026-07-20/`](livescan-2026-07-20/).
