# Batch 7 — H1–H30 : SPEC OFFICIELLE (validation du commanditaire — 06/07/2026)

Hovers cassés, affordances invisibles, fragmentation settings, finitions chat/IDE.
Règles : tokens obligatoires, **orange=marque / bleu=action** (`--vc-ide-accent-action`), composants `app/components/ui/` d'abord, **un commit par point** (`H7: …`), zéro changement hors périmètre.

Fils rouges : (1) bouton primaire copié-collé sur 6 surfaces → hover illisible (plein→fantôme) ; (2) affordances invisibles/menteuses ; (3) 4 portes d'entrée « settings » + 5 routes app = brochures ; (4) dernières couleurs codées en dur.
Note : G7 corrigé par ce batch — cap 4 images existe (`image-attachments.ts`), reste le volet taille/downscale.

Ordre : H1→H4 · G2→H13 · B1/C11→H5 · G12→H7 · G8→H15 · G5→H19. Reste libre.

## A. Thème & héritage visuel
- **H1** Hover « plein→fantôme » sur 6 CTA primaires : classes copiées `bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent hover:bg-bolt-elements-button-primary-backgroundHover` (fond alpha 10-20% → bouton devient fantôme à texte bleu). Sites : `ExportChatButton.tsx:9`, `deploy/DeployButton.tsx:134`, `Workbench.client.tsx:649,694`, `HeaderActionButtons.client.tsx:38,55` (+ `bg-accent-700` incohérent). → un seul pattern primaire plein `bg-accent-500 hover:bg-accent-600 text-white`, focus `--vc-ide-ring`, factorisé dans `ui/Button` variante `primary`.
- **H2** Panneau Deployments orange marque comme accent action (échappé à B4) : `DeploymentOverview.tsx:95,111,139,190` (liens), `DeploySubNav.tsx:39` (onglet actif). → bleu `--vc-ide-accent-action`. Recouper G18.
- **H3** `bg-white` codés en dur deploy+preview : `GitHubDeploymentDialog.tsx:603,744,819`, `GitLabDeploymentDialog.tsx:303,440,515`, `PortDropdown.tsx:59`, `DeploymentOverview.tsx:215` (QR — à commenter si blanc requis). → `bg-bolt-elements-background-depth-1/2` sans dark: dupliqué ; blanc uniquement pour QR + commentaire.
- **H4** Toolbar Code : 3 « primaires » côte à côte `Workbench.client.tsx:639-698` (Export/Sync/Toggle tous pleins accent) ; bordures gris `border-gray-200/50` :660 ; Toggle Terminal :692-698 sans état (`aria-pressed` absent). → Export/Sync/Toggle en **secondaires**, un seul primaire/barre ; `aria-pressed`+état actif ; bordures→`borderColor`.
- **H5** Statuts en Tailwind brut : `admin/SupportTicketsPanel.tsx:304-306` (green/red-500/30), `routes/mfa-setup.tsx:148`. → `--status-success-*`/`--status-error-*`.
- **H6** Graphes admin palette hex codée : `admin/MonitoringCharts.tsx:41-50` (10 hex, orange #f97316 en série 1). → variables `--vc-chart-1…10` (light+dark), série 1 = bleu action, retirer l'orange marque des séries.
- **H7** Toolbar Preview `<select>` natif hors thème : `Preview.tsx:2019-2028` (device selector sans classe, illisible dark). → styler tokens (mêmes hauteurs/radius que IconButton) ou dropdown existant ; garder aria-label. title→G12.
- **H8** Couleurs/copies codées restantes : `ImportButtons.tsx:87` (rgba bordures), `:56` (toast « Something went wrong »), styles refaits main ; `ScreenshotSelector.tsx:276` (voile rgba(0,0,0,0.1)). → tokens (`borderColor`, `--vc-ide-overlay`) ; message précis ; grep `rgba(` app/components.

## B. Chat / composer
- **H9** « Prompt enhanced! » toast qui ment : `ChatBox.tsx:230-232` (toast au clic, avant résultat ; op async :141-145). → toast à la complétion + toast erreur ; spinner pendant.
- **H10** Bouton pièce jointe menteur : `ChatBox.tsx:533-535` « Upload file » alors que `image/*` seul (`BaseChat.tsx:5306`). → « Attach images » (title+tooltip+aria), cohérent compteur n/4 + G7.
- **H11** FilePreview tuile fantôme + cible minuscule : `FilePreview.tsx:17-28` (div vide si pas de dataURL ; remove 32px < 44px). → tuile générique (icône+nom) ; remove ≥44px (F28).
- **H12** Renommage chat sans nom + course blur/submit : `ChatDescription.client.tsx:55-58` (submit sans aria-label ; `onMouseDown`+`onBlur`=double submit ; crayon :69-76 sans nom). → `aria-label="Save title"`/`"Rename chat"` ; retirer onMouseDown ; Échap annule.
- **H13** Tiroir chats affordance invisible desktop : ouvre par `mousemove` bord gauche (`Menu.client.tsx:261-282`) ; bouton visible mobile seul (:320-337) ; header icône = `<div>` décoratif (`Header.tsx:19`) ; logos `alt="logo"` :22-23. → icône header = vrai bouton toggle (aria-expanded, tooltip « Chats ») ; garder l'heuristique en bonus ; `alt="E-Code"`.
- **H14** ⌘K to clear collision palette globale : `ModelSelector.tsx:357-360,415-418` (⌘K vide la recherche ; placeholders :540,759) alors que ⌘K = palette globale. → Échap (vide sinon ferme) ; retirer mention ; vérifier dispatcher keybindings ignore `defaultPrevented`.
- **H15** Templates démarrage jettent le brouillon : `StarterTemplates.tsx:11` (`<a href="/git?url=…">` same-tab perd le prompt). → flux import in-place (GitCloneButton/GitUrlImport) OU garde « brouillon non envoyé » ; `data-discard-guard` commun G8.

## C. IDE
- **H16** Palette ⌘K projet sans sémantique listbox : `BaseChat.tsx:7892-7958` (`<button aria-current>` sans role listbox/option, pas d'aria-activedescendant). Dashboard fait mieux (`SaaSLayout.tsx:1694-1706`). → aligner : role listbox/option/aria-selected + aria-activedescendant + focus restauré à la fermeture.
- **H17** Terminal corbeille = « Clear conversation » : `TerminalTabs.tsx:606-607`. → « Clear terminal ».
- **H18** Limite shells silencieuse : `TerminalTabs.tsx:572-575` (« + » disparaît au cap MAX_TERMINALS=4 :56). → garder visible disabled + tooltip « Maximum 4 shells ».
- **H19** DiffView sans action : `DiffView.tsx` (seul fullscreen :88). → bouton « Revert file » par fichier (ConfirmDialog G5 + Undo si faisable ; vérifier API restauration workbenchStore/fileHistory sinon snapshot E25).
- **H20** Titre onglet IDE = ID technique : `projects.$projectId.ide.tsx:58-59` (`E-Code IDE - {projectId}` brut) alors que header a `friendlyLabel` :256. → « {Nom projet} — E-Code IDE ».
- **H21** Preview Back/Forward toujours actifs, échec muet : `Preview.tsx:1966-1967` ; `navigatePreviewHistory:1142-1146` avale le cross-origin. → désactiver quand historique indispo + tooltip « Navigation history unavailable for external URLs ».

## D. Routes & flux
- **H22** /settings sort vers la landing : `settings.tsx:11-19` (`onClose→navigate('/')` renvoie au marketing ; fond BackgroundRays onboarding). → `navigate(-1)` fallback `/dashboard` ; fond depth-1 sobre.
- **H23** 4 portes « settings » : `/settings` (overlay), `/account-settings` (AppShell), `/workspace-settings`, `/user/settings` (brochure). → 1 cible/intention : compte→/account-settings ; IDE/providers→Control Panel overlay (pas route « / ») ; rediriger les autres (301 interne). Vérifier menus entrants (AvatarDropdown, SaaSLayout, account-menu-links).
- **H24** 5 routes app = brochures : `EcodeSurfacePages.tsx` sur `/user/settings`, `/editor/new`, `/ai-agent/studio`, `/teams/new`, `/github-import` (orphelines, indexables ; teams/new ressemble à un vrai flux, cf G23). → par route : vrai flux (teams/new→dialog création G23 ; github-import→/git), OU redirect, OU 404 propre. Valider intention produit avant suppression.
- **H25** Desktop settings contrôles morts hors Electron : `desktop-settings.tsx` (`bridgeReady:26-44` jamais utilisé ; Proxy/tray/Test notification actifs mais inertes sur web ; policy JSON brut `<pre>:158-165`). → sans bridge : contrôles disabled + EmptyState (« Available in the E-Code desktop app » + lien /desktop) ; policy en liste clé→valeur + « View raw ».
- **H26** Verify email resend sans garde-fou : `verify-email.tsx:116-122` (désactivé seulement pendant submit). → cooldown client 60s avec compte à rebours (E9) ; vérifier throttle serveur :11.
- **H27** Reset password sans jauge : `reset-password.tsx:89-99` (minLength nu) alors que signup a `PasswordStrengthMeter`. → réutiliser PasswordStrengthMeter + checklist (E8/signup).
- **H28** Login stats héros dupliquées/contradictoires : `login.tsx:296-309` (« 21 AI providers/29+ Languages ») vs `:316-327` (« 21 AI models ») ; register/forgot ont leurs copies. → constante partagée `AUTH_HERO_STATS`.

## E. Marketing & global
- **H29** MegaMenu ferme au survol sans intention : `EcodeExactShell.tsx:659-660` (`onMouseLeave` ferme immédiat). → délai fermeture ~150ms annulé au ré-entrée (hover intent), zone panneau incluse.
- **H30** Toasts icônes seulement success/error : `root.tsx:509-518` (info/warning/loading = undefined). → compléter : info (`i-ph:info`), warning (`i-ph:warning` `--status-warning-text`), loading (spinner).

## Vérification
`pnpm lint && test && typecheck` · captures clair+sombre 1440/768/390 (compléter DESIGN_CAPTURES) · greps clôture : `hover:text-bolt-elements-item-contentAccent`+`bg-accent-`=0 (H1), `bg-white dark:` deploy+PortDropdown=0 hors QR (H3), `border-gray-[0-9]` workbench=0 (H4), `green-500|red-500` admin+mfa-setup=0 (H5), `rgba(` sans ImportButtons/ScreenshotSelector (H8), `⌘K to clear`=0 (H14), « Clear conversation » terminal=0 (H17), `getEcodeStandaloneSurfacePage` non consommé par les 5 routes (H24) · clavier (listbox H16, toggle terminal H4, Échap dropdowns H14) · web sans Electron (H25 tout disabled ; H15+G8 brouillon).

---
---

# Batch 8 — I1–I30 : SPEC OFFICIELLE (validation du commanditaire — 06/07/2026)

Statuts bruts dans les routes, imports qui perdent des fichiers, surfaces orphelines, secrets sans reveal.
Constats vérifiés dans `~/dev/vibecore` le 06/07/2026 (grep + lecture), sauf mention **(captures)** / **(à vérifier)**. Mêmes règles globales : tokens obligatoires, **orange = marque / bleu = action**, composants `app/components/ui/` d'abord, un commit par point (`I9: …`), zéro changement visuel hors périmètre.

**Fils rouges** : (1) les ROUTES utilisent partout des rouges/verts Tailwind bruts pour bannières et badges — ~25 sites jamais couverts par B1/C11/G19/H5 (scopés composants) ; (2) l'import Git jette silencieusement les fichiers Python/Go/Rust (allowlist d'extensions) ; (3) la carte des surfaces orphelines s'affine (`/github-import` brochure à côté du vrai `/import-github`, réglages éditeur sur une route qu'aucun lien n'atteint) ; (4) secrets saisis sans reveal ni copy à trois endroits.
Recoupe : I23 complète E12 (revoke déjà présent), I27–I30 complètent H22/H24 avec des cibles vérifiées.

**Ordre** : `I1 → I2/I3` (Badge et AlertBanner d'abord, les routes consomment), `G5 → I5` (ConfirmDialog), `C15/G9 → I7/I8` (même composant reveal), `D1 → I4` (util dates), `C7 → I15/I22` (EmptyState), `H24 → I28/I29/I30` (même carte des surfaces). Reste libre. Suggestion : I1, I2, I3, I4, I5–I8, I9, I10, I11, I12–I16, I17–I19, I20–I26, I27–I30.

## A. Statuts & couleurs au niveau des routes
- **I1** `ui/Badge.tsx:14,17,19` : `destructive`/`success`/`danger` en `red-500`/`green-500` bruts (G1 n'a corrigé que `primary` violette) ; Badge consommé par support/invoices/admin. → `--status-error-*`/`--status-success-*` (cascade partout) + variante `warning` tokenisée.
- **I2** Bannières erreur/succès des routes : ~25 sites hors tokens, pattern `border-red-500/40 bg-red-500/10 text-red-500` (et vert/ambre, parfois `text-red-300`/`green-300`/`amber-200` contraste douteux en light) copiés dans : `projects.$projectId.env.tsx:119,142,168` ; `projects.$projectId.deployments.tsx:277` ; `dashboard_.templates.tsx:101` ; `connected-accounts.tsx:213,219,396,482,548` ; `organization-roles.tsx:188` ; `organization-security.tsx:358,374` ; `organization-members.tsx:256` ; `import-github.tsx:110` ; `notifications.tsx:338,436` ; `organization-siem.tsx:264,290` ; `usage.tsx:351,356` ; `import-zip.tsx:90` ; `session-security.tsx:250,322` ; `organization-domains.tsx:188,197` ; `mfa-setup.tsx:148,205,249` ; `scim-token-settings.tsx:259` ; `organization-invitations.tsx:185,263` ; `security-settings.tsx:40` ; `projects.$projectId.secrets.tsx:147,174` ; `support.tsx:224,229` ; `billing.tsx:557` ; `account-data.tsx:367,449` ; `projects.$projectId.logs.tsx:72,122` ; `api-keys.tsx:283` ; `enterprise/EnterpriseFormPage.tsx:37`. → composant `ui/AlertBanner` (variant error/success/warning/info, `role="alert"`/`"status"`, tokens `--status-*` + fonds) ; migration mécanique, 2 commits max (composant, puis routes) ; hover destructifs → tokens.
- **I3** Dates légales incohérentes : Terms/Privacy « January 24, 2024 » (`pages/Terms.tsx:20`, `Privacy.tsx:20`), DPA « January 1, 2025 » (`DPA.tsx:273`), CommercialAgreement « June 16, 2026 » (`CommercialAgreement.tsx:22`), Subprocessors/StudentDPA dynamiques (`Subprocessors.tsx:173`, `StudentDPA.tsx:152-158`). → constante `LEGAL_DATES` par document, « Last updated » uniforme, PAS de date auto-calculée **(captures : dates réelles à valider lors de la validation du commanditaire)**.
- **I4** Dates ad hoc `toLocaleString()` : `organization-siem.tsx:161`, `database/DatabaseRollbackPanel.tsx:236`, `projects.$projectId._index.tsx:69`. → util D1 (relatif <7j sinon date courte) ; grep `toLocaleString()` app/.

## B. Actions risquées & secrets
- **I5** Rollback DB restore sans confirmation : `DatabaseRollbackPanel.tsx:137-142` (« Restore » :198-202 soumet un PITR destructif dès le clic). → ConfirmDialog G5 + écho date/heure cible + « A snapshot of the current state is created first » **(à vérifier backend snapshot avant restore)** ; confirm en `--status-error-text`.
- **I6** SIEM sans test endpoint : `organization-siem.tsx` (URL+secret min 16, mais pas de « Send test event » ; :156-169 « No deliveries yet »). → bouton « Send test event » → delivery signée factice + statut HTTP inline **(à vérifier endpoint test API sinon en créer un)**.
- **I7** Secrets projet saisie aveugle : `projects.$projectId.secrets.tsx:145` (`type="password"` sans reveal ni mono ; pas de copy) **(à vérifier rendu lignes)**. → reveal œil + `IBM Plex Mono` + trim au collage ; copy par ligne (toast « Copied ») masqué par défaut.
- **I8** `chat/connector-cards/SecretRequestCard.tsx:128-136` : inputs secrets nus (`type={field.type}`), sans reveal/mono/trim. → pattern C15 ; conserver validation required (:73-78).

## C. Imports : ne pas perdre les fichiers
- **I9** Clone Git jette .py/.go/.rs/.sql : `chat/GitCloneButton.tsx:92-96` (allowlist `txt|md|astro|mjs|js|jsx|ts|tsx|json|html|css|scss|less|yml|yaml|xml|svg|vue|svelte` → repo Python/Go/Rust/Java perd tout). `isBinaryFile` (détection par contenu) existe (ImportFolderButton/fileUtils). → remplacer allowlist par détection contenu ; garder caps MAX_FILE_SIZE/MAX_TOTAL_SIZE ; **(à vérifier `GitUrlImport.client.tsx:73-99` même bug — corriger au point partagé)**.
- **I10** Import ZIP ni cap ni progression : `routes/import-zip.tsx:50-51` (seule garde = vide) ; `<Form>` :79 poste sans feedback. → cap client (~100 Mo aligné serveur **(à vérifier)**) + message immédiat ; fetcher + « Importing… » disabled + progress.
- **I11** Downgrade à l'aveugle : `routes/downgrade.tsx:69-93` (select + « Schedule change » sans prix/pertes/date ; `reloadDocument`). → symétrie G20 : delta prix, « ce que vous perdez » (source pricing partagée), « takes effect at the end of the current billing cycle » ; fetcher.

## D. Chat & IDE
- **I12** Éditer message invisible au tactile : `chat/UserMessage.tsx:39` (`opacity-0 group-hover:opacity-100`). → `COARSE_POINTER_QUERY` (`sidebar/HistoryItem.tsx:17`) : visible permanent sur pointeur grossier, hover-reveal souris, focus-visible.
- **I13** Dictée absente au 1er prompt : `chat/ChatBox.tsx:552-553` (`SpeechRecognitionButton` seulement si `projectIdeMode`). → afficher aussi hors IDE (gardes G30) ou documenter le choix.
- **I14** Carrousels splash preview sans garde : `workbench/Preview.tsx:2688-2693` + `:2949-2952` (`setInterval` inconditionnels, `prefers-reduced-motion` ignoré ; conteneur `role="status" aria-live="polite"` :2698 = spam SR). → geler sous reduced-motion (matchMedia E1) + pause hover ; retirer `aria-live` (annoncer une fois « Preparing preview… ») ; dots existent :2747.
- **I15** Preview états vides `<p>` nus : `workbench/Preview.tsx:2618` (« No preview navigations captured yet »). → EmptyState C7 compact (hint « Navigate in the preview to record entries »).
- **I16** Debug tools dans header IDE : `header/HeaderActionButtons.client.tsx:32-55` (« Report Bug » + « Download Debug Log » permanents). → déplacer dans menu Help (ou palette ⌘K) ; header réservé Deploy ; accès direct derrière flag staff si utile.

## E. Control Panel @settings
- **I17** « Task Manager » menteur : `tabs/task-manager/TaskManagerTab.tsx:15-31` (liste clés localStorage + clear 2 clés hardcodées ; héritage bolt.diy). → renommer « Local data » + fusionner DataTab, ou retirer ; si gardé : « Remove » par entrée + confirm, pas de liste hardcodée.
- **I18** Onglet « Update » self-hosted dans SaaS : `tabs/update/UpdateTab.tsx:37-50` (POST `/api/update` diff branche `main`). **(à vérifier endpoint existe côté worker)** → retirer du SaaS (`constants.tsx:151`) ; si desktop, gater sur bridge Electron (H25).
- **I19** Réglages éditeur inaccessibles : `routes/workspace-settings.tsx` rend `WorkspaceSettings` (editorSettingsStore) mais aucun lien entrant (grep `/workspace-settings`=0) ; pas d'onglet Editor. → onglet « Editor » du Control Panel (monter le composant) + entrée ⌘K « Editor settings » ; route devient alias/redirect. Recouper H23.

## F. Routes & contenus
- **I20** /explore brochure alors que l'API existe : `routes/explore.tsx:1-6` statique mais `api.explore.projects.ts` existe. → vraie galerie (grille projets publics, recherche+tags C10/E5, EmptyState C7) sur l'API ; sinon retirer de la nav (recouper G27).
- **I21** /docs pointe une brochure, walkthrough existe : nav Resources+footer → `/docs` (`EcodeExactShell.tsx:135,178`) rend `MarketingStaticPage` (`docs.tsx:1-8`) ; `components/docs/AgentWalkthrough.tsx` (600+ lignes) sans consommateur **(à vérifier import ailleurs)**. → intégrer AgentWalkthrough dans /docs ou pointer nav vers /help-center réel.
- **I22** Empty states user-area `<p>` nus : `invoices.tsx:149`, `api-keys.tsx:220` (C7 unifié, F30 sur panneaux IDE, routes AppShell restées en `<p>`). → EmptyState C7 (icône+titre+hint+CTA « Create key ») ; grep `No .* yet` autres routes AppShell.
- **I23** Invitations org : resend + expiration manquants : `organization-invitations.tsx` (révocation :263 + `expiresAt` présents, mais pas Resend ni badge Expired ; E12 « à vérifier »). → Resend (throttle 1/min) + badge Expired (tokens via I1) si `expiresAt<now` ; expirées en bas. PAR-DESSUS l'existant.
- **I24** Pricing toggle labels non interactifs : `pages/Pricing.tsx:455-470` (« Monthly »/« Yearly » `<span>` décoratifs). → labels cliquables (label/onClick → Switch) + `aria-label` (« Billing period: yearly ») ; visuel inchangé.
- **I25** Support tickets sans fil : `routes/support.tsx:191-209` (lignes statiques non cliquables ; pas de `support.$id`). → page/panneau détail (fil messages, réponse) **(à vérifier endpoint messages ticket ; sinon mailto avec réf)**. Recouper E18.
- **I26** Login champ MFA affiché pour tous : `routes/login.tsx:417-430` (« MFA or recovery code » permanent, required seulement si `mfaRequired`). → flux progressif : email+mdp d'abord ; champ code après `AUTH_MFA_REQUIRED` (:424) avec focus ; garder `autocomplete="one-time-code"`.
- **I27** `settings.$tab.tsx:20` : `onClose={() => navigate('/')}` (même défaut que H22). → même fix (`navigate(-1)` fallback /dashboard) ; helper partagé pour les deux routes.
- **I28** `/github-import` (brochure) vs `/import-github` (réel) : `import-github.tsx` = vrai flux (lié dashboard_.templates.tsx:94, :110) ; `github-import.tsx` = brochure surface (H24). → `github-import` → redirect 301 `/import-github` ; purger du catalogue surface.
- **I29** Cibles concrètes pour les 5 surfaces H24 : `user/settings`→`/account-settings` (twin déjà déclaré pour slug `account`), `editor/new`→`/projects/new`, `github-import`→`/import-github` (I28), `teams/new`→dialog G23, `ai-agent/studio`→`/ai-agent`. → implémenter H24 avec CES cibles (redirects) ; supprimer les défs correspondantes d'EcodeSurfacePages.
- **I30** `routes/$slug.tsx:14-16` : `SURFACE_AUTHED_TWINS` ne contient que `account → /account-settings` (« Extend as more twins surface ») ; autres slugs surface renvoient la brochure même connecté. → étendre avec cibles I29 (min settings/projects/editor) ; test unitaire listant les slugs surface SANS twin.

## Vérification Batch 8
1. `pnpm lint && test && typecheck`.
2. Captures clair+sombre 1440/768/390 (compléter DESIGN_CAPTURES) : bannières avant/après 3 routes (I2), badges support/domains/siem (I1/I3), rollback confirm (I5), SIEM test event (I6), secrets + SecretRequestCard (I7/I8), clone repo Python (I9), import zip (I10), /downgrade (I11), édition message tactile (I12), composer landing micro (I13), splash reduced-motion (I14), overlay logs vide (I15), header sans debug (I16), Control Panel Local data+Editor sans Update (I17–I19), /explore réel (I20), /docs walkthrough (I21), empty states invoices/api-keys (I22), invitations Resend/Expired (I23), toggle pricing (I24), fil ticket (I25), login sans/avec MFA (I26), fermeture settings (I27), redirects surface (I28–I30).
3. Greps de clôture : `red-500|green-500|amber-500` dans `app/routes/**`=0 hors tokens (I2) ; `toLocaleString()` app/=0 hors utils (I4) ; `match(/\.(txt|md`=0 dans GitCloneButton (I9) ; `getEcodeStandaloneSurfacePage`=0 consommateur route (I28–I29) ; `navigate('/')` routes settings=0 (I27).
4. Parcours : cloner repo Go → tous les .go présents (I9) ; login sans MFA → jamais de champ code ; avec MFA → champ apparaît + focus (I26) ; « Send test event » SIEM → statut HTTP affiché (I6).
5. Lecteur d'écran : splash n'annonce plus chaque slide (I14) ; AlertBanner annoncent une fois (role=alert/status, I2).
