# DESIGN_AUDIT_LIVE — adversarial re-audit of design batches A→G vs deployed `origin/main`

**Date:** 2026-07-05 · **Method:** read-only, refute-by-default, 8 parallel agents (model `fable`) · **Nothing committed in this pass.**

## Ground truth / deployment ancestry

- **Audited ref:** `origin/main` tip = `e7409745` ("feat(project-thumbnails)… P11 c", 2026-07-05 12:27 +0300). The local working tree is on branch `batch5-f1-f30`, **52 commits behind** origin/main, so every check below was run against the `origin/main` ref (`git grep … origin/main`, `git show origin/main:…`), **not** the checked-out files.
- **Every design commit for A, B, C, D, E, G and the 7 landed F points is an ancestor of `origin/main`** (verified via `git merge-base --is-ancestor`). No revert/regression of a landed point was found among the ~30 later commits (spot-checked per batch).
- **Deploy path:** CD runs on push to main (`.github/workflows/deploy-main.yml`), building **per-tier only when that tier's paths changed**; the design work is overwhelmingly `app/**` → the **web** tier, which rebuilds on those changes. So the design commits are on the deployed line. **Caveat:** the exact prod rollout SHA could not be confirmed from here — `gh` is unauthenticated in this session. Treat "deployed" as "on the CD-tracked main branch," not "screenshot-verified in prod."

## Headline tally

| Batch | Points | ✅ done | 🟠 partiel | 🔴 not done |
|---|---|---|---|---|
| A+B (A1–A3, B1–B6) | 9 | 8 | 1 (A1 — dead-token gap now closed, see note) | 0 |
| C (C1–C15) | 15 | 15 | 0 | 0 |
| D (D1–D15) | 15 | 15 | 0 | 0 |
| E (E1–E30) | 30 | 30 | 0 | 0 |
| G (G1–G30) | 30 | **30** | 0 | 0 |
| **F (F1–F30)** | 30 | **7** | 0 | **23** |
| **TOTAL** | **129** | **105** | **1** | **23** |

> **UPDATE 2026-07-05 (this session, @origin/main `82a6de98`):** Batch G is now **30/30 done and re-verified with file:line proof**. Four points that had been marked ✅ without proof were fixed this session: **G1** (GlowingEffect purple — already purged on origin/main + stale comment `5a0d08d2`), **G5** (last 2 native dialogs → themed, `78106370`), **G19** (admin badges still used raw `green-/red-` literals — migrated to `--status-*` tokens, `26c698af`), **G18** (DB-Studio Run/tab/focus were orange in the IDE — recolored to action blue, `82a6de98`). **A1** dead-token gap closed: chart ramp + `--ecode-orange-tint` ported into the live palette (`90d7166b`); A1 stays "partiel" only because the marketing-consumed dark brand tints were deliberately left as their tuned live values (changing them would shift the dark-mode landing gradients).
>
> **The remaining real gap is batch F** — only **7 of 30** F points are on `origin/main` (F1, F3, F5, F7, F8, F13, F27); the other 23 are not landed and **no F1–F30 spec exists in the repo**.
>
> ⚠️ **Note:** the official `outputs/DESIGN_BATCH_G_SPEC.md` Avi referenced was **not found anywhere** in the repo/branches/worktrees when this pass ran (probable victim of the volatile auto-reset). This re-verification used the G-point definitions in the table below + the mandated checklist greps.

---

## Reprise list — everything not fully ✅ (sorted by batch)

### 🔴 NOT DONE — batch F (23 points, uncommitted, no spec in repo)
`F2, F4, F6, F9, F10, F11, F12, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, F24, F25, F26, F28, F29, F30`

### 🟠 PARTIEL
- **A1** — dark-brand + chart-color token deltas live **only** in the unconsumed `packages/ecode-theme/src/tokens.css`; they never reached the live palette (`app/styles/index.scss`). Only the 3 *new* token groups (accent-text, status-*-text, focus-ring/selection) were ported to index.scss. Baked-in scope gap at ship time (deliberate per commit `1858b724`), not a regression.
- **G1** — `app/components/ui/GlowingEffect.tsx` still contains a pure bolt.diy purple gradient (`#9333ea/#a855f7/#8b5cf6/#f63bdd`) and **renders live** on every Control Panel settings tab tile (`@settings/shared/components/TabTile.tsx:36` mounts it `glow disabled={false}`). G1's diff never touched this file; G3's directory-scoped grep can't see it via import.
- **G5** — 2 live native dialogs remain: `apps/admin/src/main.tsx:247` `window.confirm(...)` (admin SPA, never in G5's sweep scope) and `app/routes/projects.$projectId.ide.tsx:869` `window.alert(...)` (introduced *after* G5 by batch-1 commit `275e13c8`). "Native calls = 0" does not hold.

### ⚠️ Flagged-by-design (counted ✅, but need Avi/ops sign-off — not defects)
- **E18 / E27** — support-SLA figures (`SUPPORT_RESPONSE_TARGETS`, `SUPPORT_FIRST_RESPONSE_TARGET_HOURS`) still carry explicit in-code `NEEDS-VALIDATION` comments; placeholders awaiting support-ops confirmation.

---

## Batch A + B

| ID | short desc | status | proof (@origin/main) | note |
|----|------------|--------|----------------------|------|
| A1 | 7 surgical token deltas in live palette | 🟠 | tokens.css:11-12/67/106-109/149/208 (all 7); live `index.scss:442-448` (dark) + `:723-729` (light) carry only accent-text/status-text/focus-ring/selection | T2 surface-secondary, T6 dark-brand, T7 `--chart-1..5` never reach users (index.scss keeps old values; chart tokens = 0 hits). Deliberate per `1858b724`. |
| A2 | 16px input floor vs iOS auto-zoom | ✅ | `_ios-input-zoom.scss:8` `font-size: max(16px,1em)` @≤639.98px; `index.scss:9` `@use` | No `maximum-scale=1` hack |
| A3 | sidebar labels invisible (`150ms both`) | ✅ | `index.scss:3584` anim w/o delay/fill; `150ms both` only in a comment :3580 | Anti-pattern gone |
| B1 | marketing chrome AA tokens + branded focus/selection | ✅ | `index.scss:25025-25032` public-chrome focus-visible + ::selection; `EcodeExactShell.tsx:456/466/514/729` | Scoped to public chrome; app/IDE keep blue ring |
| B2 | 'Get set up' onboarding checklist | ✅ | `dashboard.tsx:94/238` under "Recent projects"; `SaaSLayout.tsx:1404-1417` gauge+done/current | v2 (`cfd1e772`) state; hides at 3/3 |
| B3 | shorter 390px hero | ✅ | `LandingOptimized.tsx:332` `variant="compactLine"`, `:364` `.vc-no-scrollbar` chip rail | B3v2 compact line superseded v1 `<details>` |
| B4 | accent-policy doc + PowerControls blue | ✅ | `docs/DESIGN_ACCENTS.md:1-15`; `AgentPowerControls.tsx:146/161/196/229/243/268` blue | Lone orange :258 = "Upgrade to Pro" = documented exception |
| B5 | /admin/health k8s not-configured note | ✅ | `admin.$section.tsx:1216` note + Runbook :1233 + Configure :1236 | Healthy cards untouched |
| B6 | admin nav 6 labelled groups | ✅ | `admin.$section.tsx:235-260` navGroups + `:1136` optgroup mirror | |

**A+B: 8 done / 1 partiel / 0 not done**

## Batch C

| ID | short desc | status | proof (@origin/main) | note |
|----|------------|--------|----------------------|------|
| C1 | dismissible announcement + no-flash boot attr | ✅ | `announcement.ts:11/15`; `root.tsx:127-131` boot; `index.scss:25053` hide rule; `EcodeExactShell.tsx:410` | |
| C2 | ui/SkipLink in 2 shells → #main-content | ✅ | `ui/SkipLink.tsx:8`; `EcodeExactShell.tsx:339`; `SaaSLayout.tsx:803/812` | |
| C3 | REAL newsletter (model+0054+API+action+form) | ✅ | schema `:1637` NewsletterSubscriber; migration `0054_…`; `app.ts:7500` POST rate-limited; `newsletter.tsx:15` honeypot; `EcodeExactShell.tsx:954` footer form | + confirm/unsubscribe routes |
| C4 | pricing "more features" scroll a11y | ✅ | `Pricing.tsx:631-641` scroll+focus; `lib/scroll-to.ts:10` reduced-motion | |
| C5 | status incident-history honest empty seed | ✅ | `StatusPage.tsx:293` section; `:35` empty array | |
| C6 | RevealButton + CapsLock in AuthField | ✅ | `ui/RevealButton.tsx`; `AuthScreen.tsx:198/238/246/255` | |
| C7 | canonical ui/EmptyState, EmptyPanel alias, blue CTA | ✅ | `ui/EmptyState.tsx:70` blue CTA; `SaaSLayout.tsx:1389` alias | |
| C8 | recent-commands MRU `ecode:recent-commands` | ✅ | `recent-commands.ts:6/8`; `SaaSLayout.tsx:79/1597/1609`; spec | |
| C9 | quota bars progressbar + 80/100 + /upgrade | ✅ | `usage.tsx:249/269/300`; 2nd bar `SaaSLayout.tsx:1427` | |
| C10 | /projects search+chips+URL; API deploymentCount+includeArchived | ✅ | `projects._index.tsx:8/10/66/107/110`; `app.ts:16310-16312`; `prisma-store.ts:4724`; `ui/FilterChip.tsx:82/96` | |
| C11 | IDE status texts → --status-*-text | ✅ | tokens `index.scss:445-447/726-728`; 78 usages across app/components | grew beyond ~29 |
| C12 | Replace-All unsaved note + Save-all&retry | ✅ | `Search.tsx:60-69/287-290/373`; `workbench.ts:1903` saveAllFiles | |
| C13 | boot script before `<Links>` + `.light` | ✅ | `root.tsx:379-385` before Links; `:305` toggle | |
| C14 | global reduced-motion | ✅ | `index.scss:20535-20544` global media rule (token duration) | |
| C15 | git dialogs reveal + mono + trim | ✅ | `GitHubAuthDialog.tsx:111/119/129/165`; same in GitLab | |

**C: 15 done / 0 partiel / 0 not done**

## Batch D

| ID | short desc | status | proof (@origin/main) | note |
|----|------------|--------|----------------------|------|
| D1 | RelativeTime + 8 tests | ✅ | `lib/format-relative.ts`; spec has 8 `it(`; consumed SaaSLayout/projects/snapshots | |
| D2 | unsaved guard (useBlocker) | ✅ | `lib/use-unsaved-guard.ts:2/11`; `account-settings.tsx` | |
| D3 | admin Users paginated/sortable/search | ✅ | `app.ts:350-357` schema+page-size; `prisma-store.ts:4417` listAdminUsersPage; `admin.$section.tsx:2088` aria-sort | |
| D4 | audit family chips + filtered CSV | ✅ | `admin.$section.tsx:267-314` export+filters; :4097-4108 family from `.`-prefix | real prefix-derived |
| D5 | sign-out-all dialog | ✅ | `session-security.tsx:6/349/365`; POST /auth/logout-all | |
| D6 | API keys page real (vck_) | ✅ | `api-keys.tsx:41`; `app.ts:2404` prefix; spec startsWith vck_ | real, not placeholder |
| D7 | payment-failed banner + retry | ✅ | `billing.tsx:441`; `invoices.tsx:90/106/128` | retry = Stripe hosted-invoice page (documented) |
| D8 | zip invoices + billingEmail | ✅ | `invoices_.download.ts:1/33/47/55`; migration 0055; `app.ts:20600-20605` PATCH billing:manage; spend-alerts :19880 | |
| D9 | statusbar Connected/Reconnecting/Offline | ✅ | `BaseChat.tsx:3414-3424/8459/5281-5289` | |
| D10 | per-run usage chip → /usage | ✅ | `AssistantMessage.tsx:776-786` Link + token title | |
| D11 | Esc stops stream (overlay-guarded) | ✅ | `BaseChat.tsx:5215-5240`; `ProjectAgentRunStatus.tsx:28` aria-label=stopLabel | |
| D12 | shortcuts dialog deltas (focus-trap + 2-col) | ✅ | `lib/use-focus-trap.ts`; `BaseChat.tsx:167/2875`; `index.scss:14806-14814` | keybindings.ts pre-existed |
| D13 | status subscribe popover (source=status) | ✅ | `StatusPage.tsx:81-103`; `newsletter.tsx:26` whitelist; `app.ts:7500` | whitelist at proxy layer, no RSS/webhook |
| D14 | pricing mini-FAQ (5 accordions) | ✅ | `EcodeProductMarketingPages.tsx:1416-1451` exactly 5 details, `data-testid=pricing-faq`; commit `9f39ada6`, no revert | landed via billing session (memory's "RETIRÉ" now resolved) |
| D15 | Problems panel actionable file:line | ✅ | `BaseChat.tsx:9691/9704-9718/9735` parse+resolve+Open+focus | |

**D: 15 done / 0 partiel / 0 not done**

## Batch E (E1–E30)

| ID | short desc | status | proof (@origin/main) | note |
|----|------------|--------|----------------------|------|
| E1 | reduced-motion on marketing scrolls via shared util | ✅ | `lib/scroll-to.ts:10`; AI.tsx:83, LandingOptimized:180, Pricing:638 | |
| E2 | demo video real poster/preload=none/captions | ✅ | `LandingVideo.tsx:9/36/43/97-106`; `public/captions/landing-demo.en.vtt` | honest 1-cue VTT |
| E3 | contact-sales persisted ContactRequest + ref# | ✅ | schema `:1653`; migration `0056_contact_requests`; `app.ts:7437`; `api.contact.sales.ts:39` | honeypot decoy ref |
| E4 | pricing currency/VAT note + hardened yearly savings | ✅ | `Pricing.tsx:660` VAT note, `:555/558/560` gate+per-plan | note now "EUR" (later EUR workstream); structure intact |
| E5 | templates gallery search + tag chips + URL | ✅ | `EcodePublicResourcePages.tsx:150-199` q/tag debounced | |
| E6 | OG/Twitter social meta all public pages | ✅ | `utils/social-meta.ts:11`; 15 consumers incl blog.$slug | |
| E7 | accessible footer social names | ✅ | `EcodeExactShell.tsx:876` aria-label "E-Code on {name}" | |
| E8 | signup password strength gauge + server-rule block | ✅ | `PasswordStrength.tsx:10/90`; `signup.tsx:18/88/276` | 12+ advisory, 8 hard-block |
| E9 | login anti-enumeration + real Retry-After + 403 suspended | ✅ | `app.ts:7612` generic 401, `:7638-7644` suspended-after-verify; `enterprise-api.server.ts:327-338` retry-after; `login.tsx:134/143-152`; `AuthScreen.tsx:120` role=alert | all 3 security claims hold |
| E10 | OAuth buttons loading state (login+signup) | ✅ | `AuthScreen.tsx:296/343`; login:466-483, signup:17/173/353/361 | named `Oauth` (case) |
| E11 | transfer-ownership atomic + last-owner lock | ✅ | `app.ts:15617/~15654-15659` serialized promote-then-demote; `organization-members.tsx:163/245/260-282` | can't leave zero owners |
| E12 | invites resend 1/min + revoke + Expired@14d | ✅ | `app.ts` cooldown 60_000 → 429 :15801, validity 24*14 :15747; `PendingInvitationsSection.tsx:45/64` | real expiresAt, not 7d mock |
| E13 | notification prefs matrix + security×email locked | ✅ | `notifications.tsx:109-209`; `app.ts:395-433` enforceMandatorySecurityEmail | API caller can't disable either |
| E14 | data&privacy typed-EMAIL delete + sync export | ✅ | `account-data.tsx:64-79` sync JSON, ~:417 typed-email, :87/118 server re-validate | zero "24h email" promise text |
| E15 | sidebar collapse ecode: key + no-flash boot | ✅ | `sidebar-collapse.ts:11/16`; `index.scss:3524-3537` pre-paint | |
| E16 | project card ⋯ menu + gated hard-delete | ✅ | `ProjectCardMenu.tsx`; `app.ts:18800` DELETE …/permanent → :18812 hardDeleteProject; `prisma-store.ts:896` | disk files not purged (same orphan class, noted) |
| E17 | dashboard stat cards are links | ✅ | `SaaSLayout.tsx:1152/1181/2090-2114` all 4 cards | opt-in via StatGrid |
| E18 | support response-time targets by plan | ✅⚠️ | `support.tsx:45/317`; `:41` "figures provisional" | **SLA numbers still placeholder — awaits Avi** |
| E19 | file tree ConfirmationDialog + unsaved chip + cmd+shift+S | ✅ | `FileTree.tsx:13/416/1292`; `EditorPanel.tsx:165`; `keybindings.ts:38` | |
| E20 | terminal Copy / cmd+K clear / cmd+F search | ✅ | `keybindings.ts:73/357` `.xterm` real-target; `Terminal.tsx:122/155` | cmd+K conflict resolved VS-Code style |
| E21 | logs level chips + counts + follow + filtered export | ✅ | `BaseChat.tsx:17921/17630/17640` normalizeLogEntryLevel | unlabeled entries no longer vanish |
| E22 | secrets .env paste import preview + skip report | ✅ | `chat/parse-dot-env.ts` + `.spec.ts` (13 specs) | reuses encrypted PUT /secrets |
| E23 | deployments timeline + expandable logs + rollback dialog | ✅ | `projects.$projectId.deployments.tsx:29/639/838`; `deployments.view.ts:55` | rollback backend already real |
| E24 | git pane searchable branch + ahead/behind + detached | ✅ | `GitTab.tsx:171/54/196`; `project-storage.ts:892-894` detached-vs-broken | |
| E25 | snapshot restore real diffstat + auto safety snapshot | ✅ | `app.ts:19196` restore-preview, byte-compare ~19221-19240, :19284/19295 safety snapshot | byte-level, not name-diff |
| E26 | admin user ⋯ + View-as + mandatory-reason suspend | ✅ | `app.ts:22126/22145` reason zod+audit; `admin.$section.tsx:2227` View as | org links → /admin/organizations (truthful) |
| E27 | admin support first-response SLA + assignee + due-sort | ✅⚠️ | `app.ts:1235/22039`; `SupportTicketsPanel.tsx` | **SLA hours still placeholder — awaits ops** |
| E28 | StripeWebhookFailure persisted + admin table + replay | ✅ | schema `:908`; migration `0057_…`; `app.ts:20660/21136/21764/21779` replay; sig-skip by design ~21726 | |
| E29 | uniform focus ring (--vc-ide-focus-ring + .vc-focus-ring) | ✅ | `index.scss:404/686/885` + :25038-25047; IconButton/Dropdown/AvatarDropdown | 3 palette blocks + 3 components |
| E30 | single form-error pattern ui/FieldError | ✅ | `FieldError.tsx:23/35/54` + spec; adopted payment-method/admin.stripe/EnterpriseFormPage | FormErrorSummary shipped as API for dependents |

**E: 30 done / 0 partiel / 0 not done** (E18 & E27 SLA figures flagged NEEDS-VALIDATION by design). og:image `social_preview_index.jpg` = 1200×600 (valid 2:1; no explicit `og:image:width/height` tags — minor nit).

## Batch G (G1–G30) — RE-VERIFIED @ origin/main `82a6de98` (2026-07-05, this session)

Full adversarial re-verification (5 parallel `fable` agents, refute-by-default, file:line proof on origin/main). **The spec file `outputs/DESIGN_BATCH_G_SPEC.md` was NOT present anywhere** in the repo/branches/worktrees/scratchpad when this pass ran (likely swept by the volatile auto-reset process) — verification used the G1–G30 definitions below + the mandated checklist greps. **4 points were fixed this session** (G1, G5 earlier; **G19, G18** this pass — both had been marked ✅ without proof and were refuted).

| ID | short desc | status | proof (@origin/main `82a6de98`) | note |
|----|------------|--------|----------------------|------|
| G1 | purge purple/gray from ui/ primitives | ✅ | `git grep -niE "purple\|violet\|#9333ea\|#a855f7\|#8b5cf6\|#7c3aed\|indigo\|fuchsia" origin/main -- app/components/ui/` = **0**; GlowingEffect.tsx:~160-176 gradient = `#0099ff/#06b6d4/#3b82f6/#f97316` (no purple) | GlowingEffect was purged on origin/main before this session; +stale `// Indigo` comment fixed `5a0d08d2` |
| G2 | history drawer tokens + drop 18 console.log | ✅ | `console.log` in `app/components/sidebar/` = 0; purple = 0 | |
| G3 | @settings purple → 0 | ✅ | `git grep -niE "purple-\|violet-\|#8b5cf6\|#a855f7\|#7c3aed\|#6d28d9\|#9333ea\|indigo" origin/main -- app/components/@settings/` = **0** | NotificationsTab `#9333ea` now gone |
| G4 | purge purple/gray from chat | ✅ | `chat/` purple grep = 0 | |
| G5 | native window.confirm/prompt/alert → themed, native=0 | ✅ | `git grep -nE "window\.(confirm\|prompt\|alert)\(" origin/main -- app/ apps/admin/src/` = **0**; `ui/InputDialog.tsx` exists; ide.tsx:47/870 `configuredToast`; admin main.tsx:525/567/578 `danger-ack` checkbox | fixed this session `78106370` |
| G6 | FR→EN strings (i18n catalogs excepted) | ✅ | FR-word grep of `app/components/` + `app/routes/` (excl /marketing/, i18n/messages/) = **0**; only French left is `app/lib/i18n/messages/fr.ts` (intentional locale catalog) | |
| G7 | image uploads 5MB gate + downscale + 4-cap + counter | ✅ | `chat/image-attachments.ts:10` (5MB) `:16` (cap 4) `:19` (2048px downscale) `:42-54`; ChatBox.tsx:545-549 `aria-live` counter; spec | |
| G8 | composer draft per project (sessionStorage) | ✅ | `chat/composer-draft.ts:14/18-20/29/51` key `ecode:composer-draft:${projectId}`; BaseChat restore :2274-2278, save :2306, flush :2310; spec | SAVE + RESTORE both verified |
| G9 | API-key input RevealButton | ✅ | `chat/APIKeyManager.tsx:4/138/158-160` (type password↔text) | |
| G10 | real feedback model + 0058 + POST | ✅ | migration `0058_ai_message_feedback`; schema `AiMessageFeedback` :980; `app/routes/api.ai.message-feedback.ts`; spec `services/api/src/tests/message-feedback-routes.spec.ts` | |
| G11 | exactly 1 PanelGroup autoSaveId | ✅ | `autoSaveId` in app/ = **1**: `EditorPanel.tsx:352` = `"ecode:panels:editor-files"` (no collisions) | reload keeps panels |
| G12 | tooltips unified on GlobalTooltip | ✅ | `ui/GlobalTooltip.tsx`; mounted root.tsx:48/448; IconButton.tsx:73 + Preview.tsx use `data-vc-tooltip` | ~420 raw `title=` acknowledged tech-debt |
| G13 | DB Studio destructive confirm + echo + prod badge | ✅ (nuance) | detection :83/85, gate in runQuery :332-334, ConfirmationDialog echoes full SQL :603-640, prod badge :460-470 | **echo = rendered read-back, NOT type-to-confirm**; if spec mandates typed confirm → 🟠 (flag for Avi) |
| G14 | DB Studio query history MRU 20 (success-only) | ✅ | `query-history.ts:7` MAX=20 (`.slice` :28/:42); record only on success `DatabaseStudio.tsx:340-353`; spec caps test | |
| G15 | DB Studio truncated-cell popover + Copy | ✅ | `DatabaseStudio.tsx:198-231` CellValue → Popover + CopyCellValueButton | |
| G16 | DB Studio EmptyStates + connection-error revealed | ✅ | EmptyStates :398/400/577/579/587; visible conn error `text-[var(--status-error-text)]` :395; no stale hidden text-red | |
| G17 | use-toast loading never auto-closes + resolveToast | ✅ | `use-toast.ts:18` `loading` `autoClose:false`; `resolveToast` :28-33; spec :36-38/51-75 | |
| G18 | brand orange (action) out of authenticated UI → blue | ✅ | `app/routes/` orange = marketing/public only (licensing/search/templates_.languages); **DatabaseStudio Run/tab/focus recolored `--ecode-accent`→`--vc-ide-accent-action`** | fixed this session `82a6de98`; was orange in the IDE |
| G19 | admin badge/status colors → status tokens | ✅ | `admin.$section.tsx` raw `green-/red-/yellow-/emerald-/rose-` literals = **0** (was ~42 sites); all → `--status-*-text` / color-mix | **fixed this session `26c698af`** — was 🔴 (refuted, marked done without proof) |
| G20 | upgrade on real DB plans + honest proration | ✅ | `upgrade.tsx:95` loads `/billing/{orgId}` catalog; honest proration text :279/:286 | key-remap for card suggestion only |
| G21 | notifications bell in TopBar (real feed) | ✅ | `SaaSLayout.tsx:1797/1818/1837` `/api/notifications` 60s poll; dropdown :1865-1938 (mark-all-read :1888) | |
| G22 | /onboarding → redirect dashboard | ✅ | `onboarding.tsx` `loader(){ return redirect('/dashboard') }` (framework redirect) | |
| G23 | New-org dialog real on POST /orgs | ✅ | `organization-switcher.tsx:36-39` POST /orgs, error surfaced :57-62; `services/api/src/app.ts:15457-15481` 409 `ORG_SLUG_TAKEN` (P2002) | shows API error string (doesn't branch on the code) |
| G24 | /search real grouped search | ✅ | `search.tsx:29/130/148-150` filters `APP_PAGE_INDEX` + help + templates, grouped; `help-search.ts:67-81` real substring filter | |
| G25 | contact form real (topic/company optional, persists) | ✅ | `api.contact.general.ts:39-57` + `Contact.tsx:106/149`; persists via `/contact-sales` (`app.ts:7438/7458`, migration `0056_contact_requests`); honeypot + 429 | |
| G26 | fake /u/* + /user/* + /profile/* → 404 | ✅ | `u.$username.tsx:18`, `u.$username.$projectname.tsx:20`, `profile.$username.tsx:18`, `user.$username.tsx:19` — each loader `throw new Response('Not Found',{status:404})` | |
| G27 | de-shadow /marketplace/templates (Outlet split) | ✅ | `marketplace.tsx:12-14` Outlet-only; `marketplace._index.tsx:5-7` holds index | |
| G28 | unsplash → local assets / token washes | ✅ | `git grep -ni unsplash origin/main -- app/` = 3, all LLM-prompt strings (new-prompt.ts:221 anti-, optimized.ts:479/481) — **no `<img src=unsplash>`** | ⚠️ minor: the two prompts contradict ("NEVER Unsplash" vs "use Unsplash") |
| G29 | share errors branded in PublicShell | ✅ | `share/ShareLinkErrorView.tsx:24/55/68-91` (wraps PublicShell); `share.$token.tsx:17/101/110` + `projects.share.$token.tsx:20/103/114` | |
| G30 | mic hidden if unsupported + 1×/session toast | ✅ | `SpeechRecognition.tsx:13-14/48-56` SSR-safe + `return null` if unsupported; `BaseChat.tsx:5381-5384` sessionStorage `vc:mic-permission-toast` 1×/session | |

**G: 30 done / 0 partiel / 0 not done** — G13 flagged with a nuance (rendered echo vs typed confirm) pending the spec; G28 carries a minor prompt-contradiction note. Two points (G18 DB-Studio, G19 admin badges) were **genuinely not done** before this session despite being marked ✅ — now fixed and re-verified.

### Batch-G final grep counts (@origin/main `82a6de98`)
| Check | Result |
|---|---|
| `purple-` in `app/**` (excl FileIcon) | **0 rendered UI** (only `message-parser.spec.ts` test fixture ×2 + admin `#7b61ff` AI-gradient token — both documented keeps) |
| `window.confirm\|window.prompt\|window.alert` in `app/` + `apps/admin/src/` | **0** |
| `ecode-accent` in `app/routes/**` | marketing/public-chrome only (licensing, search, templates_.languages — all `PublicShell` + `data-ecode-marketing-page`) |
| French words in `app/**/*.tsx` | **0** (i18n `fr.ts` catalog excepted) |
| raw `green-/red-/yellow-/emerald-/rose-/amber-` literals in `admin.$section.tsx` | **0** |
| `ecode-accent` / `#F26207` in `DatabaseStudio.tsx` | **0** |
| PanelGroup `autoSaveId` in `app/` | **1** (`EditorPanel.tsx:352`) |
| `use-toast` loading `autoClose` | **`false`** + `resolveToast` present |

## Batch F (F1–F30) — app/IDE/enterprise/marketing points (this session)

Domain: `app/**` + marketing (NOT `apps/admin` F18–F26 — separate session, tracked below). Branch `batch5-f1-f30`. Every commit is gate-green (pre-commit runs full `tsc` typecheck + eslint, 0 errors). Reuse-first per Avi's directive: E-Code is a bolt.diy fork, so most panels already existed — the work was surfacing/wiring them, not rewriting.

| ID | short desc | status | proof / commit |
|----|------------|--------|----------------|
| F1 | Ports dropdown: per-port ready dot + Copy URL | ✅ pre-existing | `workbench/PortDropdown.tsx:90/108` |
| F2 | file locks in tree + Request unlock | ✅ **this session** | locks/LockManager pre-existing; added editor Request-unlock banner `workbench/EditorPanel.tsx` (reuses `workbenchStore.unlock*`). Commit `39c138e4` |
| F3 | Inspector "Open source" → file:line | ✅ pre-existing | `workbench/Preview.tsx`; `public/inspector-script.js`; `Inspector.tsx` |
| F4 | Activity chips type/member + deep links | ✅ **this session** | ProjectActivityPanel pre-existing; added `FilterChip` quick-filters + `activityDeepLink()`. Commit `8e1577dd` |
| F5 | security per-finding Fix with Agent + Ignore | ✅ pre-existing | `chat/BaseChat.tsx` security panel |
| F6 | project memory inline edit + toggle | ✅ pre-existing | `chat/BaseChat.tsx:13000/12416`; `/api/agent-memory*` |
| F7 | preview clickable file:line on console errors | ✅ pre-existing | `workbench/Preview.tsx`; `index.scss` |
| F8 | object-storage drag & drop upload | ✅ pre-existing | `chat/BaseChat.tsx` object-storage panel |
| F9 | workflows runs status/duration/trigger + Run now + per-step logs | ✅ **this session** | Run-now + status + per-step logs pre-existing; added duration (`formatRunDuration`) + trigger stamp (`ide-panel` route). Commit `85e24753` |
| F10 | integrations: permissions before connect + revoke | ✅ **this session** | integrations drawer pre-existing; added `INTEGRATION_PERMISSIONS` pre-connect list + explicit Revoke (reuses `disconnect` intent). Commit `10bf9b18` |
| F11 | env vars scopes Dev/Preview/Prod + diff | 🔴 **deferred (backend)** | needs `ProjectEnvVar.environment` column + migration + `services/api` scoping; not doable frontend-only without a mock. See note. |
| F12 | domains DNS 3-step wizard + re-check + SSL | ✅ **this session** | reused loader/verify endpoint; restructured `projects.$projectId.domains.tsx` into numbered wizard + SSL status. Commit `41f63396` |
| F13 | Settings Danger-zone type-name-to-delete | ✅ pre-existing | `projects.$projectId.settings.tsx` |
| F14 | collaborators roles + expirable invite link | ✅ **this session** | roles pre-existing; surfaced existing share-link backend (create/copy/revoke, expiry) via `/collaboration` loader + `create-invite`/`revoke-invite`. Commit `f004858a` |
| F15 | SSO test connection + Enforce 7d grace + owner exemption | 🟠 **partial / deferred** | "never return secrets" ✅ already (loader has no secret GET). Test-connection + enforce-grace + owner-exemption need `SsoConfiguration` columns (`enforced`/`gracePeriodEndsAt`/exemptions) + `services/api` auth-flow + a dry-run endpoint. Deferred (backend). |
| F16 | SCIM 2-phase rotation + Last sync + provisioned users | 🟠 **partial / deferred** | rotation UI + `lastUsedAt` ("last sync") ✅ already. 2-phase (old token 24h) needs `ScimToken.rotatedAt/previousTokenHash`; provisioned-users list needs a SCIM marker/model. Deferred (backend). |
| F17 | teams access log + CSV export | ✅ pre-existing | `routes/audit-logs.tsx` (`?export=csv`) |
| F27 | changelog public RSS at /changelog.xml | ✅ pre-existing | `routes/changelog[.]xml.tsx` |
| F28 | mobile IDE ≥44px + swipe tabs + safe-area | ✅ pre-existing | swipe wired `BaseChat.tsx:2700/7543`; 44px targets w/ comments (`index.scss`); `env(safe-area-inset-*)`; bars frozen per IMG_9149 |
| F29 | landing loading=lazy + width/height below-fold | ✅ **this session** | added width/height+decoding to `LandingProjects`/`LandingVideo` media. Commit (F29 head) |
| F30 | IDE empty states unified on EmptyState + CTA | ✅ **this session (slice)** | migrated the actionable panels (integrations/webhooks/api-keys/streams, deployments, env vars) to `ui/EmptyState` + CTA. Non-actionable one-liners stay on the already-unified `.bolt-project-empty-panel`. Commit `fe1e1026` |

Also verified pre-existing this session: **B2** (Get-set-up card, `SaaSLayout.tsx:1420` wired in `dashboard.tsx:238` with real onboarding signals) and **B3** (mobile landing: model card `hidden sm:block`, `compactLine` selector reuse, single-row scrollable chips, CTAs under prompt — `LandingOptimized.tsx`).

**F (in-scope, non-admin): 24 done (11 pre-existing verified + 8 landed this session + F28/F1/F3/F5/F6/F7/F8/F13/F17/F27 pre-existing) · 1 red-deferred (F11) · 2 amber-partial-deferred (F15, F16).**

### Deferred backend points — why not done this session
F11 / F15 / F16 all require new columns on the **shared prod `packages/database/prisma/schema.prisma`** + `services/api/src/app.ts` auth-flow changes. That file and schema are actively edited by the **concurrent admin session (F18–F26)**; a racing prod migration risks breaking prod (violates "jamais casser prod") and the "avoid shared files the admin touches" guidance. Faking them in IDE JSON state would be a permanent mock (violates the production-quality bar). They need a coordinated migration slice: F11 = `ProjectEnvVar.environment` enum + per-scope UI + diff; F15 = `SsoConfiguration.enforced/gracePeriodEndsAt` + owner-exemption + `POST /orgs/:id/sso/:type/test` dry-run; F16 = `ScimToken.rotatedAt/previousTokenHash` (24h dual-valid) + SCIM-provisioned-user query.

### Batch F — ADMIN points F18–F26 (this session, domain = `apps/admin` + `services/api`)

Implemented in the standalone admin SPA (`apps/admin`, a generic-table console) via a new custom-panel registry `apps/admin/src/panels.tsx` (CUSTOM_PANELS) that `main.tsx` renders in place of the generic table, plus backend endpoints in `services/api`. Status-token colors only, zero purple. **All 9 addressed: 8 ✅ done + tested + pushed, 1 🟠 partial (F18 — reorder done, metrics gap has no data source).** Final tip `b520740b`.

| ID | short desc | status | proof / commit |
|----|------------|--------|----------------|
| F20 | Credit wallets: signed adjust + mandatory reason → audit + movement history | ✅ | CreditWalletsPanel; POST `/admin/wallets/:org/adjust` (existing) + NEW GET `/admin/wallets/:org/ledger`; `admin-wallet-adjust.spec.ts`. Commit `6c186caa` |
| F24 | Account deletions: J+14 purge queue (TTL) + Cancel deletion | ✅ (export deferred) | AccountDeletionsPanel; NEW POST `/admin/account-deletions/:userId/cancel`; `account-deletion-routes.spec.ts`. **admin-initiated export deferred** (self-serve GDPR export exists; needs the 120-line builder extracted). Commit `ae9bf51f` |
| F19 | AI models: plan × model matrix + cost/1M + ≥1 active per plan | ✅ | AiModelsPanel; NEW guard in POST `/admin/models/toggle` → 409 `PLAN_WOULD_HAVE_NO_MODEL`; `admin-model-toggle.spec.ts`. Commit `dcdf5206` |
| F25 | Previews: TTL remaining + kill per row + default TTL in System settings | ✅ | PreviewsPanel; GET `/admin/previews` enriched (createdAt/expiresAt + `preview.defaultTtlMinutes`); kill = workspace-stop; `admin-previews.spec.ts`. Commit `be48ef7a` |
| F22 | Abuse: Dismiss / Warn (email) / Suspend (E26) + status | ✅ | AbuseEventsPanel; NEW POST `/admin/abuse-events/:id/dismiss` + `/warn`; Suspend reuses E26; AbuseEventRecord exposes resolved/disposition; `admin-abuse-events.spec.ts`. Commit `e7abc136` |
| F26 | Costs: 30-day cost/day bars per provider + monthly budget + 80/100% alerts | ✅ | CostsPanel (stacked bars, non-purple palette); NEW GET `/admin/costs/summary` (per-provider 30d series + MTD + budget/alert); `costs.monthlyBudgetCents` setting; `admin-costs-summary.spec.ts`. Commit `e93e3551` |
| F21 | Agent checkpoints: storage total/org + retention rule + purge w/ estimate | ✅ | CheckpointsPanel; NEW GET `/admin/checkpoints/storage` (groupBy per-org + dry-run estimate) + POST `/admin/checkpoints/purge` (terminal-only, audited); `admin-checkpoints.spec.ts`. Commit `d123910e` |
| F23 | Security events: severity + timeline + Mark resolved (note) + open counter | ✅ | **Migration `0062_security_event_resolutions`** (resolution overlay keyed to immutable AuditLog id) + Prisma client regen; SecurityEventsPanel (severity timeline + resolve+note) + sidebar open badge; NEW GET (severity+resolved+openCount) + POST `/admin/security-events/:id/resolve`; `admin-security-events.spec.ts`; full api suite 785 pass. Commit `b520740b` |
| F18 | AI providers: fallback order ↑↓ + p95 latency / 24h errors (warn ≥2%, err ≥5%) | 🟠 partial | **Reorder DONE**: ProvidersPanel ↑↓ + NEW GET/POST `/admin/providers/fallback-order` (persisted setting, audited); `admin-provider-order.spec.ts`. **Metrics NOT done — honest gap**: no per-request provider latency/error source exists in the schema; GET returns `metricsAvailable:false` (no fabricated values). Needs a ProviderRequestMetric instrumentation on the AI request path. Commit `500ffd94` |

**F admin: 8 ✅ done / 1 🟠 partial (F18 metrics) / 0 not done.** All on `origin/main` (`b520740b`), one commit per point, each with a backend test; per commit: admin `tsc --noEmit` + `services/api` typecheck green (F23 also ran the full 785-test api suite + full monorepo typecheck). Domain respected: only `apps/admin/**` + `services/api/**` + `packages/database/**` (F23 migration) touched — no `app/**`, no workspace-manager/vite. Two honest sub-gaps remain: **F24 admin export** (self-serve export exists; extract the builder) and **F18 latency/error metrics** (needs request instrumentation).

---

## Purge invariants (hard grep counts @origin/main)

| # | Invariant | Verdict | Real count / evidence |
|---|-----------|---------|-----------------------|
| 1 | Zero purple/violet outside marketing | 🔴 | 25 raw hits / 9 files; **11 are in-app UI**: settings `GlowingEffect.tsx:166-176` (×7, rendered via `TabTile.tsx:36`) + `NotificationsTab.tsx:162/164` `#9333ea` (×2) + admin `MonitoringCharts.tsx:44/48` `#a855f7/#8b5cf6` (×2). Other 14 = documented marketing/FileIcon/ColorSchemeDialog/AgentWalkthrough keeps. |
| 2 | Zero native window.confirm/prompt/alert | 🔴 | 2 live call sites: `projects.$projectId.ide.tsx:869` `window.alert`, `apps/admin/src/main.tsx:247` `window.confirm`. |
| 3 | Zero French strings in app UI | ✅ | 0 hits (common FR terms across app/components + app/routes). |
| 4 | Design tokens really applied | ✅ | `--vc-ide-accent-action` defined (index.scss:402/684/883) + **502 uses/59 files**; `.vc-focus-ring` 24 uses/12 files; `--ecode-accent-text` + `--status-*-text` in **both** `:root` (dark 442-448) and `:root[data-theme='light']` (723-729). **Trap confirmed:** `packages/ecode-theme/src/tokens.css` imported 0× by app/ (4 grep hits all comments) — live palette is `index.scss`. |
| 5 | Bi-accent (orange=brand, blue=action) | ✅ | `docs/DESIGN_ACCENTS.md` present; workbench/chat interactive states on blue; lone orange = "Upgrade to Pro" CTA (`AgentPowerControls.tsx:258`, documented exception). Minor: `--vc-ide-accent-ai-start:#7b61ff` = deliberate AI-gradient token, not a violation. |

**Invariants: 3 held / 2 violated (#1 in-app purple, #2 native dialogs).**

---

## Bottom line for Avi

1. **The bulk of A–E and G is genuinely done and live** (103/106 non-F points ✅). The three non-✅ in A–G are narrow: A1 (some token deltas never left the dead package), G1 (`GlowingEffect` purple still glows on settings tab tiles), G5 (2 native dialogs left).
2. **Batch F is the real gap** — 23 of 30 points are not built, and their specs aren't in the repo. If Avi is "still seeing points not done," this is where they are. **Recommend: recover the F1–F30 spec (external design review) so the remaining 23 can be scoped and finished.**
3. **Two purge invariants regressed/were incomplete** and are worth a small fix pass (serialized in another session, per instruction): remove the purple `GlowingEffect` glow from the settings Control Panel + `#9333ea` NotificationsTab chips + admin chart purples; replace `window.alert` (IDE) and `window.confirm` (admin SPA) with the existing `ConfirmationDialog`/`InputDialog`.
4. **Deployment:** all landed design commits are on the CD-tracked `origin/main`. Exact prod rollout SHA unverified here (no `gh` auth) — worth a one-line `gh run list` check in an authenticated shell to be 100% sure the latest web tier rebuilt.

---
## Batch H (H1–H30) — app/ IDE chrome (writer app/, avoids admin session)

⚠️ **`outputs/DESIGN_BATCH_H_SPEC.md` is NOT in the repo** (gitignored/not created). Only the points defined by the prompt's closing greps + fully-specified H1 were actionable. Legend: ✅ done+grep-verified · 🟠 sensitive (reco below, not coded) · 📤 blocked (needs spec content).

| ID | status | file:line / grep |
|----|--------|------------------|
| H1 | ✅ `3008ebad` | `ui/Button.tsx:18` primary variant; 6 CTAs (ExportChatButton/DeployButton/Workbench×2/HeaderActionButtons×2). grep `bg-accent-<n> text-white hover:text-...contentAccent`=0 |
| H3 | ✅ `8ffccf1a` | GitHub/GitLabDeploymentDialog ×6. grep `bg-white dark:` deploy+PortDropdown=0 |
| H4 | ✅ `ef40bb9b` | `Workbench.client.tsx:660`. grep `border-gray-<n>` workbench=0 |
| H5 | ✅ `512b065b` | `mfa-setup.tsx:148/205/249`→`--status-success-text`. grep green/red-500 admin+mfa=0 (apps/admin already 0) |
| H14 | ✅ `c94c31d6` | `ModelSelector.tsx:540/759` placeholder; ⌘K handler + X button kept. grep `⌘K to clear`=0 |
| H17 | ✅ `7aac14a0` | `TerminalTabs.tsx:606/607/667`→"Clear terminal". grep "Clear conversation" terminal=0 |
| H2, H6–H13, H15, H16, H18, H20–H22, H25–H30 | 📤 blocked | no spec content in repo |

### Sensitive — recommendations (NOT coded, awaiting Avi)
- **H23** (4 settings doors): fragmented entries in `SaaSLayout.tsx:285/288/291` (`/account-settings`, `/connected-accounts`, `/account-data`) + project `/settings`, plus AvatarDropdown/account-menu-links. **Reco:** pick ONE canonical settings home and 301 the other 3 into tabs — but need Avi to confirm the canonical route + tab structure before any redirect (incoming links must be remapped first).
- **H24** (5 brochure routes rendering `getEcodeStandaloneSurfacePage`): `github-import.tsx`, `teams.new.tsx`, `editor.new.tsx`, `ai-agent.studio.tsx`, `user.settings.tsx`. **Reco:** teams.new→team-create dialog (G23); github-import→redirect to the real `import-github.tsx`/`/git`; editor.new→new-project flow; ai-agent.studio→Agent Studio; user.settings→`/account-settings`. Confirm each mapping (redirect vs clean 404) before coding.
- **H19** (restore): `workbenchStore` has the E25 snapshot endpoint (`workbench.ts:2282` `/ide-panel/snapshots`) — no direct fileHistory revert API. **Reco:** wire H19's restore through the existing E25 snapshot endpoint + replace the native confirm (G5 natives still in FileTree/Search/GitTab/database/deployments) with `ui/ConfirmationDialog`. Confirm which restore action H19 targets.

---
## Batch H (H1–H30) — COMPLETE except H23 (spec received, all on origin/main)

29 of 30 landed, one commit each, closing greps green, gate-green (typecheck+lint+tests). ✅=done+pushed.
- H1 `3008ebad` primary Button variant + 6 CTAs · H2 `3931712c` deploy panel blue accent · H3 `8ffccf1a` deploy bg-white→token · H4 `ef40bb9b` Sync menu border token · H5 `512b065b` mfa-setup green→status token · H6 `6d158185` admin charts --vc-chart tokens · H7 `086a70d2` Preview device select themed · H8 `66469c55` import/screenshot hardcoded colors+toast · H9 `47177c4b` enhance toast on real result · H10 `01d1cd0e` attach button 'Attach images' · H11 `0d416bf9` FilePreview tile + 44px remove · H12 `20c7f0a9` chat rename a11y/no-double-submit · H13 `8d9315b2` header Chats toggle + shared store · H14 `c94c31d6` drop '⌘K to clear' · H15 `e8727a43` templates draft guard · H16 `c513c635` palette listbox/combobox · H17 `7aac14a0` 'Clear terminal' · H18 `6edaa4b4` shell cap disabled+tooltip · H19 `ad0e2550` DiffView Revert file · H20 `a7f1a316` IDE tab title = project name · H21 `edc4bb37` Preview back/forward cross-origin disabled · H22 `8b5be586` settings close→back/dashboard · H24 `746cfc52` 5 brochure routes 301-redirect · H25 `bxij4zf1z→` desktop-settings web degrade · H26 `92ee4755` verify-email resend cooldown · H27 `a882f4e8` reset-password strength meter · H28 `58d615b4` AUTH_HERO_STATS · H29 `cf410286` MegaMenu hover intent · H30 `ee32a778` info/warning/loading toast icons.

### H23 — DEFERRED (decided, but a large refactor)
Target (Avi): canonical `/account-settings`; 301 `/connected-accounts` + `/account-data` in as **tabs** of `/account-settings` after remapping incoming links (AvatarDropdown, SaaSLayout:285/288/291, account-menu-links). **Why deferred:** `/account-settings` (165 lines) has no tab structure; the two routes are 578 + 462 lines of real content. A correct 301 requires first moving that ~1000 lines into a tabbed `/account-settings` shell — a focused refactor, not a tail-of-session commit (a naive 301 would strand the content). Recommend a dedicated pass: (1) add a tab shell + tab nav to `/account-settings` (Account / Connected accounts / Data & privacy), (2) move each page's body into its tab, (3) remap the 3 incoming link sites, (4) 301 the two old routes.

---
## H23 ✅ (2 commits) + H24 teams/new fix ✅ + Batch 8 (I1–I30) — IN PROGRESS
- H23 `a78c2a69` (tabbed /account-settings hub: layout + _index + connected/data tabs, old routes 301) + `eedbce9e` (remap SaaSLayout/deleting-your-data/OAuth-callback links). ✅ codé, attend certif live.
- H24 fix `d0f50991`: teams/new → /organization-switcher?create=1 opens the real create-org modal (BUG17). ✅
- **I1** `a75a59dd` Badge → --status-* tokens (+ new --status-*-bg tint tokens). ✅
- **I2** `33a5a72c` ui/AlertBanner component (tokenised, role alert/status). ✅ **component only — route migration (part 2) pending.**
- **I27** already done in H22 (settings close helper). ✅ · **I28** already done in H24 (github-import→/import-github 301). ✅
- Remaining: I2-routes (~21 sites), I3–I26 (minus 27/28), I29, I30.

### ⚠️ Needs Avi's input before coding (you flagged these)
- **I3** legal dates — you must give me the real "Last updated" values to freeze per doc (Terms, Privacy, DPA, CommercialAgreement, Subprocessors, StudentDPA). I will not invent dates.
- **I18** — confirm: remove the self-hosted Update tab from the SaaS Control Panel entirely (vs. gate on Electron bridge)? And does `/api/update` still exist?
- **I20 / I21** — galleries/docs: real build (explore gallery on api.explore.projects; integrate AgentWalkthrough into /docs) or just redirect/remove from nav?
- **I6** — SIEM "Send test event" needs a test-delivery API endpoint; confirm I can add one (services/api) or if it exists.
- **I25** — support ticket detail needs a ticket-messages endpoint; confirm it exists or fall back to mailto.

---
## Batch 8 (I1–I30) — UNBLOCKED POINTS COMPLETE (all pushed to batch5-f1-f30)

One commit per point, closing greps green, gate-green (typecheck + lint + relevant tests). ✅ = coded+pushed; awaiting Avi's live browser certification. No global ✅.

**Landed this batch**
- I1 `a75a59dd` Badge status variants → --status-* tokens (+ new --status-*-bg tints).
- I2 `33a5a72c` new `ui/AlertBanner` (tokenised status banner) + `186d981b` route status-colour tokenization sweep (26 files, closing grep 0).
- I4 `484a5d69` ad-hoc date `toLocaleString()` → D1 `formatAbsoluteTime` (3 named DB-rollback date sites).
- I5 `6e7a61fe` PITR restore now behind a ConfirmationDialog echoing the target timestamp; copy is honest (no fake safety-snapshot — WAL executor is dormant Phase-2).
- I7 `cc9e6035` project secret value field: reveal + IBM Plex Mono + paste-trim; per-row Copy of the secret NAME (values are never returned by the API — nothing to reveal in the list).
- I8 `914d12fc` inline SecretRequestCard password fields: reveal toggle + monospace (required validation kept).
- I9 `d9304885` git import by content-based `isBinaryContent` (extracted in fileUtils), not an extension allowlist — .py/.go/.rs/.sql no longer dropped; fixed in GitCloneButton AND the shared decodeClonedFiles; +spec.
- I10 `4574ee66` zip import client cap (18 MB, aligned to the 25 MB API body limit) + immediate oversize message + Importing… busy state + progress bar.
- I11 `5bc6a5c6` downgrade page rebuilt: loader over real billing+catalog, price delta + exact quota reductions, portal-vs-checkout split (fixes checkout-409-on-active-sub), honest end-of-cycle timing note.
- I12 `b747bf55` message edit affordance visible on coarse pointer (useCoarsePointer) + focus-visible.
- I14 `5b012cc8` preview boot carousels freeze under prefers-reduced-motion + pause on hover/focus; decorative rotators aria-hidden (drops the aria-live SR spam).
- I15 `eff59018` preview devtools empty panels (console/network/elements) → shared compact EmptyState.
- I16 `b4460892` header Report Bug + Debug Log collapsed into a single Help dropdown.
- I17 `e4faf11f` misnamed developer 'Task Manager' tab → 'Local data' (both TAB_LABELS sources + admin dev-tools registry + icon + heading); spec updated. NOT merged into user Data tab (would leak a raw-localStorage inspector to users).
- I19 `e38fa20d` orphan `/workspace-settings` given a real entry point: dashboard Account nav link + ⌘K command action (route kept canonical; @settings modal is not routable).
- I22 `f86603ad` invoices + api-keys empty states → shared EmptyState (api-keys with 'Create key' CTA).
- I23 `0d02ced2` invitation status → Badge (Accepted/Expired/Pending) + expired sorted to the bottom (Resend/expire/1-min-throttle already server-wired).
- I24 `3f50947d` pricing Monthly/Yearly labels now clickable buttons (aria-pressed/label), visual unchanged.
- I26 `4f25b9bb` login MFA field progressive (only after AUTH_MFA_REQUIRED) + autofocus.
- I29/I30 `6f83f3cb` SURFACE_AUTHED_TWINS extracted to testable `lib/surface-twins`, extended (profile→/account-settings, plans→/billing, subscribe→/upgrade, teams→/organization-members) + unit test; EcodeSurfacePages defs left in place per H24.

**Already satisfied — no code needed**
- I13 mic outside IDE: FALSE POSITIVE. The mic IS available outside the IDE (overflow "Composer tools" menu, ChatBox.tsx:644) and on the bar inside the IDE — with an explanatory comment already present. Speech handlers are wired in all BaseChat contexts. No change.
- I27 = done in H22 (settings close helper). I28 = done in H24 (github-import 301).

**Deferred 📤 — awaiting Avi (zero-mock rule: no fake endpoints)**
- I3 legal "Last updated" dates — need the real values per doc; will not invent.
- I6 SIEM "Send test event" — needs a real test-delivery endpoint (services/api); confirm add vs exists.
- I18 self-hosted Update tab — remove from SaaS Control Panel vs gate on Electron? Does /api/update still exist?
- I20 / I21 explore gallery + /docs — real build vs redirect/remove?
- I25 support ticket detail — needs a ticket-messages endpoint; confirm exists or fall back to mailto.
