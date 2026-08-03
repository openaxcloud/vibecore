# Batch 6 — G1–G30 : SPEC OFFICIELLE (validation du commanditaire, source de vérité)

> Sauvegardé ici car le spec n'était pas dans le repo. À implémenter ET vérifier point par point (pas de « oui » sans preuve grep/capture). Un commit par point.

Règles : tokens obligatoires, orange = marque / bleu = action (--vc-ide-accent-action), états → --status-*, gris → bolt-elements-*. Le violet n'existe NULLE PART dans la charte. Zéro changement visuel hors périmètre.

Ordre conseillé : G6, G5, G1, G2, G3, G4, G18, G19, G7, G8, G9, G10, G11, G12, G13–G16, G17, G20–G30.

## A. Purge thème hérité (violet + gris)
- **G1** — Primitives ui/ encore violettes : `ui/Dialog.tsx:28` (DialogButton primaire bg-purple-500), `ui/Checkbox.tsx:16-19` (coché+ring violets), `ui/Badge.tsx:16` (primary violette), `ui/TabsWithSlider.tsx:95,111` (slider actif purple), `ui/StatusIndicator.tsx:20` (loading violet), `ui/SearchResultItem.tsx:31,42,87`, `ui/CodeBlock.tsx:98` (surlignage), `ui/GradientCard.tsx:7-14,75` (dégradés purple/pink), `ui/RepositoryStats.tsx:32-48`. → interactif/actif = --vc-ide-accent-action, focus = --vc-ide-ring, loading = accent-action ou textTertiary, dégradés décoratifs = supprimer ou depth-3. Aucune API changée.
- **G2** — Tiroir historique de chats hors-thème : `sidebar/Menu.client.tsx:369-589` + `sidebar/HistoryItem.tsx:139-258` (bg-white/dark:bg-gray-950, gray-*, CTA nouveau chat violet :429, toggle sélection :439-440, search ring :452, dialogs Delete gris :516-528/547-566, rename ring HistoryItem:160). → tokens bolt-elements-*, accents bleu, rings --vc-ide-ring. + supprimer ~15 console.log debug (:127,155,159,254,260,345,501,535,578…).
- **G3** — Control Panel @settings violet+gris+hex : core (`ControlPanel.tsx:54-55,288-315`, `TabTile.tsx:62-132`, `AvatarDropdown.tsx:89-170`, `TabPanelBoundary.tsx:66-67`) + tabs (`SettingsTab:206-327`, `ProfileTab:101-192`, `NotificationsTab:95-237`, `EventLogsTab:235-1014` + dark:bg-[#1a1a1a]:869, `FeaturesTab:92-282`, `ConnectionsTab:78`, `providers/cloud/CloudProvidersTab:150-296`, `providers/local/*` SetupGuide/ProviderCard/ModelCard/LocalProvidersTab, `update/UpdateTab:113,148`, `task-manager/TaskManagerTab:43`). Grep `purple-|gray-[0-9]|#1a1a1a|bg-white` scoppé @settings/** → tokens. 2 commits max (core, tabs). Captures avant/après clair+sombre.
- **G4** — Restes violets chat : `chat/APIKeyManager.tsx:183` (Save), `chat/ModelSelector.tsx:729` (option active), `:903` (icône Free model), `chat/StarterTemplates.tsx:16-19` (focus+hover). → bleu action, focus --vc-ide-ring.

## B. Dialogues & langue
- **G5** — window.confirm/prompt natifs → ui/Dialog (13 sites) : `BaseChat.tsx:5600,9082-9087,10148,13360,13374,13511,17494`, `ConversationBranchesMenu.tsx:172,200`, `deploy/GitHubDeploymentDialog.tsx:259`, `GitLabDeploymentDialog.tsx:150`, `@settings/.../LocalProvidersTab.tsx:283`, `routes/connected-accounts.tsx:500`. → helper ConfirmDialog (CTA destructif --status-error-text) + InputDialog ; confirmThenSubmit(:9082) = point d'entrée unique. Destructif = rouge, jamais bleu.
- **G6** — Chaînes FR dans UI EN : `BaseChat.tsx:5596,5600,7068`. Traduire EN. grep `[àéèêç]` sur app/**/*.tsx = 0.

## C. Composer / agent
- **G7** — Pièces jointes image sans limite : `BaseChat.tsx:5306,5334`. Cap 5 Mo/fichier + downscale canvas (max 2048px, JPEG q0.85), cap 4 images/msg, toast erreur explicite, compteur dans FilePreview.
- **G8** — Brouillon composer perdu au reload : `Chat.client.tsx:495-504`, `ChatBox.tsx:390`. sessionStorage['ecode:composer-draft:<projectId>'] save debounce 300ms, restore au mount si vide, clear au send, try/catch.
- **G9** — Clés API en aveugle : `chat/APIKeyManager.tsx:134` (password sans reveal). Appliquer pattern œil de C15 : toggle reveal, IBM Plex Mono, trim() au collage, autocomplete="off".
- **G10** — Feedback 👍/👎 jamais transmis : `chat/AssistantMessage.tsx:804-839` (localStorage only). POST fire-and-forget vers usage/feedback (créer endpoint minimal si absent), garder écho localStorage.

## D. IDE
- **G11** — Layout panneaux non persisté : pas d'autoSaveId sur PanelGroup (`BaseChat.tsx:6798,9227,9440,9867`, `EditorPanel.tsx:325,337,339`). Ajouter autoSaveId="ecode:panels:<zone>". Pas de flash au 1er paint.
- **G12** — 3 systèmes de tooltips : title natif (toolbar Preview `Preview.tsx:1855-1981`), data-vc-tooltip, WithTooltip ; `ui/IconButton.tsx:12-13` expose les deux. Standard = data-vc-tooltip/GlobalTooltip ; IconButton.title → data-vc-tooltip + aria-label (plus de title natif) ; migrer toolbar Preview.

## E. Database Studio
- **G13** — SQL destructif sans garde : `database/DatabaseStudio.tsx:181-187` + select connexion :196-207. Regex `^\s*(drop|truncate|alter)\b` + delete/update sans where → ConfirmDialog (G5) avec écho statement + nom connexion ; badge « Prod » --errbg/--status-error-text.
- **G14** — Pas d'historique requêtes : state sql `:145`. MRU localStorage['ecode:db-history:<projectId>'] (cap 20, dédup), dropdown History.
- **G15** — Cellules tronquées : `:341` max-w-[280px] truncate. Clic cellule → popover valeur complète (mono, wrap) + Copy ; Échap/blur ferme.
- **G16** — États vides/erreur hors-pattern : `:230-233` <p>, erreur `:190` texte brut. → ui/EmptyState (C7 compact) ; erreurs --errbg + --status-error-text (C12).

## F. Toasts & statuts
- **G17** — use-toast loading auto-ferme : `ui/use-toast.ts:11` (autoClose:3000), position bottom-right codée en dur `:27`. → loading autoClose:false + helper resolveToast(id,ok,message) ; retirer position codée en dur.
- **G18** — Orange de marque dans routes app (échappé à B4) : `usage.tsx:136,146` (icônes+barres quota, recouper C9), `billing.tsx:605,620`, `projects.$projectId.deployments.tsx:442,478`, `projects.$projectId.database.tsx:273`, `upgrade.tsx:122` (→ --status-success-text). Marketing légitime reste orange : `templates_.languages.tsx:52,86`, `licensing.tsx:43`. grep `ecode-accent` dans app/routes/**.
- **G19** — Badges statut admin orange : `admin.oauth-providers.tsx:291,470`, `admin.stripe.tsx:163`. Actif/sain → --status-success-*, inactif → neutre textTertiary.

## G. Flux orphelins & finitions
- **G20** — Upgrade checkout à l'aveugle : `upgrade.tsx:104-126` (pas de prix). Afficher plan courant→cible avec prix/interval, ligne proration « You'll be charged $X today, then $Y/mo », CTA bleu.
- **G21** — Notifications feed réel mais pas de cloche : `routes/notifications.tsx:131-142` + `SaaSLayout.tsx:281,1703`. Cloche TopBar : badge count (99+ cap), popover 5 dernières + View all, aria-label. Réutiliser loader existant, pas de polling neuf.
- **G22** — /onboarding checklist inerte : `routes/onboarding.tsx:10-33`. Chaque étape → lien réel (/projects/new,/invitations,/connected-accounts,/usage) + état fait dérivé (logique B2) ; OU rediriger /onboarding→/dashboard. Trancher.
- **G23** — New organization cul-de-sac : `routes/organization-switcher.tsx:22` (→/onboarding). Dialog New organization (nom+slug) → POST orgs → redirect ; sinon retirer le CTA.
- **G24** — /search ne cherche pas : `routes/search.tsx:5` (brochure statique). Vraie recherche client : `help-search.ts:21` (filterHelpTopics) + templates (E5) + pages marketing ; résultats groupés (Docs/Templates/Pages), vide → EmptyState C7, URL ?q=.
- **G25** — Contact mailto direct : `pages/Contact.tsx:24-46`. Aligner sur ContactSales (`:65`)/ReportAbuse (`:70`) : POST d'abord, fallback mailto ; erreurs inline E30 ; confirmation.
- **G26** — Profils publics /u/:username brochure générique : `routes/u.$username.tsx:18-43`, `profile.$username.tsx:11`. Si endpoint projets publics existe → vrai profil (avatar, bio, grille) ; sinon 404 propre.
- **G27** — Nav Marketplace → brochure : `EcodeExactShell.tsx:144,182` vers /marketplace statique ; `marketplace.templates.tsx:1` a déjà la vraie galerie. Pointer nav → /templates (ou /marketplace alias 302).
- **G28** — Hero auth image Unsplash hotlinkée : `auth/AuthScreen.tsx:8`. Remplacer par asset local optimisé (public/assets/) ou panneau tokens. grep `unsplash|pexels|picsum` global.
- **G29** — Pages lien partagé erreurs brutes : `routes/share.$token.tsx:67-72`, `projects.share.$token.tsx:67-73`. Habiller PublicShell : titre, message, CTA Back to homepage/Open E-Code, tokens statuts.
- **G30** — Dictée vocale support/permission non gérés : `chat/SpeechRecognition.tsx` + `BaseChat.tsx:5291`. API absente → masquer bouton ; not-allowed → toast « Microphone access denied » + état repos.

## Vérification du batch (obligatoire avant de dire « fait »)
1. `pnpm run lint && pnpm run test && pnpm run typecheck`.
2. Captures clair+sombre 1440/768/390 des surfaces touchées.
3. grep `purple-` dans app/** = 0 (hors FileIcon.tsx types de fichiers).
4. grep `window.confirm|window.prompt` = 0.
5. grep `ecode-accent` dans app/routes/** = marketing seulement ; `[àéèêç]` dans .tsx = 0.
6. Reload IDE : tailles panneaux conservées (G11) ; brouillon restauré (G8) ; loading toast persistant (G17).
