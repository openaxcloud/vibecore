# Couverture des routes publiques — 26 octobre 2026

Base `1714415cb`. Inventaire du code et rapprochement de preuves historiques locales ; aucune nouvelle recette navigateur ni certification globale. Les routes de ressources, alias, layouts et404 sont distinguées des pages.

**118 modules de routes dans ce périmètre ; 13 avec preuves locales limitées, 105 non exercés ; aucune route validée en production.** Les 58 définitions de surfaces dynamiques sont un inventaire complémentaire, pas autant de pages fonctionnelles supplémentaires.

## Matrice par module

| Route | Type | État | Preuves | Source |
| --- | --- | --- | --- | --- |
| `/` | marketing_public | Local limité | public7799, public7899, public8299, zoom7799, zoom7899, contrast8999 | [_index.tsx](../../../app/routes/_index.tsx) |
| `/*` | not_found | Non exercé | — | [$.tsx](../../../app/routes/$.tsx) |
| `/:slug` | marketing_public | Non exercé | — | [$slug.tsx](../../../app/routes/$slug.tsx) |
| `/about` | marketing_public | Non exercé | — | [about.tsx](../../../app/routes/about.tsx) |
| `/acceptable-use` | legal_policy | Non exercé | — | [acceptable-use.tsx](../../../app/routes/acceptable-use.tsx) |
| `/accessibility` | legal_policy | Non exercé | — | [accessibility.tsx](../../../app/routes/accessibility.tsx) |
| `/account-inactivity` | legal_policy | Non exercé | — | [account-inactivity.tsx](../../../app/routes/account-inactivity.tsx) |
| `/advanced/:section` | marketing_public | Non exercé | — | [advanced.$section.tsx](../../../app/routes/advanced.$section.tsx) |
| `/ai` | marketing_public | Non exercé | — | [ai.tsx](../../../app/routes/ai.tsx) |
| `/ai-agent` | marketing_public | Local limité | major9999, agent10099, agentdemo10099 | [ai-agent.tsx](../../../app/routes/ai-agent.tsx) |
| `/ai-agent/studio` | compatibility_redirect | Non exercé | — | [ai-agent.studio.tsx](../../../app/routes/ai-agent.studio.tsx) |
| `/ai-docs` | marketing_public | Non exercé | — | [ai-docs.tsx](../../../app/routes/ai-docs.tsx) |
| `/ai-documentation` | marketing_public | Non exercé | — | [ai-documentation.tsx](../../../app/routes/ai-documentation.tsx) |
| `/auth/oauth/:provider` | authentication_action_or_redirect | Non exercé | — | [auth.oauth.$provider.tsx](../../../app/routes/auth.oauth.$provider.tsx) |
| `/auth/oauth/:provider/callback` | authentication_action_or_redirect | Non exercé | — | [auth.oauth.$provider.callback.tsx](../../../app/routes/auth.oauth.$provider.callback.tsx) |
| `/blog` | marketing_public | Non exercé | — | [blog.tsx](../../../app/routes/blog.tsx) |
| `/blog/:slug` | marketing_public | Non exercé | — | [blog.$slug.tsx](../../../app/routes/blog.$slug.tsx) |
| `/bounties` | marketing_public | Non exercé | — | [bounties.tsx](../../../app/routes/bounties.tsx) |
| `/careers` | marketing_public | Non exercé | — | [careers.tsx](../../../app/routes/careers.tsx) |
| `/case-studies` | marketing_public | Non exercé | — | [case-studies.tsx](../../../app/routes/case-studies.tsx) |
| `/changelog` | marketing_public | Non exercé | — | [changelog.tsx](../../../app/routes/changelog.tsx) |
| `/changelog.xml` | public_resource | Non exercé | — | [changelog[.]xml.tsx](../../../app/routes/changelog[.]xml.tsx) |
| `/collaboration` | marketing_public | Non exercé | — | [collaboration.tsx](../../../app/routes/collaboration.tsx) |
| `/commercial-agreement` | legal_policy | Non exercé | — | [commercial-agreement.tsx](../../../app/routes/commercial-agreement.tsx) |
| `/community` | marketing_public | Non exercé | — | [community.tsx](../../../app/routes/community.tsx) |
| `/community/post/:id` | marketing_public | Non exercé | — | [community.post.$id.tsx](../../../app/routes/community.post.$id.tsx) |
| `/compare` | marketing_public | Non exercé | — | [compare._index.tsx](../../../app/routes/compare._index.tsx) |
| `/compare/:slug` | marketing_public | Non exercé | — | [compare.$slug.tsx](../../../app/routes/compare.$slug.tsx) |
| `/contact` | marketing_public | Local limité | contact8999 | [contact.tsx](../../../app/routes/contact.tsx) |
| `/contact-sales` | marketing_public | Local limité | contact8999 | [contact-sales.tsx](../../../app/routes/contact-sales.tsx) |
| `/customers` | marketing_public | Non exercé | — | [customers.tsx](../../../app/routes/customers.tsx) |
| `/data-deletion` | legal_policy | Non exercé | — | [data-deletion.tsx](../../../app/routes/data-deletion.tsx) |
| `/deleting-your-data` | legal_policy | Non exercé | — | [deleting-your-data.tsx](../../../app/routes/deleting-your-data.tsx) |
| `/demo` | marketing_public | Non exercé | — | [demo.tsx](../../../app/routes/demo.tsx) |
| `/deployments` | marketing_public | Non exercé | — | [deployments.tsx](../../../app/routes/deployments.tsx) |
| `/desktop` | marketing_public | Non exercé | — | [desktop.tsx](../../../app/routes/desktop.tsx) |
| `/docs` | marketing_public | Non exercé | — | [docs.tsx](../../../app/routes/docs.tsx) |
| `/dpa` | legal_policy | Non exercé | — | [dpa.tsx](../../../app/routes/dpa.tsx) |
| `/editor/:id` | compatibility_redirect | Non exercé | — | [editor.$id.tsx](../../../app/routes/editor.$id.tsx) |
| `/editor/new` | compatibility_redirect | Non exercé | — | [editor.new.tsx](../../../app/routes/editor.new.tsx) |
| `/enforcement` | legal_policy | Non exercé | — | [enforcement.tsx](../../../app/routes/enforcement.tsx) |
| `/enterprise` | marketing_public | Local limité | major9999 | [enterprise.tsx](../../../app/routes/enterprise.tsx) |
| `/explore` | marketing_public | Non exercé | — | [explore.tsx](../../../app/routes/explore.tsx) |
| `/features` | marketing_public | Local limité | marketing9599, features9799 | [features.tsx](../../../app/routes/features.tsx) |
| `/forgot-password` | authentication | Non exercé | — | [forgot-password.tsx](../../../app/routes/forgot-password.tsx) |
| `/forum` | marketing_public | Non exercé | — | [forum.tsx](../../../app/routes/forum.tsx) |
| `/gallery` | marketing_public | Non exercé | — | [gallery._index.tsx](../../../app/routes/gallery._index.tsx) |
| `/gallery/:slug` | marketing_public | Non exercé | — | [gallery.$slug.tsx](../../../app/routes/gallery.$slug.tsx) |
| `/health` | public_resource | Non exercé | — | [health.ts](../../../app/routes/health.ts) |
| `/help` | marketing_public | Non exercé | — | [help.tsx](../../../app/routes/help.tsx) |
| `/help-center` | marketing_public | Non exercé | — | [help-center.tsx](../../../app/routes/help-center.tsx) |
| `/ide/:id` | marketing_public | Non exercé | — | [ide.$id.tsx](../../../app/routes/ide.$id.tsx) |
| `/ide/new` | marketing_public | Non exercé | — | [ide.new.tsx](../../../app/routes/ide.new.tsx) |
| `/languages` | marketing_public | Non exercé | — | [languages.tsx](../../../app/routes/languages.tsx) |
| `/legal` | legal_policy | Local limité | marketing9599 | [legal.tsx](../../../app/routes/legal.tsx) |
| `/licensing` | legal_policy | Non exercé | — | [licensing.tsx](../../../app/routes/licensing.tsx) |
| `/login` | authentication | Local limité | public7799, zoom7799, contrast8999 | [login.tsx](../../../app/routes/login.tsx) |
| `/logout` | authentication_action_or_redirect | Non exercé | — | [logout.tsx](../../../app/routes/logout.tsx) |
| `/marketing/:slug` | not_found | Non exercé | — | [marketing.$slug.tsx](../../../app/routes/marketing.$slug.tsx) |
| `/marketing/bounties` | marketing_public | Non exercé | — | [marketing.bounties.tsx](../../../app/routes/marketing.bounties.tsx) |
| `/marketing/deployments` | marketing_public | Non exercé | — | [marketing.deployments.tsx](../../../app/routes/marketing.deployments.tsx) |
| `/marketing/teams` | marketing_public | Non exercé | — | [marketing.teams.tsx](../../../app/routes/marketing.teams.tsx) |
| `/marketplace` | layout | Non exercé | — | [marketplace.tsx](../../../app/routes/marketplace.tsx) |
| `/marketplace/` | marketing_public | Non exercé | — | [marketplace._index.tsx](../../../app/routes/marketplace._index.tsx) |
| `/marketplace/templates` | marketing_public | Non exercé | — | [marketplace.templates.tsx](../../../app/routes/marketplace.templates.tsx) |
| `/mcp` | marketing_public | Non exercé | — | [mcp.tsx](../../../app/routes/mcp.tsx) |
| `/mobile` | marketing_public | Non exercé | — | [mobile.tsx](../../../app/routes/mobile.tsx) |
| `/mobile-workspace/:projectId` | marketing_public | Non exercé | — | [mobile-workspace.$projectId.tsx](../../../app/routes/mobile-workspace.$projectId.tsx) |
| `/newsletter` | marketing_public | Non exercé | — | [newsletter.tsx](../../../app/routes/newsletter.tsx) |
| `/newsletter-confirmed` | marketing_public | Non exercé | — | [newsletter-confirmed.tsx](../../../app/routes/newsletter-confirmed.tsx) |
| `/newsletter/confirm` | marketing_public | Non exercé | — | [newsletter_.confirm.tsx](../../../app/routes/newsletter_.confirm.tsx) |
| `/newsletter/unsubscribe` | marketing_public | Non exercé | — | [newsletter_.unsubscribe.tsx](../../../app/routes/newsletter_.unsubscribe.tsx) |
| `/partners` | marketing_public | Non exercé | — | [partners.tsx](../../../app/routes/partners.tsx) |
| `/polyglot` | marketing_public | Non exercé | — | [polyglot.tsx](../../../app/routes/polyglot.tsx) |
| `/press` | marketing_public | Non exercé | — | [press.tsx](../../../app/routes/press.tsx) |
| `/pricing` | marketing_public | Local limité | public7799, public7899, public8299, zoom7799, zoom7899, contrast8999 | [pricing.tsx](../../../app/routes/pricing.tsx) |
| `/privacy` | legal_policy | Local limité | legal8999, legal9599, legalzoom9599 | [privacy.tsx](../../../app/routes/privacy.tsx) |
| `/product` | marketing_public | Non exercé | — | [product.tsx](../../../app/routes/product.tsx) |
| `/profile/:username` | compatibility_404 | Non exercé | — | [profile.$username.tsx](../../../app/routes/profile.$username.tsx) |
| `/projects/share/:token` | public_share_token | Non exercé | — | [projects.share.$token.tsx](../../../app/routes/projects.share.$token.tsx) |
| `/register` | authentication | Non exercé | — | [register.tsx](../../../app/routes/register.tsx) |
| `/report-abuse` | legal_policy | Non exercé | — | [report-abuse.tsx](../../../app/routes/report-abuse.tsx) |
| `/reset-password` | authentication | Non exercé | — | [reset-password.tsx](../../../app/routes/reset-password.tsx) |
| `/runtime-test` | public_diagnostic | Non exercé | — | [runtime-test.tsx](../../../app/routes/runtime-test.tsx) |
| `/search` | marketing_public | Non exercé | — | [search.tsx](../../../app/routes/search.tsx) |
| `/security` | legal_policy | Non exercé | — | [security.tsx](../../../app/routes/security.tsx) |
| `/share/:token` | public_share_token | Non exercé | — | [share.$token.tsx](../../../app/routes/share.$token.tsx) |
| `/signup` | authentication | Local limité | public7799, zoom7799, contrast8999 | [signup.tsx](../../../app/routes/signup.tsx) |
| `/sitemap.xml` | public_resource | Non exercé | — | [sitemap[.]xml.tsx](../../../app/routes/sitemap[.]xml.tsx) |
| `/solutions` | marketing_public | Non exercé | — | [solutions._index.tsx](../../../app/routes/solutions._index.tsx) |
| `/solutions/:slug` | marketing_public | Non exercé | — | [solutions.$slug.tsx](../../../app/routes/solutions.$slug.tsx) |
| `/solutions/app-builder` | marketing_public | Non exercé | — | [solutions.app-builder.tsx](../../../app/routes/solutions.app-builder.tsx) |
| `/solutions/chatbot-builder` | marketing_public | Non exercé | — | [solutions.chatbot-builder.tsx](../../../app/routes/solutions.chatbot-builder.tsx) |
| `/solutions/dashboard-builder` | marketing_public | Non exercé | — | [solutions.dashboard-builder.tsx](../../../app/routes/solutions.dashboard-builder.tsx) |
| `/solutions/enterprise` | marketing_public | Non exercé | — | [solutions.enterprise.tsx](../../../app/routes/solutions.enterprise.tsx) |
| `/solutions/freelancers` | marketing_public | Non exercé | — | [solutions.freelancers.tsx](../../../app/routes/solutions.freelancers.tsx) |
| `/solutions/game-builder` | marketing_public | Non exercé | — | [solutions.game-builder.tsx](../../../app/routes/solutions.game-builder.tsx) |
| `/solutions/internal-ai-builder` | marketing_public | Non exercé | — | [solutions.internal-ai-builder.tsx](../../../app/routes/solutions.internal-ai-builder.tsx) |
| `/solutions/startups` | marketing_public | Non exercé | — | [solutions.startups.tsx](../../../app/routes/solutions.startups.tsx) |
| `/solutions/website-builder` | marketing_public | Non exercé | — | [solutions.website-builder.tsx](../../../app/routes/solutions.website-builder.tsx) |
| `/status` | marketing_public | Non exercé | — | [status.tsx](../../../app/routes/status.tsx) |
| `/strike-system` | legal_policy | Non exercé | — | [strike-system.tsx](../../../app/routes/strike-system.tsx) |
| `/student-dpa` | legal_policy | Non exercé | — | [student-dpa.tsx](../../../app/routes/student-dpa.tsx) |
| `/subprocessors` | legal_policy | Non exercé | — | [subprocessors.tsx](../../../app/routes/subprocessors.tsx) |
| `/support-policy` | legal_policy | Local limité | legal8999, support9799 | [support-policy.tsx](../../../app/routes/support-policy.tsx) |
| `/sw.js` | public_resource | Non exercé | — | [sw[.]js.ts](../../../app/routes/sw[.]js.ts) |
| `/team` | marketing_public | Non exercé | — | [team.tsx](../../../app/routes/team.tsx) |
| `/templates` | marketing_public | Non exercé | — | [templates.tsx](../../../app/routes/templates.tsx) |
| `/templates/languages` | marketing_public | Non exercé | — | [templates_.languages.tsx](../../../app/routes/templates_.languages.tsx) |
| `/terms` | legal_policy | Local limité | legal8999, legal9599, legalzoom9599 | [terms.tsx](../../../app/routes/terms.tsx) |
| `/theme-validation` | public_diagnostic | Non exercé | — | [theme-validation.tsx](../../../app/routes/theme-validation.tsx) |
| `/trust-and-safety` | legal_policy | Non exercé | — | [trust-and-safety.tsx](../../../app/routes/trust-and-safety.tsx) |
| `/tutorials` | marketing_public | Non exercé | — | [tutorials.tsx](../../../app/routes/tutorials.tsx) |
| `/u/:username` | compatibility_404 | Non exercé | — | [u.$username.tsx](../../../app/routes/u.$username.tsx) |
| `/u/:username/:projectname` | compatibility_404 | Non exercé | — | [u.$username.$projectname.tsx](../../../app/routes/u.$username.$projectname.tsx) |
| `/usage-limits` | legal_policy | Non exercé | — | [usage-limits.tsx](../../../app/routes/usage-limits.tsx) |
| `/user/:username` | compatibility_404 | Non exercé | — | [user.$username.tsx](../../../app/routes/user.$username.tsx) |
| `/verify-email` | authentication | Non exercé | — | [verify-email.tsx](../../../app/routes/verify-email.tsx) |

## Preuves et formats exacts

### public7799

[matrix.json](../../../docs/bugs/user-area-secondary-2026-10-25/public/after7799/matrix.json) — Header/mobile-menu corrections; auth form layout. Before final footer/logical-margin adjustments.

- `/` : 44 observations ; formats [(1024, 900), (1280, 900), (1440, 900), (1920, 900), (2560, 900), (320, 900), (360, 900), (390, 900), (768, 900), (820, 900), (844, 390)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/pricing` : 44 observations ; formats [(1024, 900), (1280, 900), (1440, 900), (1920, 900), (2560, 900), (320, 900), (360, 900), (390, 900), (768, 900), (820, 900), (844, 390)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/login` : 44 observations ; formats [(1024, 900), (1280, 900), (1440, 900), (1920, 900), (2560, 900), (320, 900), (360, 900), (390, 900), (768, 900), (820, 900), (844, 390)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/signup` : 44 observations ; formats [(1024, 900), (1280, 900), (1440, 900), (1920, 900), (2560, 900), (320, 900), (360, 900), (390, 900), (768, 900), (820, 900), (844, 390)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### public7899

[matrix.json](../../../docs/bugs/user-area-secondary-2026-10-25/public/after7899/matrix.json) — Home/Pricing footer full-width comparison card; 46 links preserved. Excludes lazy sections not mounted by this initial geometry pass.

- `/` : 44 observations ; formats [(1024, 900), (1280, 900), (1440, 900), (1920, 900), (2560, 900), (320, 900), (360, 900), (390, 900), (768, 900), (820, 900), (844, 390)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/pricing` : 44 observations ; formats [(1024, 900), (1280, 900), (1440, 900), (1920, 900), (2560, 900), (320, 900), (360, 900), (390, 900), (768, 900), (820, 900), (844, 390)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### public8299

[receipt.json](../../../docs/bugs/user-area-secondary-2026-10-25/public/after8299-logical/receipt.json) — Targeted header logical margin, FR/EN/AR320/1440; not full Arabic product validation.

- `/` : 12 observations ; formats [(1440, 900), (320, 900)] ; langues ['ar', 'en', 'fr'] ; thèmes ['dark', 'light'].
- `/pricing` : 12 observations ; formats [(1440, 900), (320, 900)] ; langues ['ar', 'en', 'fr'] ; thèmes ['dark', 'light'].
### zoom7799

[zoom.json](../../../docs/bugs/user-area-secondary-2026-10-25/public/after7799/zoom.json) — Home/Pricing/Login/Signup; Chromium native200%, physical1280 to CSS640, not pinch.

- `/` : 4 observations ; formats [(640, None)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/pricing` : 4 observations ; formats [(640, None)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/login` : 4 observations ; formats [(640, None)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/signup` : 4 observations ; formats [(640, None)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### zoom7899

[zoom.json](../../../docs/bugs/user-area-secondary-2026-10-25/public/after7899/zoom.json) — Home/Pricing after footer change; repeats overlapping cases, not additive unique coverage.

- `/` : 4 observations ; formats [(640, None)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/pricing` : 4 observations ; formats [(640, None)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### contrast8999

[receipt.json](../../../docs/bugs/user-area-secondary-2026-10-25/public/contrast8999-body/receipt.json) — 16cases FR320/1440 light/dark; progressive scroll mounts9Home sections;1334samples measured/982excluded, min4.7975. Complex/translucent backgrounds excluded, not certification.

- `/` : 4 observations ; formats [(1440, 900), (320, 900)] ; langues ['fr'] ; thèmes ['dark', 'light'].
- `/pricing` : 4 observations ; formats [(1440, 900), (320, 900)] ; langues ['fr'] ; thèmes ['dark', 'light'].
- `/login` : 4 observations ; formats [(1440, 900), (320, 900)] ; langues ['fr'] ; thèmes ['dark', 'light'].
- `/signup` : 4 observations ; formats [(1440, 900), (320, 900)] ; langues ['fr'] ; thèmes ['dark', 'light'].
### contact8999

[receipt.json](../../../docs/bugs/user-area-tertiary-2026-10-25/contact/receipt.json) — Contact/Contact-sales; invalid/empty local form, draft resize, focus. Valid submission/backend not tested.

- `/contact` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/contact-sales` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### legal8999

[receipt.json](../../../docs/bugs/user-area-tertiary-2026-10-25/legal/receipt.json) — Privacy/Terms/Support-policy geometry, keyboard/resize/Back. Before deep-link fixes.

- `/privacy` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/terms` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/support-policy` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### legal9599

[acceptance-after-build.json](../../../docs/bugs/user-area-tertiary-2026-10-25/legal/after9599/acceptance-after-build.json) — Privacy/Terms contact-heading anchors, actual serverHTML, cold/hash/Back. Not all headings tested.

- `/privacy` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/terms` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### legalzoom9599

[zoom-after-build.json](../../../docs/bugs/user-area-tertiary-2026-10-25/legal/after9599/zoom-after-build.json) — Privacy/Terms FR/EN light only, physical1280×900 to CSS640×406; real header65px.

- `/privacy` : 2 observations ; formats [(640, 406)] ; langues ['en', 'fr'] ; thèmes ['light'].
- `/terms` : 2 observations ; formats [(640, 406)] ; langues ['en', 'fr'] ; thèmes ['light'].
### marketing9599

[receipt.json](../../../docs/bugs/user-area-tertiary-2026-10-25/marketing/receipt.json) — Legal/Features32geometry+8keyboard/resize/Back; Features code blocks intentionally horizontal scrollable.

- `/legal` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/features` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### support9799

[after-support.json](../../../docs/bugs/user-area-tertiary-2026-10-25/marketing/after9799/after-support.json) — Support-policy CTA only:16cold/hash/Back cases. Other anchors explicitly not corrected/validated.

- `/support-policy` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### features9799

[after-features.json](../../../docs/bugs/user-area-tertiary-2026-10-25/marketing/after9799/after-features.json) — 4FR/EN×themes groups at320,6filters viaSpace, exclusive aria-pressed,13/5/1/4/2/1cards,resize1440→320.

- `/features` : 4 observations ; formats [(320, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### major9999

[receipt.json](../../../docs/bugs/ai-agent-hero-2026-10-25/receipt.json) — Agent/Enterprise32geometry+8keyboard/resize/Back; Agent FR320 hero clipping found; Enterprise no content overflow detected.

- `/ai-agent` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
- `/enterprise` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### agent10099

[after-receipt.json](../../../docs/bugs/ai-agent-hero-2026-10-25/after10099/after-receipt.json) — Agent16geometry+4keyboard/resize/Back; FR320 CTA fixed x16→304. root16px/h14=56 observed; desktop wrapping74 preserves minimum.

- `/ai-agent` : 16 observations ; formats [(1440, 900), (320, 900), (390, 900), (768, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].
### agentdemo10099

[after-agent-demo.json](../../../docs/bugs/ai-agent-hero-2026-10-25/after10099/after-agent-demo.json) — 4FR/EN×themes screenshot-selector groups at320, Space/ARIA exclusive/selectedimage/resize1440. Not realAI/IDE execution.

- `/ai-agent` : 4 observations ; formats [(320, 900)] ; langues ['en', 'fr'] ; thèmes ['dark', 'light'].

## Dynamique, alias et non-pages

Le JSON détaille les58 définitions de surfaces, la priorité des routes statiques, re-exports et expressions de redirection. `/register` ne reçoit pas les tests de `/signup` par héritage. `/marketplace/templates` ne reçoit pas ceux de `/templates`. Les profils `/u/:username`, `/user/:username`, `/profile/:username` sont volontairement404. `/ai-agent/studio` redirige vers `/ai-agent`. Les valeurs de paramètres blog/compare/gallery/share ne sont pas validées par la présence du module. Les imports de marketing dans un enfant de `/projects` ne prouvent pas un accès anonyme : exclus de ce tableau et confiés à l’inventaire global.

## Limites et suites proposées

- Local historical build ports, not one comprehensive run on this base commit.
- No production recipe, real authentication, financial action, external message or backend validation.
- No coverage inherited by aliases, dynamic parameter values or sibling pages.
- Native zoom recorded only for named routes/groups; no physical virtual keyboard/safeareas, real screenreader, Safari/Firefox.
- Unit tests/static source checks are not browser evidence. Prior partial/failed harness receipts excluded from positive groups.
- Counts overlap between phases; do not add them as unique tested pages.

Priorités proposées, sans audit lancé : **`/templates` public anonyme** (catalogue, catégories, navigation, redirection connecté distincte) et **`/docs`** (navigation/aide, recherche éventuelle, contenu long).

## Interactions : portée précise

- **public7799** : FR/EN menus: Escape/Fermer focus,320→1440,1279→1280 releases lock; Pricing period toggle/Home/Back. Login/Signup invalid-email native validation and draft preserved during resize; no valid authentication.
- **public7899** : FR/EN menus: Escape/Fermer focus,320→1440,1279→1280 releases lock; Pricing period toggle/Home/Back. Landscape844×390 reaches last menu button after40Tabs in each language; Escape restores trigger.
- **public8299** : 6menu groups FR/EN/AR ×light/dark: Escape/Fermer,320→1440,1279→1280, bodylock release and visible login focus. Not every page inherits this shared-header test.
- **contact8999** : 8form groups FR/EN×themes: empty-submit focus name,3/4invalid fields, invalidemail, Tab message→submit with focus style,320→1440→390 draft preservation.4extra FR/EN×routes Back groups on default theme; no valid submission.
- **legal8999** : Per route FR/EN×light/dark: focus first main link,Tab/Shift+Tab,320→1440→390 retains focus,logo→Home→Back returns route/h1; target link not activated unless local Home navigation.
- **marketing9599** : Per route FR/EN×light/dark: focus first main link,Tab/Shift+Tab,320→1440→390 retains focus,logo→Home→Back returns route/h1; target link not activated unless local Home navigation.
- **major9999** : Per route FR/EN×light/dark: focus first main link,Tab/Shift+Tab,320→1440→390 retains focus,logo→Home→Back returns route/h1; target link not activated unless local Home navigation.
- **agent10099** : Per route FR/EN×light/dark: focus first main link,Tab/Shift+Tab,320→1440→390 retains focus,logo→Home→Back returns route/h1; target link not activated unless local Home navigation.

Le diagnostic de sélecteur Tarifs a tenté un PATCH bloqué avant tout backend ; son ancien verdict est retiré. Les reçus partiels et la première mesure de contraste limitée ne sont pas additionnés aux résultats finaux. Les composants communs testés sur une route ne valident pas toutes les routes qui les importent. Les ressources santé/sitemap/serviceworker et les redirections ne comptent pas comme pages UI pleinement testées.
