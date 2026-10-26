# Inventaire global des routes et couverture UI

**Base inventoriée : `1714415cb`. Aucun nouveau parcours navigateur dans cet inventaire.** Les recettes historiques restent partielles, synthétiques et associées à leur build. Aucune validation UI production présumée.

Le routeur découvre **357 modules**, après exclusion des216 specs. Répartition : 173 ui_page, 22 redirect_alias, 4 ui_layout, 138 api_resource, 11 non_ui_helper_discovered, 6 resource_endpoint, 3 redirect_with_legacy_resource. Les layouts, alias et ressources ne sont pas additionnés comme pages. `app/root.tsx` est le layout global hors compteur.

Le JSON contient les357 entrées, leurs parents/enfants, la classification, les références de preuves, la navigation et les limites. [Marketing et valeurs dynamiques](public-routes.md), [panneaux IDE/admin](panels.md) sont des inventaires complémentaires, pas des résultats supplémentaires à additionner.

## Preuves utilisateur effectivement rattachées

| Groupe | Routes | Formats prouvés | Périmètre / limite |
| --- | --- | --- | --- |
| account-navigation | `/account-settings` | 320×740, 360×800, 390×844, 640×400, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | Native links, aria-current, wrapping, keyboard; navigation component only ; Does not prove profile save or every tab form. |
| account-dialog-connected | `/account-settings/data`, `/account-settings/connected` | 320×740, 360×800, 390×844, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 88 observations +8 interaction groups: Tab containment, Escape/Cancel restore focus, resize draft, Back ; No deletion or connection; local7099 integration, not current deployment. |
| profile | `/account-settings` | 320 (hauteur non enregistrée), 390 (hauteur non enregistrée), 820 (hauteur non enregistrée), 1440 (hauteur non enregistrée) | FR/EN light: long name/timezone, validation, rejected503, resizing ; Light only; focusBODY observed, lost navigation not established; no successful real save. |
| dashboard-projects | `/dashboard`, `/projects` | 320×740, 360×800, 390×844, 640×400, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 96 geometry observations; delayed350ms search/history/typing;16 menus320/390/820/1440 ; No project creation/deletion; menu confirmations cancelled; no IDE opened. |
| billing | `/billing` | 320×740, 360×800, 390×844, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 48 observations incl4 interaction groups; repeated503, draft and alert focus ; Synthetic financial API; no real success, subscription or portal. |
| native-zoom | `/dashboard`, `/projects`, `/billing`, `/account-settings`, `/account-settings/data` | 640×356 | 20 native200% cases,12 interaction groups; physical1280→1600→1280 and draft retention ; DPR2/visualViewport.scale1; zoom at launch not changed while typing; connected excluded. |
| palette | `/dashboard`, `/command-palette` | 320 (hauteur non enregistrée), 360 (hauteur non enregistrée), 390 (hauteur non enregistrée), 768 (hauteur non enregistrée), 820 (hauteur non enregistrée), 844 (hauteur non enregistrée), 1024 (hauteur non enregistrée), 1280 (hauteur non enregistrée), 1440 (hauteur non enregistrée), 1920 (hauteur non enregistrée), 2560 (hauteur non enregistrée) | 88 observations :44 par route,8 groupes clavier par phase, répétés dans extension; long names, resize, Back, ArrowDown/Enter ; Inline Escape keeps palette/search; no real IDE opened. |
| notifications-usage | `/notifications`, `/usage` | 320 (hauteur non enregistrée), 360 (hauteur non enregistrée), 390 (hauteur non enregistrée), 768 (hauteur non enregistrée), 820 (hauteur non enregistrée), 844 (hauteur non enregistrée), 1024 (hauteur non enregistrée), 1280 (hauteur non enregistrée), 1440 (hauteur non enregistrée), 1920 (hauteur non enregistrée), 2560 (hauteur non enregistrée) | 88 observations; errors/rollback/Back/resize ; Synthetic backend; not actual notification delivery. |
| payment-upgrade | `/payment-method`, `/upgrade` | 320 (hauteur non enregistrée), 360×800, 390 (hauteur non enregistrée), 640 (hauteur non enregistrée), 768×1024, 820 (hauteur non enregistrée), 844×390, 1024×768, 1280×800, 1440 (hauteur non enregistrée), 1920×1080, 2560×1440 | 88 geometry +8 nativezoom; four503 saves, same draft and focus after repeat failure ; Successful save unit only; no purchase/portal; lowercase active fixture does not cover production ACTIVE branch. |
| invoices-plans | `/invoices`, `/plan-comparison` | 320×740, 360×800, 390×844, 640 (hauteur non enregistrée), 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 88 geometry +8 nativezoom;2 GET503 keyboard Retry ; No invoice download, purchase or checkout. |
| security | `/session-security`, `/security-settings` | 320×740, 360×800, 390×844, 640 (hauteur non enregistrée), 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 88 geometry +8 nativezoom;4 dialog/resize groups,4GET retry,2Back ; No session revocation, MFA setup or policy mutation. |
| templates-recent | `/dashboard/templates`, `/recent-projects` | 320×800, 360×800, 390×844, 640 (hauteur non enregistrée), 768×1024, 820×1000, 844×390, 1024×768, 1280×900, 1440×900, 1920×1080, 2560×1440 | 88 geometry +8 nativezoom;6 interaction groups;24 deployment-counter variants separately documented ; No creation/import; some count labels intentionally ellipsed, accessible label retained. |
| workspace-support-desktop | `/workspace-settings`, `/support`, `/desktop-settings` | 320×800, 360×800, 390×844, 640 (hauteur non enregistrée), 768×1024, 820×1000, 844×390, 1024×768, 1280×900, 1440×900, 1920×1080, 2560×1440 | 176 geometry across4 modes,8 interaction groups,16 nativezoom; desktop with/without synthetic bridge ; Not Electron; no ticket submitted; contrast replay8899 is separate from geometry7699. |
| members | `/organization-members` | 320×740, 360×800, 390×844, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 44 member geometry successes at8399 only ; Same receipt includes12 failing API-key cases, NOT member failures. No invitation/role change. |
| keys | `/api-keys` | 320×740, 360×800, 390×844, 768×1024, 820×1180, 844×390, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440 | 44 key geometry at8599; six columns preserved, sr-only header contained, scroller keyboard focus/ArrowRight;2 GETretry ; No creation/revocation/clipboard; members44 not replayed here. |
| members-keys-zoom | `/organization-members`, `/api-keys` | 640 (hauteur non enregistrée) | 8 native200% cases8599 ; No separate pageerror collection in zoom harness; no key lifecycle. |
| organization | `/organization-roles`, `/roles-and-permissions`, `/invitations`, `/organization-invitations`, `/audit-logs` | 320 (hauteur non enregistrée), 390 (hauteur non enregistrée), 768 (hauteur non enregistrée), 1440 (hauteur non enregistrée) | 80 geometry +7 interaction groups; long identities, keyboard/GET error recovery ; No role creation/invitation/policy mutation; no nativezoom or full11format matrix. |
| role-targets | `/organization-roles`, `/roles-and-permissions` | 320 (hauteur non enregistrée), 768 (hauteur non enregistrée), 1440 (hauteur non enregistrée) | 12 FR/EN light cases;19labels each =228 label/Space activations, restored values ; Light only; no form submission or permission change persisted. |

Les groupes utilisent Chromium local, FR/EN clair/sombre sauf profil et cibles rôles (clair uniquement). Les reçus exacts et READMEs sont référencés dans routes.json. Les phases ne s’additionnent pas en pages uniques. Membres44 à8399 reste distinct de Clés44 à8599 ; le reçu initial contient12 échecs Clés, conservés puis corrigés.

## Toutes les routes enregistrées

| Route / index | Fichier | Type | Catégorie | Couverture | Preuves |
| --- | --- | --- | --- | --- | --- |
| `/` index | `app/routes/_index.tsx` | ui_page | marketing_public | teste_local_partiel | public7799, public7899, public8299, zoom7799, zoom7899, contrast8999 |
| `/*` | `app/routes/$.tsx` | ui_page | not_found | non_exerce |  |
| `/:accountSlug/:projectSlug` | `app/routes/$accountSlug.$projectSlug.tsx` | ui_page | ide | non_exerce |  |
| `/:accountSlug/:projectSlug/ide` | `app/routes/$accountSlug.$projectSlug.ide.tsx` | redirect_alias | ide | non_exerce |  |
| `/:slug` | `app/routes/$slug.tsx` | ui_page | marketing_public | non_exerce |  |
| `/about` | `app/routes/about.tsx` | ui_page | marketing_public | non_exerce |  |
| `/acceptable-use` | `app/routes/acceptable-use.tsx` | ui_page | legal_policy | non_exerce |  |
| `/accessibility` | `app/routes/accessibility.tsx` | ui_page | legal_policy | non_exerce |  |
| `/account-data` | `app/routes/account-data.tsx` | redirect_alias | other | non_exerce |  |
| `/account-inactivity` | `app/routes/account-inactivity.tsx` | ui_page | legal_policy | non_exerce |  |
| `/account-settings` index | `app/routes/account-settings._index.tsx` | ui_page | userarea | teste_local_partiel | account-navigation, profile, native-zoom |
| `/account-settings` | `app/routes/account-settings.tsx` | ui_layout | userarea | teste_local_partiel | account-navigation, profile, native-zoom |
| `/account-settings/connected` | `app/routes/account-settings.connected.tsx` | ui_page | userarea | teste_local_partiel | account-dialog-connected |
| `/account-settings/data` | `app/routes/account-settings.data.tsx` | ui_page | userarea | teste_local_partiel | account-dialog-connected, native-zoom |
| `/admin` index | `app/routes/admin._index.tsx` | redirect_alias | admin | non_exerce |  |
| `/admin/:section` | `app/routes/admin.$section.tsx` | ui_page | admin | non_exerce |  |
| `/admin/billing` | `app/routes/admin.billing.tsx` | ui_page | admin | non_exerce |  |
| `/admin/oauth-providers` | `app/routes/admin.oauth-providers.tsx` | ui_page | admin | non_exerce |  |
| `/admin/stripe` | `app/routes/admin.stripe.tsx` | ui_page | admin | non_exerce |  |
| `/admin/wallets` | `app/routes/admin.wallets.tsx` | ui_page | admin | non_exerce |  |
| `/advanced/:section` | `app/routes/advanced.$section.tsx` | ui_page | marketing_public | non_exerce |  |
| `/ai` | `app/routes/ai.tsx` | ui_page | marketing_public | non_exerce |  |
| `/ai-agent` | `app/routes/ai-agent.tsx` | ui_page | marketing_public | teste_local_partiel | major9999, agent10099, agentdemo10099 |
| `/ai-agent/studio` | `app/routes/ai-agent.studio.tsx` | redirect_alias | compatibility_redirect | non_exerce |  |
| `/ai-docs` | `app/routes/ai-docs.tsx` | ui_page | marketing_public | non_exerce |  |
| `/ai-documentation` | `app/routes/ai-documentation.tsx` | ui_page | marketing_public | non_exerce |  |
| `/api-keys` | `app/routes/api-keys.tsx` | ui_page | userarea | teste_local_partiel | keys, members-keys-zoom |
| `/api/about` | `app/routes/api.about.ts` | api_resource | api | hors_ui |  |
| `/api/account/connections/:id/revoke` | `app/routes/api.account.connections.$id.revoke.ts` | api_resource | api | hors_ui |  |
| `/api/agent-memory` | `app/routes/api.agent-memory.ts` | api_resource | api | hors_ui |  |
| `/api/agent-memory/:memoryId` | `app/routes/api.agent-memory.$memoryId.ts` | api_resource | api | hors_ui |  |
| `/api/agent-memory/context` | `app/routes/api.agent-memory.context.ts` | api_resource | api | hors_ui |  |
| `/api/agent-memory/export` | `app/routes/api.agent-memory.export.ts` | api_resource | api | hors_ui |  |
| `/api/agent-memory/preferences` | `app/routes/api.agent-memory.preferences.ts` | api_resource | api | hors_ui |  |
| `/api/agent-memory/search` | `app/routes/api.agent-memory.search.ts` | api_resource | api | hors_ui |  |
| `/api/agent-routing` | `app/routes/api.agent-routing.ts` | api_resource | api | hors_ui |  |
| `/api/agent/self-repair` | `app/routes/api.agent.self-repair.ts` | api_resource | api | hors_ui |  |
| `/api/agent/self-repair/message` | `app/routes/api.agent.self-repair.message.ts` | non_ui_helper_discovered | api | hors_ui |  |
| `/api/ai/features` | `app/routes/api.ai.features.ts` | api_resource | api | hors_ui |  |
| `/api/ai/message-feedback` | `app/routes/api.ai.message-feedback.ts` | api_resource | api | hors_ui |  |
| `/api/auth/export` | `app/routes/api.auth.export.ts` | api_resource | api | hors_ui |  |
| `/api/auth/user` | `app/routes/api.auth.user.ts` | api_resource | api | hors_ui |  |
| `/api/blog/categories/:category` | `app/routes/api.blog.categories.$category.ts` | api_resource | api | hors_ui |  |
| `/api/blog/featured` | `app/routes/api.blog.featured.ts` | api_resource | api | hors_ui |  |
| `/api/blog/posts` | `app/routes/api.blog.posts.ts` | api_resource | api | hors_ui |  |
| `/api/blog/posts/:slug` | `app/routes/api.blog.posts.$slug.ts` | api_resource | api | hors_ui |  |
| `/api/bug-report` | `app/routes/api.bug-report.ts` | api_resource | api | hors_ui |  |
| `/api/chat` | `app/routes/api.chat.ts` | api_resource | api | hors_ui |  |
| `/api/chat-share` | `app/routes/api.chat-share.ts` | api_resource | api | hors_ui |  |
| `/api/chat/quota-error` | `app/routes/api.chat.quota-error.ts` | non_ui_helper_discovered | api | hors_ui |  |
| `/api/check-env-key` | `app/routes/api.check-env-key.ts` | api_resource | api | hors_ui |  |
| `/api/community/categories` | `app/routes/api.community.categories.ts` | api_resource | api | hors_ui |  |
| `/api/community/challenges` | `app/routes/api.community.challenges.ts` | api_resource | api | hors_ui |  |
| `/api/community/leaderboard` | `app/routes/api.community.leaderboard.ts` | api_resource | api | hors_ui |  |
| `/api/community/posts` | `app/routes/api.community.posts.ts` | api_resource | api | hors_ui |  |
| `/api/community/posts/:postId` | `app/routes/api.community.posts.$postId.ts` | api_resource | api | hors_ui |  |
| `/api/community/posts/:postId/bookmark` | `app/routes/api.community.posts.$postId.bookmark.ts` | api_resource | api | hors_ui |  |
| `/api/community/posts/:postId/comments` | `app/routes/api.community.posts.$postId.comments.ts` | api_resource | api | hors_ui |  |
| `/api/community/posts/:postId/like` | `app/routes/api.community.posts.$postId.like.ts` | api_resource | api | hors_ui |  |
| `/api/configured-providers` | `app/routes/api.configured-providers.ts` | api_resource | api | hors_ui |  |
| `/api/connector-token/:provider` | `app/routes/api.connector-token.$provider.ts` | api_resource | api | hors_ui |  |
| `/api/contact/general` | `app/routes/api.contact.general.ts` | api_resource | api | hors_ui |  |
| `/api/contact/sales` | `app/routes/api.contact.sales.ts` | api_resource | api | hors_ui |  |
| `/api/enhancer` | `app/routes/api.enhancer.ts` | api_resource | api | hors_ui |  |
| `/api/explore/projects` | `app/routes/api.explore.projects.ts` | api_resource | api | hors_ui |  |
| `/api/export-api-keys` | `app/routes/api.export-api-keys.ts` | api_resource | api | hors_ui |  |
| `/api/feature-flags` | `app/routes/api.feature-flags.ts` | api_resource | api | hors_ui |  |
| `/api/feature-flags/:featureId/viewed` | `app/routes/api.feature-flags.$featureId.viewed.ts` | api_resource | api | hors_ui |  |
| `/api/git-info` | `app/routes/api.git-info.ts` | api_resource | api | hors_ui |  |
| `/api/git-proxy/*` | `app/routes/api.git-proxy.$.ts` | api_resource | api | hors_ui |  |
| `/api/git/connections` | `app/routes/api.git.connections.ts` | api_resource | api | hors_ui |  |
| `/api/github-branches` | `app/routes/api.github-branches.ts` | api_resource | api | hors_ui |  |
| `/api/github-stats` | `app/routes/api.github-stats.ts` | api_resource | api | hors_ui |  |
| `/api/github-template` | `app/routes/api.github-template.ts` | api_resource | api | hors_ui |  |
| `/api/github-user` | `app/routes/api.github-user.ts` | api_resource | api | hors_ui |  |
| `/api/gitlab-branches` | `app/routes/api.gitlab-branches.ts` | api_resource | api | hors_ui |  |
| `/api/gitlab-projects` | `app/routes/api.gitlab-projects.ts` | api_resource | api | hors_ui |  |
| `/api/health` | `app/routes/api.health.ts` | api_resource | api | hors_ui |  |
| `/api/impersonation` | `app/routes/api.impersonation.tsx` | api_resource | api | hors_ui |  |
| `/api/integration-requests` | `app/routes/api.integration-requests.ts` | api_resource | api | hors_ui |  |
| `/api/integrations/api-key/:provider/configure` | `app/routes/api.integrations.api-key.$provider.configure.ts` | api_resource | api | hors_ui |  |
| `/api/integrations/oauth/:provider/connect` | `app/routes/api.integrations.oauth.$provider.connect.ts` | api_resource | api | hors_ui |  |
| `/api/llmcall` | `app/routes/api.llmcall.ts` | api_resource | api | hors_ui |  |
| `/api/logs/ingest` | `app/routes/api.logs.ingest.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/categories` | `app/routes/api.marketplace.categories.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/extensions` | `app/routes/api.marketplace.extensions.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/publishers` | `app/routes/api.marketplace.publishers.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/tags` | `app/routes/api.marketplace.tags.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/template/:templateId/track` | `app/routes/api.marketplace.template.$templateId.track.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/templates` | `app/routes/api.marketplace.templates.ts` | api_resource | api | hors_ui |  |
| `/api/marketplace/trending` | `app/routes/api.marketplace.trending.ts` | api_resource | api | hors_ui |  |
| `/api/mcp-check` | `app/routes/api.mcp-check.ts` | api_resource | api | hors_ui |  |
| `/api/mcp-update-config` | `app/routes/api.mcp-update-config.ts` | api_resource | api | hors_ui |  |
| `/api/mcp/catalog` | `app/routes/api.mcp.catalog.ts` | api_resource | api | hors_ui |  |
| `/api/mcp/catalog/:slug` | `app/routes/api.mcp.catalog.$slug.ts` | api_resource | api | hors_ui |  |
| `/api/mcp/catalog/domains` | `app/routes/api.mcp.catalog.domains.ts` | api_resource | api | hors_ui |  |
| `/api/mcp/config` | `app/routes/api.mcp.config.ts` | api_resource | api | hors_ui |  |
| `/api/mcp/installs` | `app/routes/api.mcp.installs.ts` | api_resource | api | hors_ui |  |
| `/api/mcp/installs/:installId` | `app/routes/api.mcp.installs.$installId.ts` | api_resource | api | hors_ui |  |
| `/api/me` | `app/routes/api.me.ts` | api_resource | api | hors_ui |  |
| `/api/models` | `app/routes/api.models.ts` | api_resource | api | hors_ui |  |
| `/api/models/:provider` | `app/routes/api.models.$provider.ts` | api_resource | api | hors_ui |  |
| `/api/monitoring/health` | `app/routes/api.monitoring.health.ts` | api_resource | api | hors_ui |  |
| `/api/monitoring/performance` | `app/routes/api.monitoring.performance.ts` | api_resource | api | hors_ui |  |
| `/api/monitoring/performance-budget` | `app/routes/api.monitoring.performance-budget.ts` | api_resource | api | hors_ui |  |
| `/api/netlify-deploy` | `app/routes/api.netlify-deploy.ts` | api_resource | api | hors_ui |  |
| `/api/netlify-user` | `app/routes/api.netlify-user.ts` | api_resource | api | hors_ui |  |
| `/api/notifications` | `app/routes/api.notifications.ts` | api_resource | api | hors_ui |  |
| `/api/notifications/:notificationId` | `app/routes/api.notifications.$notificationId.ts` | api_resource | api | hors_ui |  |
| `/api/notifications/:notificationId/read` | `app/routes/api.notifications.$notificationId.read.ts` | api_resource | api | hors_ui |  |
| `/api/notifications/preferences` | `app/routes/api.notifications.preferences.ts` | api_resource | api | hors_ui |  |
| `/api/notifications/read-all` | `app/routes/api.notifications.read-all.ts` | api_resource | api | hors_ui |  |
| `/api/notifications/settings` | `app/routes/api.notifications.settings.ts` | api_resource | api | hors_ui |  |
| `/api/payments/plans` | `app/routes/api.payments.plans.ts` | api_resource | api | hors_ui |  |
| `/api/polyglot/benchmark` | `app/routes/api.polyglot.benchmark.ts` | api_resource | api | hors_ui |  |
| `/api/polyglot/capabilities` | `app/routes/api.polyglot.capabilities.ts` | api_resource | api | hors_ui |  |
| `/api/polyglot/health` | `app/routes/api.polyglot.health.ts` | api_resource | api | hors_ui |  |
| `/api/projects` | `app/routes/api.projects.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:id/files-revision` | `app/routes/api.projects.$id.files-revision.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:id/files/*` | `app/routes/api.projects.$id.files.$.tsx` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/agent-consensus/:runId` | `app/routes/api.projects.$projectId.agent-consensus.$runId.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/agent-patch-proposals` | `app/routes/api.projects.$projectId.agent-patch-proposals.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/agent-patch-proposals/:proposalId` | `app/routes/api.projects.$projectId.agent-patch-proposals.$proposalId.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/agent-repair-events` | `app/routes/api.projects.$projectId.agent-repair-events.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/ai/conversations` | `app/routes/api.projects.$projectId.ai.conversations.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/ai/conversations/:conversationId/messages` | `app/routes/api.projects.$projectId.ai.conversations.$conversationId.messages.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/ai/conversations/:conversationId/transcript` | `app/routes/api.projects.$projectId.ai.conversations.$conversationId.transcript.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/auth-scaffold` | `app/routes/api.projects.$projectId.auth-scaffold.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/collaboration-ws` | `app/routes/api.projects.$projectId.collaboration-ws.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/database` | `app/routes/api.projects.$projectId.database.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/export/zip` | `app/routes/api.projects.$projectId.export.zip.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/files` | `app/routes/api.projects.$projectId.files.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/files/import/zip` | `app/routes/api.projects.$projectId.files.import.zip.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/homepage-preview` | `app/routes/api.projects.$projectId.homepage-preview.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/ide-panel/:panel` | `app/routes/api.projects.$projectId.ide-panel.$panel.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/ide-state` | `app/routes/api.projects.$projectId.ide-state.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/project-action` | `app/routes/api.projects.$projectId.project-action.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/resources` | `app/routes/api.projects.$projectId.resources.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/scheduled-tasks` | `app/routes/api.projects.$projectId.scheduled-tasks.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/thumbnail` | `app/routes/api.projects.$projectId.thumbnail.ts` | api_resource | api | hors_ui |  |
| `/api/projects/:projectId/thumbnail/refresh` | `app/routes/api.projects.$projectId.thumbnail.refresh.ts` | api_resource | api | hors_ui |  |
| `/api/rag/session-config` | `app/routes/api.rag.session-config.ts` | api_resource | api | hors_ui |  |
| `/api/rag/stats` | `app/routes/api.rag.stats.ts` | api_resource | api | hors_ui |  |
| `/api/relais-idee` | `app/routes/api.relais-idee.ts` | api_resource | api | hors_ui |  |
| `/api/report/abuse` | `app/routes/api.report.abuse.ts` | api_resource | api | hors_ui |  |
| `/api/runtime-token` | `app/routes/api.runtime-token.ts` | api_resource | api | hors_ui |  |
| `/api/status` | `app/routes/api.status.ts` | api_resource | api | hors_ui |  |
| `/api/status/incidents` | `app/routes/api.status.incidents.ts` | api_resource | api | hors_ui |  |
| `/api/status/maintenance` | `app/routes/api.status.maintenance.ts` | api_resource | api | hors_ui |  |
| `/api/status/metrics` | `app/routes/api.status.metrics.ts` | api_resource | api | hors_ui |  |
| `/api/status/services` | `app/routes/api.status.services.ts` | api_resource | api | hors_ui |  |
| `/api/status/uptime` | `app/routes/api.status.uptime.ts` | api_resource | api | hors_ui |  |
| `/api/supabase` | `app/routes/api.supabase.ts` | api_resource | api | hors_ui |  |
| `/api/supabase-user` | `app/routes/api.supabase-user.ts` | api_resource | api | hors_ui |  |
| `/api/supabase/query` | `app/routes/api.supabase.query.ts` | api_resource | api | hors_ui |  |
| `/api/supabase/variables` | `app/routes/api.supabase.variables.ts` | api_resource | api | hors_ui |  |
| `/api/system/diagnostics` | `app/routes/api.system.diagnostics.ts` | api_resource | api | hors_ui |  |
| `/api/system/disk-info` | `app/routes/api.system.disk-info.ts` | api_resource | api | hors_ui |  |
| `/api/system/git-info` | `app/routes/api.system.git-info.ts` | api_resource | api | hors_ui |  |
| `/api/telemetry` | `app/routes/api.telemetry.ts` | api_resource | api | hors_ui |  |
| `/api/templates/suggestions` | `app/routes/api.templates.suggestions.ts` | api_resource | api | hors_ui |  |
| `/api/update` | `app/routes/api.update.ts` | api_resource | api | hors_ui |  |
| `/api/user/preferences` | `app/routes/api.user.preferences.ts` | api_resource | api | hors_ui |  |
| `/api/vercel-deploy` | `app/routes/api.vercel-deploy.ts` | api_resource | api | hors_ui |  |
| `/api/vercel-user` | `app/routes/api.vercel-user.ts` | api_resource | api | hors_ui |  |
| `/api/web-search` | `app/routes/api.web-search.ts` | api_resource | api | hors_ui |  |
| `/api/workspaces/:workspaceId/ide-state` | `app/routes/api.workspaces.$workspaceId.ide-state.ts` | api_resource | api | hors_ui |  |
| `/audit-logs` | `app/routes/audit-logs.tsx` | ui_page | userarea | teste_local_partiel | organization |
| `/auth/oauth/:provider` | `app/routes/auth.oauth.$provider.tsx` | redirect_alias | authentication_action_or_redirect | non_exerce |  |
| `/auth/oauth/:provider/callback` | `app/routes/auth.oauth.$provider.callback.tsx` | redirect_alias | authentication_action_or_redirect | non_exerce |  |
| `/billing` | `app/routes/billing.tsx` | ui_page | userarea | teste_local_partiel | billing, native-zoom |
| `/blog` | `app/routes/blog.tsx` | ui_page | marketing_public | non_exerce |  |
| `/blog/:slug` | `app/routes/blog.$slug.tsx` | ui_page | marketing_public | non_exerce |  |
| `/bounties` | `app/routes/bounties.tsx` | ui_page | marketing_public | non_exerce |  |
| `/careers` | `app/routes/careers.tsx` | ui_page | marketing_public | non_exerce |  |
| `/case-studies` | `app/routes/case-studies.tsx` | ui_page | marketing_public | non_exerce |  |
| `/changelog` | `app/routes/changelog.tsx` | ui_page | marketing_public | non_exerce |  |
| `/changelog.xml` | `app/routes/changelog[.]xml.tsx` | resource_endpoint | public_resource | hors_ui |  |
| `/chat/:id` | `app/routes/chat.$id.tsx` | redirect_alias | other | non_exerce |  |
| `/collaboration` | `app/routes/collaboration.tsx` | ui_page | marketing_public | non_exerce |  |
| `/command-palette` | `app/routes/command-palette.tsx` | ui_page | userarea | teste_local_partiel | palette |
| `/commercial-agreement` | `app/routes/commercial-agreement.tsx` | ui_page | legal_policy | non_exerce |  |
| `/community` | `app/routes/community.tsx` | ui_page | marketing_public | non_exerce |  |
| `/community/post/:id` | `app/routes/community.post.$id.tsx` | ui_page | marketing_public | non_exerce |  |
| `/compare` index | `app/routes/compare._index.tsx` | ui_page | marketing_public | non_exerce |  |
| `/compare/:slug` | `app/routes/compare.$slug.tsx` | ui_page | marketing_public | non_exerce |  |
| `/connected-accounts` | `app/routes/connected-accounts.tsx` | redirect_alias | other | non_exerce |  |
| `/contact` | `app/routes/contact.tsx` | ui_page | marketing_public | teste_local_partiel | contact8999 |
| `/contact-sales` | `app/routes/contact-sales.tsx` | ui_page | marketing_public | teste_local_partiel | contact8999 |
| `/customers` | `app/routes/customers.tsx` | ui_page | marketing_public | non_exerce |  |
| `/dashboard` | `app/routes/dashboard.tsx` | ui_page | userarea | teste_local_partiel | dashboard-projects, native-zoom, palette |
| `/dashboard-nav` | `app/routes/dashboard-nav.ts` | non_ui_helper_discovered | other | hors_ui |  |
| `/dashboard/templates` | `app/routes/dashboard_.templates.tsx` | ui_page | userarea | teste_local_partiel | templates-recent |
| `/data-deletion` | `app/routes/data-deletion.tsx` | ui_page | legal_policy | non_exerce |  |
| `/deleting-your-data` | `app/routes/deleting-your-data.tsx` | ui_page | legal_policy | non_exerce |  |
| `/demo` | `app/routes/demo.tsx` | ui_page | marketing_public | non_exerce |  |
| `/deployments` | `app/routes/deployments.tsx` | ui_page | userarea | non_exerce |  |
| `/desktop` | `app/routes/desktop.tsx` | ui_page | marketing_public | non_exerce |  |
| `/desktop-settings` | `app/routes/desktop-settings.tsx` | ui_page | userarea | teste_local_partiel | workspace-support-desktop |
| `/docs` | `app/routes/docs.tsx` | ui_page | marketing_public | non_exerce |  |
| `/downgrade` | `app/routes/downgrade.tsx` | ui_page | userarea | non_exerce |  |
| `/dpa` | `app/routes/dpa.tsx` | ui_page | legal_policy | non_exerce |  |
| `/editor/:id` | `app/routes/editor.$id.tsx` | redirect_alias | compatibility_redirect | non_exerce |  |
| `/editor/new` | `app/routes/editor.new.tsx` | redirect_alias | compatibility_redirect | non_exerce |  |
| `/enforcement` | `app/routes/enforcement.tsx` | ui_page | legal_policy | non_exerce |  |
| `/enterprise` | `app/routes/enterprise.tsx` | ui_page | marketing_public | teste_local_partiel | major9999 |
| `/enterprise-sso-settings` | `app/routes/enterprise-sso-settings.tsx` | ui_page | userarea | non_exerce |  |
| `/explore` | `app/routes/explore.tsx` | ui_page | marketing_public | non_exerce |  |
| `/features` | `app/routes/features.tsx` | ui_page | marketing_public | teste_local_partiel | marketing9599, features9799 |
| `/forgot-password` | `app/routes/forgot-password.tsx` | ui_page | authentication | non_exerce |  |
| `/forum` | `app/routes/forum.tsx` | ui_page | marketing_public | non_exerce |  |
| `/gallery` index | `app/routes/gallery._index.tsx` | ui_page | marketing_public | non_exerce |  |
| `/gallery/:slug` | `app/routes/gallery.$slug.tsx` | ui_page | marketing_public | non_exerce |  |
| `/git` | `app/routes/git.tsx` | ui_page | other | non_exerce |  |
| `/github-import` | `app/routes/github-import.tsx` | redirect_alias | other | non_exerce |  |
| `/health` | `app/routes/health.ts` | resource_endpoint | public_resource | hors_ui |  |
| `/help` | `app/routes/help.tsx` | ui_page | marketing_public | non_exerce |  |
| `/help-center` | `app/routes/help-center.tsx` | ui_page | marketing_public | non_exerce |  |
| `/ide/:id` | `app/routes/ide.$id.tsx` | ui_page | marketing_public | non_exerce |  |
| `/ide/new` | `app/routes/ide.new.tsx` | ui_page | marketing_public | non_exerce |  |
| `/import` index | `app/routes/import._index.tsx` | ui_page | userarea | non_exerce |  |
| `/import-github` | `app/routes/import-github.tsx` | ui_page | userarea | non_exerce |  |
| `/import-zip` | `app/routes/import-zip.tsx` | ui_page | userarea | non_exerce |  |
| `/import/:provider` | `app/routes/import.$provider.tsx` | ui_page | userarea | non_exerce |  |
| `/import/empty` | `app/routes/import.empty.tsx` | ui_page | userarea | non_exerce |  |
| `/import/spreadsheet` | `app/routes/import.spreadsheet.tsx` | ui_page | userarea | non_exerce |  |
| `/integrations/oauth/:provider/callback` | `app/routes/integrations.oauth.$provider.callback.tsx` | ui_page | other | non_exerce |  |
| `/invitations` | `app/routes/invitations.tsx` | ui_page | userarea | teste_local_partiel | organization |
| `/invitations/accept` | `app/routes/invitations_.accept.tsx` | ui_page | userarea | non_exerce |  |
| `/invoices` | `app/routes/invoices.tsx` | ui_page | userarea | teste_local_partiel | invoices-plans |
| `/invoices/download` | `app/routes/invoices_.download.ts` | resource_endpoint | other | hors_ui |  |
| `/languages` | `app/routes/languages.tsx` | ui_page | marketing_public | non_exerce |  |
| `/legal` | `app/routes/legal.tsx` | ui_page | legal_policy | teste_local_partiel | marketing9599 |
| `/licensing` | `app/routes/licensing.tsx` | ui_page | legal_policy | non_exerce |  |
| `/login` | `app/routes/login.tsx` | ui_page | authentication | teste_local_partiel | public7799, zoom7799, contrast8999 |
| `/logout` | `app/routes/logout.tsx` | redirect_alias | authentication_action_or_redirect | non_exerce |  |
| `/marketing/:slug` | `app/routes/marketing.$slug.tsx` | ui_page | not_found | non_exerce |  |
| `/marketing/bounties` | `app/routes/marketing.bounties.tsx` | ui_page | marketing_public | non_exerce |  |
| `/marketing/deployments` | `app/routes/marketing.deployments.tsx` | ui_page | marketing_public | non_exerce |  |
| `/marketing/teams` | `app/routes/marketing.teams.tsx` | ui_page | marketing_public | non_exerce |  |
| `/marketplace` index | `app/routes/marketplace._index.tsx` | ui_page | marketing_public | non_exerce |  |
| `/marketplace` | `app/routes/marketplace.tsx` | ui_layout | layout | non_exerce |  |
| `/marketplace/templates` | `app/routes/marketplace.templates.tsx` | ui_page | marketing_public | non_exerce |  |
| `/mcp` | `app/routes/mcp.tsx` | ui_page | marketing_public | non_exerce |  |
| `/mfa-setup` | `app/routes/mfa-setup.tsx` | ui_page | userarea | non_exerce |  |
| `/mobile` | `app/routes/mobile.tsx` | ui_page | marketing_public | non_exerce |  |
| `/mobile-workspace/:projectId` | `app/routes/mobile-workspace.$projectId.tsx` | ui_page | project | non_exerce |  |
| `/newsletter` | `app/routes/newsletter.tsx` | ui_page | marketing_public | non_exerce |  |
| `/newsletter-confirmed` | `app/routes/newsletter-confirmed.tsx` | ui_page | marketing_public | non_exerce |  |
| `/newsletter/confirm` | `app/routes/newsletter_.confirm.tsx` | ui_page | marketing_public | non_exerce |  |
| `/newsletter/unsubscribe` | `app/routes/newsletter_.unsubscribe.tsx` | ui_page | marketing_public | non_exerce |  |
| `/notifications` | `app/routes/notifications.tsx` | ui_page | userarea | teste_local_partiel | notifications-usage |
| `/onboarding` | `app/routes/onboarding.tsx` | redirect_alias | other | non_exerce |  |
| `/organization-domains` | `app/routes/organization-domains.tsx` | ui_page | userarea | non_exerce |  |
| `/organization-invitations` | `app/routes/organization-invitations.tsx` | ui_page | userarea | teste_local_partiel | organization |
| `/organization-members` | `app/routes/organization-members.tsx` | ui_page | userarea | teste_local_partiel | members, members-keys-zoom |
| `/organization-roles` | `app/routes/organization-roles.tsx` | ui_page | userarea | teste_local_partiel | organization, role-targets |
| `/organization-security` | `app/routes/organization-security.tsx` | ui_page | userarea | non_exerce |  |
| `/organization-siem` | `app/routes/organization-siem.tsx` | ui_page | userarea | non_exerce |  |
| `/organization-switcher` | `app/routes/organization-switcher.tsx` | ui_page | userarea | non_exerce |  |
| `/partners` | `app/routes/partners.tsx` | ui_page | marketing_public | non_exerce |  |
| `/payment-method` | `app/routes/payment-method.tsx` | ui_page | userarea | teste_local_partiel | payment-upgrade |
| `/plan-comparison` | `app/routes/plan-comparison.tsx` | ui_page | userarea | teste_local_partiel | invoices-plans |
| `/polyglot` | `app/routes/polyglot.tsx` | ui_page | marketing_public | non_exerce |  |
| `/press` | `app/routes/press.tsx` | ui_page | marketing_public | non_exerce |  |
| `/pricing` | `app/routes/pricing.tsx` | ui_page | marketing_public | teste_local_partiel | public7799, public7899, public8299, zoom7799, zoom7899, contrast8999 |
| `/privacy` | `app/routes/privacy.tsx` | ui_page | legal_policy | teste_local_partiel | legal8999, legal9599, legalzoom9599 |
| `/product` | `app/routes/product.tsx` | ui_page | marketing_public | non_exerce |  |
| `/profile/:username` | `app/routes/profile.$username.tsx` | redirect_alias | compatibility_404 | non_exerce |  |
| `/project/:id` | `app/routes/project.$id.tsx` | redirect_alias | project | non_exerce |  |
| `/projects` index | `app/routes/projects._index.tsx` | ui_page | userarea | teste_local_partiel | dashboard-projects, native-zoom |
| `/projects` | `app/routes/projects.tsx` | ui_layout | userarea | teste_local_partiel | dashboard-projects, native-zoom |
| `/projects/:projectId` index | `app/routes/projects.$projectId._index.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId` | `app/routes/projects.$projectId.tsx` | ui_layout | project | non_exerce |  |
| `/projects/:projectId/activity` | `app/routes/projects.$projectId.activity.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/collaborators` | `app/routes/projects.$projectId.collaborators.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/database` | `app/routes/projects.$projectId.database.tsx` | ui_page | project | reserve |  |
| `/projects/:projectId/deployments` | `app/routes/projects.$projectId.deployments.tsx` | redirect_with_legacy_resource | project | reserve |  |
| `/projects/:projectId/deployments/view` | `app/routes/projects.$projectId.deployments.view.ts` | non_ui_helper_discovered | project | hors_ui |  |
| `/projects/:projectId/domains` | `app/routes/projects.$projectId.domains.tsx` | redirect_with_legacy_resource | project | reserve |  |
| `/projects/:projectId/env` | `app/routes/projects.$projectId.env.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/env/helpers` | `app/routes/projects.$projectId.env.helpers.ts` | non_ui_helper_discovered | project | hors_ui |  |
| `/projects/:projectId/git` | `app/routes/projects.$projectId.git.tsx` | redirect_with_legacy_resource | project | reserve |  |
| `/projects/:projectId/ide` | `app/routes/projects.$projectId.ide.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/ide/helpers` | `app/routes/projects.$projectId.ide.helpers.ts` | non_ui_helper_discovered | project | hors_ui |  |
| `/projects/:projectId/ide/revalidate` | `app/routes/projects.$projectId.ide.revalidate.ts` | non_ui_helper_discovered | project | hors_ui |  |
| `/projects/:projectId/import/:source` | `app/routes/projects.$projectId.import.$source.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/logs` | `app/routes/projects.$projectId.logs.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/logs/view` | `app/routes/projects.$projectId.logs.view.ts` | non_ui_helper_discovered | project | hors_ui |  |
| `/projects/:projectId/preview` | `app/routes/projects.$projectId.preview.tsx` | redirect_alias | project | non_exerce |  |
| `/projects/:projectId/secrets` | `app/routes/projects.$projectId.secrets.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/secrets/rows` | `app/routes/projects.$projectId.secrets.rows.ts` | non_ui_helper_discovered | project | hors_ui |  |
| `/projects/:projectId/settings` | `app/routes/projects.$projectId.settings.tsx` | ui_page | project | non_exerce |  |
| `/projects/:projectId/snapshots` | `app/routes/projects.$projectId.snapshots.tsx` | ui_page | project | reserve |  |
| `/projects/new` | `app/routes/projects.new.tsx` | ui_page | project | non_exerce |  |
| `/projects/share/:token` | `app/routes/projects.share.$token.tsx` | ui_page | project | non_exerce |  |
| `/quota-exceeded` | `app/routes/quota-exceeded.tsx` | ui_page | userarea | non_exerce |  |
| `/recent-projects` | `app/routes/recent-projects.tsx` | ui_page | userarea | teste_local_partiel | templates-recent |
| `/recovery-codes` | `app/routes/recovery-codes.tsx` | ui_page | userarea | non_exerce |  |
| `/register` | `app/routes/register.tsx` | ui_page | authentication | non_exerce |  |
| `/report-abuse` | `app/routes/report-abuse.tsx` | ui_page | legal_policy | non_exerce |  |
| `/reset-password` | `app/routes/reset-password.tsx` | ui_page | authentication | non_exerce |  |
| `/roles-and-permissions` | `app/routes/roles-and-permissions.tsx` | ui_page | userarea | teste_local_partiel | organization, role-targets |
| `/runtime-test` | `app/routes/runtime-test.tsx` | ui_page | public_diagnostic | non_exerce |  |
| `/scim-token-settings` | `app/routes/scim-token-settings.tsx` | ui_page | userarea | non_exerce |  |
| `/search` | `app/routes/search.tsx` | ui_page | marketing_public | non_exerce |  |
| `/security` | `app/routes/security.tsx` | ui_page | legal_policy | non_exerce |  |
| `/security-settings` | `app/routes/security-settings.tsx` | ui_page | userarea | teste_local_partiel | security |
| `/session-security` | `app/routes/session-security.tsx` | ui_page | userarea | teste_local_partiel | security |
| `/settings` | `app/routes/settings.tsx` | ui_page | ide | non_exerce |  |
| `/settings/:tab` | `app/routes/settings.$tab.tsx` | ui_page | ide | non_exerce |  |
| `/share/:token` | `app/routes/share.$token.tsx` | ui_page | public_share_token | non_exerce |  |
| `/signup` | `app/routes/signup.tsx` | ui_page | authentication | teste_local_partiel | public7799, zoom7799, contrast8999 |
| `/sitemap.xml` | `app/routes/sitemap[.]xml.tsx` | resource_endpoint | public_resource | hors_ui |  |
| `/snapshot-restore-database` | `app/routes/snapshot-restore-database.ts` | non_ui_helper_discovered | other | hors_ui |  |
| `/solutions` index | `app/routes/solutions._index.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/:slug` | `app/routes/solutions.$slug.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/app-builder` | `app/routes/solutions.app-builder.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/chatbot-builder` | `app/routes/solutions.chatbot-builder.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/dashboard-builder` | `app/routes/solutions.dashboard-builder.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/enterprise` | `app/routes/solutions.enterprise.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/freelancers` | `app/routes/solutions.freelancers.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/game-builder` | `app/routes/solutions.game-builder.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/internal-ai-builder` | `app/routes/solutions.internal-ai-builder.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/startups` | `app/routes/solutions.startups.tsx` | ui_page | marketing_public | non_exerce |  |
| `/solutions/website-builder` | `app/routes/solutions.website-builder.tsx` | ui_page | marketing_public | non_exerce |  |
| `/status` | `app/routes/status.tsx` | ui_page | marketing_public | non_exerce |  |
| `/strike-system` | `app/routes/strike-system.tsx` | ui_page | legal_policy | non_exerce |  |
| `/student-dpa` | `app/routes/student-dpa.tsx` | ui_page | legal_policy | non_exerce |  |
| `/subprocessors` | `app/routes/subprocessors.tsx` | ui_page | legal_policy | non_exerce |  |
| `/subscribe` | `app/routes/subscribe.tsx` | redirect_alias | other | non_exerce |  |
| `/support` | `app/routes/support.tsx` | ui_page | userarea | teste_local_partiel | workspace-support-desktop |
| `/support-policy` | `app/routes/support-policy.tsx` | ui_page | legal_policy | teste_local_partiel | legal8999, support9799 |
| `/support/:id` | `app/routes/support_.$id.tsx` | ui_page | userarea | non_exerce |  |
| `/sw.js` | `app/routes/sw[.]js.ts` | resource_endpoint | public_resource | hors_ui |  |
| `/team` | `app/routes/team.tsx` | ui_page | marketing_public | non_exerce |  |
| `/teams/:id` | `app/routes/teams.$id.tsx` | ui_page | userarea | non_exerce |  |
| `/teams/:id/settings` | `app/routes/teams.$id.settings.tsx` | ui_page | userarea | non_exerce |  |
| `/teams/new` | `app/routes/teams.new.tsx` | redirect_alias | other | non_exerce |  |
| `/templates` | `app/routes/templates.tsx` | ui_page | marketing_public | non_exerce |  |
| `/templates/languages` | `app/routes/templates_.languages.tsx` | ui_page | marketing_public | non_exerce |  |
| `/templates/languages/icons` | `app/routes/templates_.languages.icons.ts` | non_ui_helper_discovered | other | hors_ui |  |
| `/terms` | `app/routes/terms.tsx` | ui_page | legal_policy | teste_local_partiel | legal8999, legal9599, legalzoom9599 |
| `/theme-validation` | `app/routes/theme-validation.tsx` | ui_page | public_diagnostic | non_exerce |  |
| `/trust-and-safety` | `app/routes/trust-and-safety.tsx` | ui_page | legal_policy | non_exerce |  |
| `/tutorials` | `app/routes/tutorials.tsx` | ui_page | marketing_public | non_exerce |  |
| `/u/:username` | `app/routes/u.$username.tsx` | redirect_alias | compatibility_404 | non_exerce |  |
| `/u/:username/:projectname` | `app/routes/u.$username.$projectname.tsx` | redirect_alias | compatibility_404 | non_exerce |  |
| `/upgrade` | `app/routes/upgrade.tsx` | ui_page | userarea | teste_local_partiel | payment-upgrade |
| `/usage` | `app/routes/usage.tsx` | ui_page | userarea | teste_local_partiel | notifications-usage |
| `/usage-limits` | `app/routes/usage-limits.tsx` | ui_page | legal_policy | non_exerce |  |
| `/user/:username` | `app/routes/user.$username.tsx` | redirect_alias | compatibility_404 | non_exerce |  |
| `/user/settings` | `app/routes/user.settings.tsx` | redirect_alias | other | non_exerce |  |
| `/verify-email` | `app/routes/verify-email.tsx` | ui_page | authentication | non_exerce |  |
| `/webcontainer/connect/:id` | `app/routes/webcontainer.connect.$id.tsx` | resource_endpoint | ide | hors_ui |  |
| `/webcontainer/preview/:id` | `app/routes/webcontainer.preview.$id.tsx` | ui_page | ide | non_exerce |  |
| `/workspace-settings` | `app/routes/workspace-settings.tsx` | ui_page | userarea | teste_local_partiel | workspace-support-desktop |

## Limites et points suivants

- No new browser recipe executed for this inventory. Historical ports/builds differ; no broad current-main or deployed-version certification.
- Only local Chromium evidence; synthetic APIs. No real auth, backend mutation, checkout, key lifecycle or customer data.
- No complete Safari/Firefox, real screenreader, virtual OS keyboard or hardware safe-area evidence.
- Native200% verified only in named groups (physical1280→CSS640,DPR2,visualViewport.scale1); no coverage inferred from viewport-only640 or pinch.
- No tests/spec filename or aggregate CI count treated as route acceptance.
- Parameterized route patterns are inventory entries, not coverage of all values. Public concrete dynamic surfaces are enumerated separately in public-routes.json.

Les11 modules `non_ui_helper_discovered` sont réellement découverts par flatRoutes mais ne fournissent ni default, ni loader/action. Ce constat structurel n’est pas un défaut d’affichage reproduit et aucun fichier produit n’a été modifié.

Priorité de recette suivante : pages organisation non exercées (sécurité, SIEM, sélecteur, domaines, SSO/SCIM), création/import de projet sans mutations réelles, puis parcours projet/IDE avec coordination du propriétaire. Les routes auth doivent être distinguées de la simple géométrie Login/Signup. Toutes les variantes paramétrées, listes vides/chargements/permissions et erreurs non citées restent à exercer.

Toutes les destinations explicites des quatre listes de navigation SaaS et du bouton créer correspondent à un motif enregistré (query retirée pour cette comparaison). Ce contrôle statique ne prouve pas le parcours. Les dimensions ci-dessus sont extraites des reçus, pas normalisées vers un format supposé ; une hauteur absente reste inconnue.

Routes/exports inventoried before concurrent local corrections; source/layout UI changes in this worktree are not new browser evidence. Active organization-security/SIEM/switcher work is excluded until separately archived.

## Vérification palette et coordination précise

`/command-palette` a été directement exercée, sans transfert de couverture depuis Dashboard : `palette/after.json` contient20 observations par route et `extended.json`24 par route, base6899, erreurs vides. Les deux harnesses parcourent explicitement `/dashboard` et `/command-palette` via `page.goto`. Chaque phase contient8 groupes clavier (4 par route), répétés dans l’extension.

`/api-keys` est une page **userarea**, jamais une ressource `/api/`. Les31 réservations initiales étaient trop larges :26 sont reclassées **non_exerce**, cinq conservent le propriétaire métier nommé (Git/Domaines/Déploiements #788 ; Database/Snapshots restauration #789). Admin et autres routes IDE/projet ne sont pas présumés interdits. Les propriétaires de panneaux internes ne possèdent pas automatiquement toute leur route hôte. Hub Intégrations, Debugger #783 et Fleet sont détaillés dans panels.json.

Réservé signifie coordination d’un périmètre explicitement nommé, pas nouvelle autorisation requise pour une recette synthétique locale en lecture seule. Résumé corrigé :42 modules avec preuve locale partielle,155 non exercés,5 avec propriétaire explicite,155 hors UI. Aucune nouvelle recette en cours attribuée à ces résultats.
