import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export type ProjectUserAreaLanguage = 'en' | 'fr';

type LocalizedShape<Value> = Value extends string
  ? string
  : Value extends readonly (infer Item)[]
    ? readonly LocalizedShape<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: LocalizedShape<Value[Key]> }
      : Value;

export const projectUserAreaEn = {
  projectUserArea: {
    creation: {
      metaTitle: 'Create project - E-Code',
      shell: {
        title: 'Create project',
        description: 'Describe your idea. E-Code creates a real workspace and opens the IDE.',
      },
      heroTitle: 'What do you want to build?',
      formAria: 'Create project form',
      artifacts: {
        web: {
          label: 'Web',
          prompts: [
            'Build a SaaS dashboard with billing, admin pages, and project analytics',
            'Create a polished portfolio with case studies, blog posts, and contact forms',
            'Build an ecommerce storefront with filters, cart, checkout, and order tracking',
            'Create a booking site with a calendar, availability, and confirmation emails',
            'Build a help center with searchable articles, categories, and a ticket form',
            'Create a job board with listings, filters, applications, and an employer portal',
          ],
        },
        mobile: {
          label: 'Mobile',
          prompts: [
            'Build a responsive habit tracker with streaks, reminders, and mobile navigation',
            'Create a fitness PWA with workout logs, charts, and offline support',
            'Build a recipe app with saved meals, shopping lists, and mobile-first cards',
            'Create a budgeting app with accounts, categories, and monthly summaries',
            'Build a travel planner with itineraries, maps, and packing checklists',
            'Create a meditation app with timers, streaks, and a daily session picker',
          ],
        },
        slides: {
          label: 'Slides',
          prompts: [
            'Create a startup pitch deck with market, product, traction, and financial slides',
            'Build a technical presentation with code examples and speaker notes',
            'Create an investor update deck with charts, timeline, and next milestones',
            'Build a product launch deck with positioning, demo shots, and pricing tiers',
            'Create a quarterly business review deck with KPIs, wins, and risks',
            'Build a conference talk deck with an agenda, live-demo slides, and a summary',
          ],
        },
        animation: {
          label: 'Animation',
          prompts: [
            'Build an interactive particle animation playground with exportable presets',
            'Create a scroll animation showcase with reveal effects and timeline controls',
            'Build a motion landing page with subtle transitions and responsive sections',
            'Create an animated data-story page with charts that build in on scroll',
            'Build a loading/skeleton animation gallery with copyable snippets',
            'Create an SVG path-drawing animation demo with playback controls',
          ],
        },
        design: {
          label: 'Design',
          prompts: [
            'Create a design system page with tokens, components, and usage examples',
            'Build a color palette generator with contrast checks and export tools',
            'Create a brand kit generator with logos, typography, and social previews',
            'Build a typography scale explorer with pairings and live preview text',
            'Create a gradient and shadow studio with copyable CSS output',
            'Build an icon set browser with search, sizing, and SVG export',
          ],
        },
        data: {
          label: 'Data Viz',
          prompts: [
            'Build a real-time analytics dashboard with charts, filters, and alerts',
            'Create a finance dashboard with category breakdowns and forecast charts',
            'Build a product metrics dashboard with funnels, cohorts, and retention graphs',
            'Create a sales pipeline dashboard with stages, forecasts, and win rates',
            'Build a server monitoring dashboard with time-series charts and thresholds',
            'Create a survey results explorer with breakdowns, filters, and CSV export',
          ],
        },
        automation: {
          label: 'Automation',
          prompts: [
            'Build an automation console for scheduled jobs, logs, retries, and alerts',
            'Create a file processing workflow with uploads, validation, and status tracking',
            'Build an email digest generator with settings, previews, and history',
            'Create a webhook inspector with request logs, replay, and filtering',
            'Build a data-sync monitor with connectors, run history, and error triage',
            'Create an approval workflow with steps, assignees, and an audit trail',
          ],
        },
        game: {
          label: '3D Game',
          prompts: [
            'Build a Three.js racing prototype with controls, checkpoints, and lap timing',
            'Create a tower defense game with waves, upgrades, and a scoreboard',
            'Build a 3D product configurator with lighting, camera controls, and presets',
            'Create an endless runner with obstacles, power-ups, and a high-score board',
            'Build a physics puzzle game with draggable objects and level progression',
            'Create a 3D solar-system explorer with orbit controls and planet facts',
          ],
        },
        document: {
          label: 'Document',
          prompts: [
            'Build a markdown editor with live preview, file tree, and export controls',
            'Create a resume builder with templates, sections, and PDF export',
            'Build a collaborative notes app with tags, comments, and version history',
            'Create an invoice generator with line items, totals, and PDF export',
            'Build a knowledge base editor with nested pages, search, and backlinks',
            'Create a contract editor with clause templates, variables, and preview',
          ],
        },
        spreadsheet: {
          label: 'Spreadsheet',
          prompts: [
            'Build a budget spreadsheet with formulas, charts, and CSV import',
            'Create an inventory table with filters, bulk edit, and stock alerts',
            'Build a project timeline grid with milestones, owners, and progress views',
            'Create an expense tracker grid with categories, receipts, and monthly totals',
            'Build a CRM contacts grid with tags, filters, and inline editing',
            'Create a grading sheet with weighted columns, averages, and CSV export',
          ],
        },
      },
      placeholders: ['Build a SaaS dashboard with…', 'Create a portfolio with…', 'Generate an e-commerce store with…'],
      attachments: {
        archive: {
          label: 'Attach',
          hint: 'Upload a zip archive (code, screenshots, images)',
        },
        github: {
          label: 'GitHub repo URL',
          hint: 'Import an existing GitHub repository',
        },
        design: {
          label: 'Design palette',
          hint: 'Drop a Figma export or design screenshots inside a zip archive',
        },
        import: {
          label: 'All import sources',
          hint: 'Import from GitHub, Bitbucket, ZIP, a spreadsheet, a builder export, or start empty',
        },
      },
      prompt: {
        inputAria: 'Describe your idea',
        attachAria: 'Attach context',
        createAria: 'Create project',
        create: 'Create',
        unlock: 'Write a few sentences to unlock Create.',
        shortcutHint: 'Press {shortcut} to send.',
        keepGoing_one: '{count} word — keep going.',
        keepGoing_other: '{count} words — keep going.',
        summary_one: '{count} word · {characters}/{maximum} chars',
        summary_other: '{count} words · {characters}/{maximum} chars',
        estimateTitle: 'Estimate: ~{tokens} input tokens',
        estimateOnlyTitle: 'Token estimate only.',
        tokens: '~{tokens} tokens',
        inputCost: '~{cost} input',
        pricingUnknown: 'pricing unknown',
        costLessThan: '<{amount}',
      },
      validation: {
        empty: 'Describe the project you want to create.',
        tooShort: 'Add a bit more detail — at least {minimum} words help the agent build the right thing.',
        tooLong: 'Trim your prompt — keep it under {maximum} characters (you have {characters}).',
        tooManyLines:
          'Too many lines ({lines}). Keep the brief under {maximum} lines; paste long docs into the project instead.',
        nonPrintable: 'Removed invisible or control characters from your prompt.',
        injection:
          "Your prompt contains phrases agents use to bypass safety — if that's intentional, fine; otherwise rephrase.",
      },
      advanced: {
        title: 'Advanced options',
        contextAria: 'Generation context',
        artifact: 'Artifact',
        artifactAria: 'Artifact type',
        examplesAria: 'Example prompts',
        tryExample: 'Try an example',
        refreshAria: 'Refresh example prompts',
      },
      templates: {
        aria: 'Production templates',
        eyebrow: 'Templates',
        title: 'Start from the existing catalog',
        description: 'Choose a curated starter and customize it with the agent.',
      },
      actions: {
        logIn: 'Log in',
        retry: 'Retry',
        tryAgain: 'Try again',
        viewBilling: 'View billing',
        backHomepage: 'Back to homepage',
        backDashboard: 'Back to dashboard',
      },
      errors: {
        projectQuota:
          'Your workspace has reached its project limit. Upgrade the plan or ask an admin for a quota override before creating another project.',
        projectNameRequired: 'Project name is required',
        aiGenerationFailed:
          'Project creation could not be confirmed, so no empty fallback was created. Your prompt is still here—try again.',
        promptQueueFailed: 'Unable to queue the initial prompt',
        modelsLoadFailed: 'The available AI models could not be loaded. Please try again.',
        shellAuth: 'Sign in to create a project.',
        shellQuota: 'Project quota reached.',
        shellUnavailable: 'Project creation is temporarily unavailable.',
        descriptors: {
          auth: {
            title: 'Sign in to create a project',
            subtitle:
              'E-Code needs your authenticated workspace and configured AI providers before it can create a real project.',
          },
          network: {
            title: 'Connection issue',
            subtitle:
              "We couldn't reach the project service. Check your connection and retry — you don't need to sign in again.",
          },
          quota: {
            title: 'Project quota reached',
            subtitle:
              'This workspace has reached its current project limit. Upgrade the plan or ask an admin for a quota override.',
          },
          server: {
            title: 'Project service is having a moment',
            subtitle: 'Our project service returned an error. Try again in a few seconds — your inputs are not lost.',
          },
          unknown: {
            title: 'Project creation is unavailable',
            subtitle: 'Something prevented us from loading project creation. Try again, or head back to the homepage.',
          },
        },
      },
      moderation: {
        rejected: 'Your prompt was flagged for {categories} and cannot be used. Rephrase and try again.',
        categories: {
          sexual: 'sexual content',
          'sexual/minors': 'sexual content involving minors',
          hate: 'hateful content',
          'hate/threatening': 'threatening hateful content',
          harassment: 'harassment',
          'harassment/threatening': 'threatening harassment',
          'self-harm': 'self-harm content',
          'self-harm/intent': 'self-harm intent',
          'self-harm/instructions': 'self-harm instructions',
          violence: 'violent content',
          'violence/graphic': 'graphic violence',
          illicit: 'illicit activity',
          'illicit/violent': 'violent illicit activity',
        },
      },
      defaultProjectName: 'AI project',
    },
    deployments: {
      metaTitle: 'Project deployments - E-Code',
      shell: {
        title: 'Deployments',
        description:
          'Ship preview, staging and production releases with scoped secrets, quota checks and redacted logs.',
      },
      navigation: {
        aria: 'Deployment views',
        overview: 'Overview',
        logs: 'Logs',
        domains: 'Domains',
        manage: 'Manage',
      },
      actions: {
        republish: 'Republish',
        adjustSettings: 'Adjust settings',
        copyLink: 'Copy deployment link',
        securitySoon: 'Security scanning is coming soon',
        securityScan: 'Run security scan',
        open: 'Open',
        redeploy: 'Redeploy',
        rollback: 'Rollback',
        cancel: 'Cancel',
      },
      production: 'Production',
      access: {
        title: 'Deployment access',
        description:
          'Choose who can open the dedicated deployment origin. Every change creates an immutable policy revision and immediately invalidates older access proofs.',
        label: 'Who can access',
        noDeployment: 'Publish a deployment before configuring its access policy.',
        version: 'Policy v{version}',
        password: 'Deployment password',
        passwordPlaceholder: 'At least 10 characters',
        rotation: 'Changing mode or password rotates the policy and its active sessions.',
        adminOnly: 'Only workspace owners and admins can change this policy.',
        locked:
          'The pinned policy could not be verified. Access is locked to invitation-only until an owner or admin saves a valid policy.',
        save: 'Save access policy',
        saving: 'Saving…',
        saved: 'Deployment access policy saved.',
        modes: {
          public: { label: 'Public', description: 'Anyone with the URL can open the deployment.' },
          password: { label: 'Password protected', description: 'Visitors enter one deployment-specific password.' },
          workspace: { label: 'Workspace only', description: 'Any active member of this workspace can open it.' },
          invite: {
            label: 'Invitation only',
            description: 'Owners, admins and explicitly granted collaborators only.',
          },
        },
      },
      publish: {
        title: 'Publish',
        detecting: 'Detecting how your app should deploy…',
        detectionFailed: 'Could not detect how this app should deploy.',
        redetect: 'Re-detect',
        detected: 'Detected:',
        serverMode: 'autoscale deployment',
        reservedMode: 'Reserved VM deployment',
        staticMode: 'static deployment',
        overridden: '(overridden)',
        serverDescription:
          'Runs your app as a managed HTTP service on a durable runtime. Build and start command are auto-detected; your project secrets (including the database URL) are injected automatically.',
        reservedDescription:
          'Runs one always-on managed VM with persistent storage. It keeps the same project, URL and data when you change Reserved VM tiers.',
        staticDescription: 'Builds your app and serves the output as a fast static site at a public URL.',
        environment: 'Environment',
        customDomain: 'Custom domain',
        machineSize: 'Machine size',
        hourlyActive: '{amount}/h active',
        upgradePlan: '(upgrade plan)',
        unavailable: '(unavailable)',
        billing:
          'Billed only while your app is running — it sleeps automatically after 15 min without traffic and wakes on the next request. Rate card v{version}.',
        rateCardLoading: 'Loading current compute pricing and availability…',
        rateCardUnavailable:
          'Compute pricing is temporarily unavailable. Server publishing is disabled to prevent an unpriced deployment.',
        retryRateCard: 'Retry pricing',
        reservedVm: {
          title: 'Reserved VM',
          available: 'Available on your plan',
          description: 'Always on · persistent storage · one fixed monthly price',
          tierLegend: 'Choose a Reserved VM tier',
          sharedTier: 'Shared capacity',
          dedicatedTier: 'Dedicated · {cpu} vCPU',
          tierUnavailable: 'Unavailable for the current plan or cluster capacity',
          cpuMemory: '{cpu} vCPU · {memory} GB RAM',
          monthly: '{amount}/month',
          confirmation:
            'I confirm this Reserved VM reservation at {amount}/month. Billing starts when provisioning succeeds.',
          confirmationHint:
            'Changing the tier keeps this project’s URL and persistent data. The new monthly price must be confirmed again.',
          paidPlanRequired: 'Reserved VM requires an active paid plan.',
          operatorUnavailable: 'Reserved VM is not enabled for this cluster. No reservation or charge will be created.',
          pricingInvalid: 'Reserved VM pricing could not be verified. Reload pricing before creating a reservation.',
          upgrade: 'View paid plans',
        },
        environmentVariables: 'Environment variables',
        environmentPlaceholder: 'PUBLIC_API_URL=https://api.example.com\nFEATURE_FLAG=on',
        advanced: 'Advanced — override the deploy mode',
        modeAuto: 'Auto (recommended) — use the detected mode',
        modeServer: 'Autoscale — sleeps when idle',
        modeReservedVm: 'Reserved VM — always on with persistent storage',
        modeStatic: 'Static — built output, no server',
        publishing: 'Publishing…',
        submit: 'Publish',
      },
      runtime: {
        title: 'Runtime settings',
        description:
          'Change this deployment in place. Its project, public URL and persistent data stay attached to the same deployment.',
        current: 'Current: {runtime} · configuration v{version}',
        modeLegend: 'Runtime type',
        autoscale: 'Autoscale',
        reservedVm: 'Reserved VM',
        versionUnavailable:
          'The runtime configuration version is unavailable. Refresh before changing compute to prevent overwriting a newer change.',
        recovery:
          'If provisioning fails, the current runtime stays active or is restored. Refresh this page before retrying a version conflict.',
        unchanged: 'Choose a different runtime type, machine size or Reserved VM tier to save a change.',
        save: 'Apply runtime change',
        saving: 'Applying change…',
      },
      environments: {
        preview: 'Preview',
        staging: 'Staging',
        production: 'Production',
      },
      logs: {
        title: 'Build & deploy logs',
        building: 'Building…',
        failed: 'Failed',
        deployed: 'Deployed',
        starting: 'Starting the build…',
        empty: 'No logs yet — click Deploy project to build and publish.',
        redacted: 'Redacted deployment logs',
        noLogs: 'No logs yet',
        line_one: '{count} line',
        line_other: '{count} lines',
      },
      domains: {
        title: 'Domains',
        noUrl: 'No live URL yet — publish first.',
        guidance:
          "Add a custom domain in the Overview wizard. After publishing, point your domain's DNS (CNAME) at the deployment; managed TLS for custom domains is coming soon.",
      },
      history: {
        title: 'Deployment history',
        description: 'Redeploy, cancel or rollback without leaving the project.',
        emptyTitle: 'No deployments yet',
        emptyDescription: 'Use the Overview wizard to create the first preview or production release.',
      },
      row: {
        rollbackBadge: 'rollback',
        rollbackTitle: 'Created by rolling back to deployment {deploymentId}',
        durationTitle: 'Build duration',
        deployedPrefix: 'deployed',
        urlPending: 'URL pending',
      },
      confirmations: {
        rollback: {
          title: 'Roll back to this deployment?',
          description:
            'This changes what is currently served: the selected build is re-published as a new deployment and an audit event is recorded.',
          confirm: 'Roll back',
        },
        cancel: {
          title: 'Cancel this deployment?',
          description: 'The in-progress build stops and the deployment is marked as canceled.',
          confirm: 'Cancel deployment',
        },
      },
      statuses: {
        ready: 'Ready',
        failed: 'Failed',
        canceled: 'Canceled',
        queued: 'Queued',
        building: 'Building',
        pending: 'Pending',
        deploying: 'Deploying',
        unknown: 'Unknown',
      },
      errors: {
        projectNotFound: 'Project not found',
        detectionUnavailable: 'Detection is unavailable right now — open the workspace and retry.',
        startFailed: 'Failed to start deployment',
        cancelFailed: 'Failed to cancel deployment',
        redeployFailed: 'Failed to redeploy',
        rollbackFailed: 'Failed to roll back',
        accessFailed: 'Failed to update deployment access',
        reservedConfirmationRequired: 'Confirm the Reserved VM monthly price before publishing.',
        reservedPricingInvalid: 'Reserved VM pricing or terms are invalid. Reload pricing and try again.',
        runtimeChangeInvalid: 'The runtime change is incomplete or stale. Refresh and try again.',
        runtimeChangeFailed: 'Failed to change deployment runtime',
      },
    },
  },
} as const;

export const projectUserAreaFr = {
  projectUserArea: {
    creation: {
      metaTitle: 'Créer un projet - E-Code',
      shell: {
        title: 'Créer un projet',
        description: 'Décrivez votre idée. E-Code crée un véritable espace de travail et ouvre l’IDE.',
      },
      heroTitle: 'Que souhaitez-vous créer ?',
      formAria: 'Formulaire de création de projet',
      artifacts: {
        web: {
          label: 'Web',
          prompts: [
            'Créez un tableau de bord SaaS avec facturation, pages d’administration et analyses de projet',
            'Créez un portfolio soigné avec études de cas, articles de blog et formulaires de contact',
            'Créez une boutique en ligne avec filtres, panier, paiement et suivi des commandes',
            'Créez un site de réservation avec calendrier, disponibilités et e-mails de confirmation',
            'Créez un centre d’aide avec recherche, catégories d’articles et formulaire de demande',
            'Créez un site d’emploi avec offres, filtres, candidatures et portail employeur',
          ],
        },
        mobile: {
          label: 'Mobile',
          prompts: [
            'Créez un suivi d’habitudes responsive avec séries, rappels et navigation mobile',
            'Créez une PWA de fitness avec journal d’entraînement, graphiques et mode hors ligne',
            'Créez une application de recettes avec repas favoris, listes de courses et cartes pensées pour mobile',
            'Créez une application de gestion budgétaire avec comptes, catégories et bilans mensuels',
            'Créez un planificateur de voyage avec itinéraires, cartes et listes de bagages',
            'Créez une application de méditation avec minuteurs, séries et sélection de la séance du jour',
          ],
        },
        slides: {
          label: 'Présentation',
          prompts: [
            'Créez un pitch deck de startup avec marché, produit, traction et projections financières',
            'Créez une présentation technique avec exemples de code et notes d’orateur',
            'Créez une présentation aux investisseurs avec graphiques, chronologie et prochains jalons',
            'Créez une présentation de lancement produit avec positionnement, captures de démo et offres tarifaires',
            'Créez une revue d’activité trimestrielle avec KPI, réussites et risques',
            'Créez une présentation de conférence avec ordre du jour, diapositives de démo en direct et synthèse',
          ],
        },
        animation: {
          label: 'Animation',
          prompts: [
            'Créez un laboratoire interactif d’animations de particules avec préréglages exportables',
            'Créez une vitrine d’animations au défilement avec effets d’apparition et contrôle de la chronologie',
            'Créez une landing page animée avec transitions subtiles et sections responsive',
            'Créez un récit de données animé dont les graphiques se construisent au défilement',
            'Créez une galerie d’animations de chargement et de skeletons avec extraits copiables',
            'Créez une démo d’animation de tracé SVG avec commandes de lecture',
          ],
        },
        design: {
          label: 'Design',
          prompts: [
            'Créez une page de système de conception avec variables, composants et exemples d’utilisation',
            'Créez un générateur de palettes avec contrôle du contraste et outils d’export',
            'Créez un générateur d’identité de marque avec logos, typographie et aperçus pour les réseaux sociaux',
            'Créez un explorateur d’échelles typographiques avec associations et aperçu du texte en direct',
            'Créez un studio de dégradés et d’ombres avec CSS copiable',
            'Créez un navigateur d’icônes avec recherche, réglage des tailles et export SVG',
          ],
        },
        data: {
          label: 'Visualisation de données',
          prompts: [
            'Créez un tableau de bord analytique en temps réel avec graphiques, filtres et alertes',
            'Créez un tableau de bord financier avec ventilation par catégorie et graphiques prévisionnels',
            'Créez un tableau de bord produit avec tunnels, cohortes et courbes de rétention',
            'Créez un tableau de bord commercial avec étapes du pipeline, prévisions et taux de réussite',
            'Créez un tableau de bord de supervision serveur avec séries temporelles et seuils',
            'Créez un explorateur de résultats d’enquête avec ventilations, filtres et export CSV',
          ],
        },
        automation: {
          label: 'Automatisation',
          prompts: [
            'Créez une console d’automatisation pour les tâches planifiées, journaux, nouvelles tentatives et alertes',
            'Créez un workflow de traitement de fichiers avec import, validation et suivi de l’état',
            'Créez un générateur de synthèses par e-mail avec paramètres, aperçus et historique',
            'Créez un inspecteur de webhooks avec journal des requêtes, rejeu et filtres',
            'Créez un moniteur de synchronisation avec connecteurs, historique d’exécution et triage des erreurs',
            'Créez un workflow d’approbation avec étapes, responsables et piste d’audit',
          ],
        },
        game: {
          label: 'Jeu 3D',
          prompts: [
            'Créez un prototype de course Three.js avec commandes, points de passage et chronométrage des tours',
            'Créez un jeu de tower defense avec vagues, améliorations et classement',
            'Créez un configurateur de produit 3D avec éclairage, commandes de caméra et préréglages',
            'Créez un endless runner avec obstacles, bonus et classement des meilleurs scores',
            'Créez un jeu de réflexion physique avec objets déplaçables et progression par niveaux',
            'Créez un explorateur 3D du système solaire avec commandes orbitales et fiches sur les planètes',
          ],
        },
        document: {
          label: 'Document',
          prompts: [
            'Créez un éditeur Markdown avec aperçu en direct, arborescence de fichiers et commandes d’export',
            'Créez un générateur de CV avec modèles, sections et export PDF',
            'Créez une application de notes collaborative avec étiquettes, commentaires et historique des versions',
            'Créez un générateur de factures avec lignes, totaux et export PDF',
            'Créez un éditeur de base de connaissances avec pages imbriquées, recherche et liens retour',
            'Créez un éditeur de contrats avec modèles de clauses, variables et aperçu',
          ],
        },
        spreadsheet: {
          label: 'Tableur',
          prompts: [
            'Créez un tableur budgétaire avec formules, graphiques et import CSV',
            'Créez un tableau d’inventaire avec filtres, modification groupée et alertes de stock',
            'Créez une grille de planning projet avec jalons, responsables et vues d’avancement',
            'Créez une grille de suivi des dépenses avec catégories, justificatifs et totaux mensuels',
            'Créez une grille de contacts CRM avec étiquettes, filtres et modification en ligne',
            'Créez un relevé de notes avec colonnes pondérées, moyennes et export CSV',
          ],
        },
      },
      placeholders: [
        'Créez un tableau de bord SaaS avec…',
        'Créez un portfolio avec…',
        'Générez une boutique en ligne avec…',
      ],
      attachments: {
        archive: {
          label: 'Joindre',
          hint: 'Importer une archive ZIP (code, captures d’écran, images)',
        },
        github: {
          label: 'URL du dépôt GitHub',
          hint: 'Importer un dépôt GitHub existant',
        },
        design: {
          label: 'Palette de design',
          hint: 'Ajouter un export Figma ou des captures de design dans une archive ZIP',
        },
        import: {
          label: 'Toutes les sources d’import',
          hint: 'Importer depuis GitHub, Bitbucket, un ZIP, un tableur ou un builder, ou partir de zéro',
        },
      },
      prompt: {
        inputAria: 'Décrivez votre idée',
        attachAria: 'Joindre du contexte',
        createAria: 'Créer le projet',
        create: 'Créer',
        unlock: 'Écrivez quelques phrases pour activer la création.',
        shortcutHint: 'Appuyez sur {shortcut} pour envoyer.',
        keepGoing_one: '{count} mot — continuez.',
        keepGoing_other: '{count} mots — continuez.',
        summary_one: '{count} mot · {characters}/{maximum} caractères',
        summary_other: '{count} mots · {characters}/{maximum} caractères',
        estimateTitle: 'Estimation : environ {tokens} jetons en entrée',
        estimateOnlyTitle: 'Estimation du nombre de jetons uniquement.',
        tokens: 'environ {tokens} jetons',
        inputCost: 'environ {cost} en entrée',
        pricingUnknown: 'tarif inconnu',
        costLessThan: 'moins de {amount}',
      },
      validation: {
        empty: 'Décrivez le projet que vous souhaitez créer.',
        tooShort: 'Ajoutez quelques précisions : au moins {minimum} mots aideront l’agent à produire le bon résultat.',
        tooLong: 'Raccourcissez votre prompt : limitez-le à {maximum} caractères (il en contient {characters}).',
        tooManyLines:
          'Trop de lignes ({lines}). Limitez le brief à {maximum} lignes et ajoutez plutôt les longs documents au projet.',
        nonPrintable: 'Les caractères invisibles ou de contrôle ont été supprimés de votre prompt.',
        injection:
          'Votre prompt contient des formulations utilisées pour contourner les règles de sécurité. Si c’est volontaire, vous pouvez continuer ; sinon, reformulez-le.',
      },
      advanced: {
        title: 'Options avancées',
        contextAria: 'Contexte de génération',
        artifact: 'Type de création',
        artifactAria: 'Type de création',
        examplesAria: 'Exemples de prompts',
        tryExample: 'Essayer un exemple',
        refreshAria: 'Actualiser les exemples de prompts',
      },
      templates: {
        aria: 'Modèles prêts pour la production',
        eyebrow: 'Modèles',
        title: 'Partir du catalogue existant',
        description: 'Choisissez une base sélectionnée avec soin et personnalisez-la avec l’agent.',
      },
      actions: {
        logIn: 'Se connecter',
        retry: 'Réessayer',
        tryAgain: 'Réessayer',
        viewBilling: 'Voir la facturation',
        backHomepage: 'Retour à l’accueil',
        backDashboard: 'Retour au tableau de bord',
      },
      errors: {
        projectQuota:
          'Votre espace de travail a atteint sa limite de projets. Passez à une offre supérieure ou demandez une dérogation de quota à un administrateur avant de créer un autre projet.',
        projectNameRequired: 'Le nom du projet est obligatoire',
        aiGenerationFailed:
          'La création du projet n’a pas pu être confirmée : aucun projet vide de secours n’a été créé. Votre prompt est toujours ici ; réessayez.',
        promptQueueFailed: 'Impossible de mettre le prompt initial en file d’attente',
        modelsLoadFailed: 'Impossible de charger les modèles d’IA disponibles. Veuillez réessayer.',
        shellAuth: 'Connectez-vous pour créer un projet.',
        shellQuota: 'Le quota de projets est atteint.',
        shellUnavailable: 'La création de projet est temporairement indisponible.',
        descriptors: {
          auth: {
            title: 'Connectez-vous pour créer un projet',
            subtitle:
              'E-Code a besoin de votre espace de travail authentifié et de fournisseurs d’IA configurés pour créer un véritable projet.',
          },
          network: {
            title: 'Problème de connexion',
            subtitle:
              'Le service de projets est inaccessible. Vérifiez votre connexion puis réessayez ; vous n’avez pas besoin de vous reconnecter.',
          },
          quota: {
            title: 'Quota de projets atteint',
            subtitle:
              'Cet espace de travail a atteint sa limite de projets. Passez à une offre supérieure ou demandez une dérogation de quota à un administrateur.',
          },
          server: {
            title: 'Le service de projets rencontre un problème',
            subtitle:
              'Le service de projets a renvoyé une erreur. Réessayez dans quelques secondes ; vos saisies sont conservées.',
          },
          unknown: {
            title: 'La création de projet est indisponible',
            subtitle:
              'Un problème empêche le chargement de la création de projet. Réessayez ou revenez à la page d’accueil.',
          },
        },
      },
      moderation: {
        rejected: 'Votre prompt a été signalé pour le motif suivant : {categories}. Reformulez-le puis réessayez.',
        categories: {
          sexual: 'contenu sexuel',
          'sexual/minors': 'contenu sexuel impliquant des mineurs',
          hate: 'contenu haineux',
          'hate/threatening': 'contenu haineux et menaçant',
          harassment: 'harcèlement',
          'harassment/threatening': 'harcèlement menaçant',
          'self-harm': 'contenu relatif à l’automutilation',
          'self-harm/intent': 'intention d’automutilation',
          'self-harm/instructions': 'instructions d’automutilation',
          violence: 'contenu violent',
          'violence/graphic': 'violence graphique',
          illicit: 'activité illicite',
          'illicit/violent': 'activité illicite violente',
        },
      },
      defaultProjectName: 'Projet IA',
    },
    deployments: {
      metaTitle: 'Déploiements du projet - E-Code',
      shell: {
        title: 'Déploiements',
        description:
          'Publiez des versions d’aperçu, de préproduction et de production avec des secrets isolés, des contrôles de quota et des journaux expurgés.',
      },
      navigation: {
        aria: 'Vues des déploiements',
        overview: 'Vue d’ensemble',
        logs: 'Journaux',
        domains: 'Domaines',
        manage: 'Gérer',
      },
      actions: {
        republish: 'Republier',
        adjustSettings: 'Modifier les paramètres',
        copyLink: 'Copier le lien du déploiement',
        securitySoon: 'L’analyse de sécurité sera bientôt disponible',
        securityScan: 'Lancer l’analyse de sécurité',
        open: 'Ouvrir',
        redeploy: 'Redéployer',
        rollback: 'Rétablir',
        cancel: 'Annuler',
      },
      production: 'Production',
      access: {
        title: 'Accès au déploiement',
        description:
          'Choisissez qui peut ouvrir l’origine dédiée du déploiement. Chaque modification crée une révision immuable et invalide immédiatement les anciennes preuves d’accès.',
        label: 'Qui peut accéder',
        noDeployment: 'Publiez un déploiement avant de configurer sa politique d’accès.',
        version: 'Politique v{version}',
        password: 'Mot de passe du déploiement',
        passwordPlaceholder: '10 caractères minimum',
        rotation: 'Changer le mode ou le mot de passe renouvelle la politique et ses sessions actives.',
        adminOnly: 'Seuls les propriétaires et administrateurs de l’espace peuvent modifier cette politique.',
        locked:
          'La politique liée n’a pas pu être vérifiée. L’accès reste verrouillé sur invitation uniquement jusqu’à l’enregistrement d’une politique valide.',
        save: 'Enregistrer la politique',
        saving: 'Enregistrement…',
        saved: 'Politique d’accès au déploiement enregistrée.',
        modes: {
          public: { label: 'Public', description: 'Toute personne disposant de l’URL peut ouvrir le déploiement.' },
          password: {
            label: 'Protégé par mot de passe',
            description: 'Les visiteurs saisissent un mot de passe propre au déploiement.',
          },
          workspace: { label: 'Espace uniquement', description: 'Tout membre actif de cet espace peut l’ouvrir.' },
          invite: {
            label: 'Sur invitation',
            description: 'Propriétaires, administrateurs et collaborateurs explicitement autorisés.',
          },
        },
      },
      publish: {
        title: 'Publier',
        detecting: 'Détection du mode de déploiement de votre application…',
        detectionFailed: 'Impossible de déterminer comment déployer cette application.',
        redetect: 'Relancer la détection',
        detected: 'Détecté :',
        serverMode: 'déploiement avec mise à l’échelle automatique',
        reservedMode: 'déploiement sur VM réservée',
        staticMode: 'déploiement statique',
        overridden: '(remplacé manuellement)',
        serverDescription:
          'Exécute votre application comme un service HTTP géré dans un environnement d’exécution persistant. Les commandes de compilation et de démarrage sont détectées automatiquement ; les secrets du projet, y compris l’URL de la base de données, sont injectés automatiquement.',
        reservedDescription:
          'Exécute une VM gérée toujours active avec un stockage persistant. Le projet, l’URL et les données restent identiques lors d’un changement d’offre VM réservée.',
        staticDescription:
          'Compile votre application et publie le résultat sous forme de site statique rapide accessible à une URL publique.',
        environment: 'Environnement',
        customDomain: 'Domaine personnalisé',
        machineSize: 'Taille de la machine',
        hourlyActive: '{amount}/h d’activité',
        upgradePlan: '(offre supérieure requise)',
        unavailable: '(indisponible)',
        billing:
          'Facturation uniquement pendant l’exécution de votre application : elle se met automatiquement en veille après 15 min sans trafic et se réveille à la requête suivante. Grille tarifaire v{version}.',
        rateCardLoading: 'Chargement des tarifs et de la disponibilité du calcul…',
        rateCardUnavailable:
          'Les tarifs de calcul sont temporairement indisponibles. La publication serveur est désactivée pour éviter un déploiement sans prix vérifié.',
        retryRateCard: 'Recharger les tarifs',
        reservedVm: {
          title: 'VM réservée',
          available: 'Disponible avec votre offre',
          description: 'Toujours active · stockage persistant · prix mensuel fixe',
          tierLegend: 'Choisir une offre VM réservée',
          sharedTier: 'Capacité partagée',
          dedicatedTier: 'Dédiée · {cpu} vCPU',
          tierUnavailable: 'Indisponible avec cette offre ou la capacité actuelle du cluster',
          cpuMemory: '{cpu} vCPU · {memory} Go de RAM',
          monthly: '{amount}/mois',
          confirmation:
            'Je confirme cette réservation de VM à {amount}/mois. La facturation commence une fois le provisionnement réussi.',
          confirmationHint:
            'Le changement d’offre conserve l’URL et les données persistantes de ce projet. Le nouveau prix mensuel devra être confirmé.',
          paidPlanRequired: 'Une offre payante active est requise pour utiliser une VM réservée.',
          operatorUnavailable:
            'La VM réservée n’est pas activée sur ce cluster. Aucune réservation et aucun débit ne seront créés.',
          pricingInvalid:
            'Les tarifs de VM réservée n’ont pas pu être vérifiés. Rechargez-les avant de créer une réservation.',
          upgrade: 'Voir les offres payantes',
        },
        environmentVariables: 'Variables d’environnement',
        environmentPlaceholder: 'PUBLIC_API_URL=https://api.example.com\nFEATURE_FLAG=on',
        advanced: 'Avancé — remplacer le mode de déploiement',
        modeAuto: 'Automatique (recommandé) — utiliser le mode détecté',
        modeServer: 'Mise à l’échelle automatique — veille en cas d’inactivité',
        modeReservedVm: 'VM réservée — toujours active avec stockage persistant',
        modeStatic: 'Statique — résultat compilé, sans serveur',
        publishing: 'Publication…',
        submit: 'Publier',
      },
      runtime: {
        title: 'Paramètres d’exécution',
        description:
          'Modifiez ce déploiement sur place. Son projet, son URL publique et ses données persistantes restent liés au même déploiement.',
        current: 'Actuel : {runtime} · configuration v{version}',
        modeLegend: 'Type d’exécution',
        autoscale: 'Mise à l’échelle automatique',
        reservedVm: 'VM réservée',
        versionUnavailable:
          'La version de configuration est indisponible. Actualisez avant de modifier le calcul afin de ne pas remplacer une modification plus récente.',
        recovery:
          'Si le provisionnement échoue, l’environnement actuel reste actif ou est restauré. Actualisez cette page avant de réessayer après un conflit de version.',
        unchanged:
          'Choisissez un autre type d’exécution, une autre taille de machine ou une autre offre VM réservée pour enregistrer une modification.',
        save: 'Appliquer la modification',
        saving: 'Application de la modification…',
      },
      environments: {
        preview: 'Aperçu',
        staging: 'Préproduction',
        production: 'Production',
      },
      logs: {
        title: 'Journaux de compilation et de déploiement',
        building: 'Compilation en cours…',
        failed: 'Échec',
        deployed: 'Déployé',
        starting: 'Démarrage de la compilation…',
        empty: 'Aucun journal pour le moment. Cliquez sur Publier pour lancer la compilation et le déploiement.',
        redacted: 'Journaux de déploiement expurgés',
        noLogs: 'Aucun journal pour le moment',
        line_one: '{count} ligne',
        line_other: '{count} lignes',
      },
      domains: {
        title: 'Domaines',
        noUrl: 'Aucune URL publique pour le moment ; publiez d’abord votre application.',
        guidance:
          'Ajoutez un domaine personnalisé dans l’assistant de la vue d’ensemble. Après la publication, faites pointer le DNS de votre domaine (CNAME) vers le déploiement. La gestion TLS des domaines personnalisés sera bientôt disponible.',
      },
      history: {
        title: 'Historique des déploiements',
        description: 'Redéployez, annulez ou rétablissez une version sans quitter le projet.',
        emptyTitle: 'Aucun déploiement pour le moment',
        emptyDescription:
          'Utilisez l’assistant de la vue d’ensemble pour créer la première version d’aperçu ou de production.',
      },
      row: {
        rollbackBadge: 'rétablissement',
        rollbackTitle: 'Créé en rétablissant le déploiement {deploymentId}',
        durationTitle: 'Durée de la compilation',
        deployedPrefix: 'déployé',
        urlPending: 'URL en attente',
      },
      confirmations: {
        rollback: {
          title: 'Rétablir ce déploiement ?',
          description:
            'Cette action modifie la version actuellement publiée : la compilation sélectionnée est republiée dans un nouveau déploiement et un événement est inscrit dans le journal d’audit.',
          confirm: 'Rétablir',
        },
        cancel: {
          title: 'Annuler ce déploiement ?',
          description: 'La compilation en cours sera arrêtée et le déploiement sera marqué comme annulé.',
          confirm: 'Annuler le déploiement',
        },
      },
      statuses: {
        ready: 'Prêt',
        failed: 'Échec',
        canceled: 'Annulé',
        queued: 'En file d’attente',
        building: 'Compilation en cours',
        pending: 'En attente',
        deploying: 'Déploiement en cours',
        unknown: 'Inconnu',
      },
      errors: {
        projectNotFound: 'Projet introuvable',
        detectionUnavailable:
          'La détection est temporairement indisponible. Ouvrez l’espace de travail puis réessayez.',
        startFailed: 'Impossible de démarrer le déploiement',
        cancelFailed: 'Impossible d’annuler le déploiement',
        redeployFailed: 'Impossible de redéployer',
        rollbackFailed: 'Impossible de rétablir ce déploiement',
        accessFailed: 'Impossible de modifier l’accès au déploiement',
        reservedConfirmationRequired: 'Confirmez le prix mensuel de la VM réservée avant de publier.',
        reservedPricingInvalid:
          'Les tarifs ou conditions de la VM réservée sont invalides. Rechargez-les puis réessayez.',
        runtimeChangeInvalid:
          'La modification de l’environnement d’exécution est incomplète ou obsolète. Actualisez puis réessayez.',
        runtimeChangeFailed: 'Impossible de modifier l’environnement d’exécution du déploiement',
      },
    },
  },
} as const satisfies LocalizedShape<typeof projectUserAreaEn>;

export type ProjectCreationCopy = LocalizedShape<typeof projectUserAreaEn.projectUserArea.creation>;
export type ProjectDeploymentsCopy = LocalizedShape<typeof projectUserAreaEn.projectUserArea.deployments>;

export function resolveProjectUserAreaLanguage(language?: string | null): ProjectUserAreaLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getProjectCreationCopy(language?: string | null): ProjectCreationCopy {
  return resolveProjectUserAreaLanguage(language) === 'fr'
    ? projectUserAreaFr.projectUserArea.creation
    : projectUserAreaEn.projectUserArea.creation;
}

export function getProjectDeploymentsCopy(language?: string | null): ProjectDeploymentsCopy {
  return resolveProjectUserAreaLanguage(language) === 'fr'
    ? projectUserAreaFr.projectUserArea.deployments
    : projectUserAreaEn.projectUserArea.deployments;
}

export type ProjectCopyInterpolationValue = string | number | bigint;

export function interpolateProjectCopy(
  template: string,
  values: Readonly<Record<string, ProjectCopyInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];
    return value === undefined ? token : String(value);
  });
}

export function formatProjectUserAreaNumber(value: number | bigint, language?: string | null): string {
  const locale = resolveProjectUserAreaLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.NumberFormat(locale).format(value);
}

export function formatProjectUserAreaCurrency(
  value: number,
  currency: string,
  language?: string | null,
  fractionDigits = 2,
): string {
  const locale = resolveProjectUserAreaLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const normalizedCurrency = /^[A-Za-z]{3}$/u.test(currency) ? currency.toUpperCase() : 'USD';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Math.max(0, Number.isFinite(value) ? value : 0));
}

export function formatProjectPromptCost(value: number, language?: string | null): string {
  const copy = getProjectCreationCopy(language);
  const normalized = Math.max(0, Number.isFinite(value) ? value : 0);

  if (normalized > 0 && normalized < 0.01) {
    return interpolateProjectCopy(copy.prompt.costLessThan, {
      amount: formatProjectUserAreaCurrency(0.01, 'USD', language, 2),
    });
  }

  return formatProjectUserAreaCurrency(normalized, 'USD', language, normalized > 0 && normalized < 1 ? 3 : 2);
}

export function formatProjectUserAreaList(values: readonly string[], language?: string | null): string {
  const locale = resolveProjectUserAreaLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values);
}

export function formatProjectCopyPlural(
  language: string | null | undefined,
  count: number,
  forms: Readonly<{ one: string; other: string }>,
  values: Readonly<Record<string, ProjectCopyInterpolationValue>> = {},
): string {
  const locale = resolveProjectUserAreaLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateProjectCopy(form, {
    ...values,
    count: formatProjectUserAreaNumber(count, language),
  });
}
