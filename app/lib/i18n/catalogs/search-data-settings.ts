import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDate, formatUserAreaDateTime, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type SearchDataSettingsLanguage = 'en' | 'fr';

type LocalizedShape<Value> = Value extends string
  ? string
  : Value extends readonly (infer Item)[]
    ? readonly LocalizedShape<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: LocalizedShape<Value[Key]> }
      : Value;

export const searchDataSettingsEn = {
  searchDataSettings: {
    search: {
      seo: {
        title: 'Search E-Code',
        description: 'Search E-Code app pages, Help Center topics and production-ready starter templates.',
        imageAlt: 'E-Code search for app pages, help and templates',
      },
      ui: {
        eyebrow: 'Discovery',
        title: 'Search E-Code',
        lead: 'Search app pages, Help Center topics and starter templates from one place.',
        placeholder: 'Search pages, help topics and templates...',
        ariaLabel: 'Search E-Code',
        emptyTitle: 'Search E-Code',
        emptyDescription: 'Type above to search app pages, Help Center topics and starter templates.',
        noResultsTitle: 'No results for “{query}”',
        noResultsDescription: 'Try a different search term, or browse the template gallery and Help Center directly.',
        browseTemplates: 'Browse templates',
        openHelpCenter: 'Open Help Center',
        summary_one: '{count} result for “{query}”',
        summary_other: '{count} results for “{query}”',
        appPages: 'App pages',
        helpCenter: 'Help Center',
        templates: 'Templates',
      },
      appPages: {
        dashboard: {
          title: 'Dashboard',
          description: 'Workspace home with your recent projects and quick actions.',
        },
        projects: {
          title: 'Projects',
          description: 'All projects across your organizations, with search and filters.',
        },
        newProject: {
          title: 'New project',
          description: 'Start a new project from a prompt, a template or an import.',
        },
        templates: {
          title: 'Templates',
          description: 'Starter template gallery for web apps, APIs, mobile and AI agents.',
        },
        deployments: {
          title: 'Deployments',
          description: 'Published deployments, domains and release status.',
        },
        usage: {
          title: 'Usage',
          description: 'Compute, storage and AI usage against your plan limits.',
        },
        billing: {
          title: 'Billing',
          description: 'Plan, payment method and subscription management.',
        },
        invoices: {
          title: 'Invoices',
          description: 'Invoice history and downloads.',
        },
        teams: {
          title: 'Teams',
          description: 'Team plans, collaboration and enterprise controls.',
        },
        settings: {
          title: 'Settings',
          description: 'Account, workspace and notification settings.',
        },
        accountSettings: {
          title: 'Account settings',
          description: 'Profile, security and account management.',
        },
        apiKeys: {
          title: 'API keys',
          description: 'Create and manage API keys for programmatic access.',
        },
        support: {
          title: 'Support',
          description: 'Contact the support team and find support resources.',
        },
        docs: {
          title: 'Docs',
          description: 'Product documentation and guides.',
        },
        helpCenter: {
          title: 'Help Center',
          description: 'Browse help topics and popular articles.',
        },
        community: {
          title: 'Community',
          description: 'Community posts, examples and discussions.',
        },
        pricing: {
          title: 'Pricing',
          description: 'Plans for individuals, teams and enterprise deployments.',
        },
        marketplace: {
          title: 'Marketplace',
          description: 'Marketplace templates and community starters.',
        },
      },
      help: {
        topics: [
          {
            title: 'Getting started',
            description: 'Set up your account, create your first project, and ship in minutes.',
          },
          {
            title: 'Workspaces',
            description: 'Manage files, terminals, ports, and live previews in the E-Code IDE.',
          },
          {
            title: 'Deployments',
            description: 'Publish static sites and full-stack apps with custom domains.',
          },
          {
            title: 'Billing',
            description: 'Plans, invoices, usage limits, and how to upgrade or cancel.',
          },
          {
            title: 'AI agent',
            description: 'Prompt the agent, review proposed edits, and iterate on your code.',
          },
          {
            title: 'Integrations',
            description: 'Connect GitHub, MCP servers, and third-party services to your projects.',
          },
        ],
        articles: [
          'How do I create a new project from a prompt?',
          'Connecting a GitHub repository to your workspace',
          'Adding a custom domain to a deployment',
          'Understanding usage limits on the Free plan',
          'Why is my preview stuck on “Starting”?',
          'Accepting and reverting AI agent edits',
          'Inviting teammates to an organization',
          'Configuring an MCP integration',
        ],
      },
      templates: {
        records: {
          'react-saas': {
            name: 'React SaaS',
            description:
              'Production SaaS starter with React, Vite, TypeScript, authenticated dashboard surfaces and deploy-ready structure.',
          },
          'next-dashboard': {
            name: 'Next dashboard',
            description:
              'Full-stack dashboard starter with Next.js, Prisma, Tailwind CSS and database-backed operational screens.',
          },
          'fastify-api': {
            name: 'Fastify API',
            description:
              'Backend service starter with Node.js, Fastify, PostgreSQL-style persistence boundaries and production API conventions.',
          },
          'ai-agent': {
            name: 'AI agent',
            description:
              'Agent runtime starter with tool orchestration, streaming events, provider routing and IDE integration points.',
          },
          'landing-page': {
            name: 'Landing page',
            description:
              'Responsive marketing starter for conversion pages, polished content sections and production-ready routing.',
          },
          'mobile-starter': {
            name: 'Mobile starter',
            description:
              'Mobile app starter with Expo, React and TypeScript for shared frontend packages and device-first flows.',
          },
          'expo-app': {
            name: 'Expo App',
            description: 'Expo starter template for building cross-platform mobile apps.',
          },
          'basic-astro': {
            name: 'Astro Basic',
            description: 'Lightweight Astro starter template for building fast static websites.',
          },
          'nextjs-shadcn': {
            name: 'Next.js with shadcn/ui',
            description: 'Next.js full-stack starter integrated with shadcn/ui components and its styling system.',
          },
          'vite-shadcn': {
            name: 'Vite with shadcn/ui',
            description: 'Vite full-stack starter integrated with shadcn/ui components and its styling system.',
          },
          'qwik-typescript': {
            name: 'Qwik TypeScript',
            description: 'Qwik framework starter with TypeScript for building resumable applications.',
          },
          'remix-typescript': {
            name: 'Remix TypeScript',
            description: 'Remix framework starter with TypeScript for full-stack web applications.',
          },
          slidev: {
            name: 'Slidev Presentation',
            description: 'Slidev starter template for creating developer-friendly presentations using Markdown.',
          },
          sveltekit: {
            name: 'SvelteKit',
            description: 'SvelteKit starter template for building fast, efficient web applications.',
          },
          'vanilla-vite': {
            name: 'Vanilla + Vite',
            description: 'Minimal Vite starter template for vanilla JavaScript projects.',
          },
          'vite-react': {
            name: 'React + Vite + TypeScript',
            description: 'React starter template powered by Vite for a fast development experience.',
          },
          'vite-typescript': {
            name: 'Vite + TypeScript',
            description: 'Vite starter template with TypeScript configuration for type-safe development.',
          },
          vue: {
            name: 'Vue.js',
            description: 'Vue.js starter template with modern tooling and best practices.',
          },
          angular: {
            name: 'Angular Starter',
            description: 'Modern Angular starter with TypeScript support and best-practice configuration.',
          },
          solidjs: {
            name: 'SolidJS Tailwind',
            description: 'Lightweight SolidJS starter template for building fast static websites.',
          },
        },
        categories: {
          api: 'APIs & Backend',
          mobile: 'Mobile',
          'ml-ai': 'AI & ML',
          starter: 'Starter Kits',
          web: 'Web Apps',
        },
      },
    },
    dataSettings: {
      common: {
        cancel: 'Cancel',
        exportSelected: 'Export Selected',
        exportAll: 'Export All',
        exporting: 'Exporting...',
        importing: 'Importing...',
        deleting: 'Deleting...',
        resetting: 'Resetting...',
        downloading: 'Downloading...',
        download: 'Download',
      },
      sharedDialog: {
        close: 'Close',
        confirm: 'Confirm',
        cancel: 'Cancel',
        save: 'Save',
        selectionDescription: 'Select the items you want to include, then choose {action}.',
        selectionSummary_one: '{selected} of {total} item selected',
        selectionSummary_other: '{selected} of {total} items selected',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        noItems: 'No items to display',
      },
      categories: {
        core: { label: 'Core Settings', description: 'User profile and main settings' },
        providers: { label: 'Providers', description: 'API keys and provider configurations' },
        features: { label: 'Features', description: 'Feature flags and settings' },
        ui: { label: 'UI', description: 'UI configuration and preferences' },
        connections: { label: 'Connections', description: 'External service connections' },
        debug: { label: 'Debug', description: 'Debug settings and logs' },
        updates: { label: 'Updates', description: 'Update settings and notifications' },
      },
      dialogs: {
        resetSettingsTitle: 'Reset All Settings?',
        resetSettingsDescription:
          'This will reset all your settings to their default values. This action cannot be undone.',
        resetSettingsConfirm: 'Reset Settings',
        deleteChatsTitle: 'Delete All Chats?',
        deleteChatsDescription: 'This will permanently delete all your chat history. This action cannot be undone.',
        deleteChatsConfirm: 'Delete All',
        selectSettingsTitle: 'Select Settings to Export',
        selectChatsTitle: 'Select Chats to Export',
      },
      chats: {
        sectionTitle: 'Chats',
        fallbackLabel: 'Chat {id}',
        messages_one: '{count} message',
        messages_other: '{count} messages',
        updated: '{messages} — Last updated: {date}',
        databaseOpenFailed:
          'The chat history database could not be opened. Chat export and import are unavailable. Try reloading the page.',
        databaseLoading: 'Loading chats database...',
        exportAllTitle: 'Export All Chats',
        exportAllDescription: 'Export all your chats to a JSON file.',
        noChatsToExport: 'No Chats to Export',
        exportSelectedTitle: 'Export Selected Chats',
        exportSelectedDescription: 'Choose specific chats to export.',
        selectChats: 'Select Chats',
        importTitle: 'Import Chats',
        importDescription: 'Import chats from a JSON file.',
        importAction: 'Import Chats',
        deleteTitle: 'Delete All Chats',
        deleteDescription: 'Delete all your chat history.',
        deleteAction: 'Delete All',
      },
      settings: {
        sectionTitle: 'Settings',
        exportAllTitle: 'Export All Settings',
        exportAllDescription: 'Export all your settings to a JSON file.',
        exportSelectedTitle: 'Export Selected Settings',
        exportSelectedDescription: 'Choose specific settings to export.',
        selectSettings: 'Select Settings',
        importTitle: 'Import Settings',
        importDescription: 'Import settings from a JSON file.',
        importAction: 'Import Settings',
        resetTitle: 'Reset All Settings',
        resetDescription: 'Reset all settings to their default values.',
        resetAction: 'Reset All',
      },
      apiKeys: {
        sectionTitle: 'API Keys',
        downloadTitle: 'Download Template',
        downloadDescription: 'Download a template file for your API keys.',
        importTitle: 'Import API Keys',
        importDescription: 'Import API keys from a JSON file.',
        importAction: 'Import Keys',
      },
      visualization: {
        sectionTitle: 'Data Usage',
        chatsCreated: 'Chats Created',
        messagesByRole: 'Messages by Role',
        chatHistory: 'Chat History',
        messageDistribution: 'Message Distribution',
        noDataTitle: 'No Data Available',
        noDataDescription: 'Start creating chats to see your usage statistics and data visualization.',
        totalChats: 'Total Chats',
        totalMessages: 'Total Messages',
        averageMessages: 'Avg. Messages/Chat',
        roles: { user: 'User', assistant: 'Assistant', system: 'System', tool: 'Tool' },
      },
      feedback: {
        databaseUnavailable: 'Database not available',
        noChatsAvailable: 'No chats available to export',
        reloadChatsFailed: 'Failed to reload chats',
        loadChatsFailed: 'Failed to load chats',
        noSettingsCategories: 'No settings categories selected',
        noChatsSelected: 'No chats selected',
      },
      operations: {
        errorWithDetail: '{message}: {detail}',
        progressWithPercent: '{message} ({percent})',
        technical: {
          databaseInitialization: 'Database initialization failed',
          invalidChatData: 'Invalid chat data format',
          importTransactionAborted: 'Import transaction aborted',
          apiKeyExportRequestFailed: 'API key export request failed',
          undoRestoreTransactionAborted: 'Undo restore transaction aborted',
        },
        loading: {
          preparingSettingsExport: 'Preparing settings export...',
          preparingSelectedSettings_one: 'Preparing export of {count} settings category...',
          preparingSelectedSettings_other: 'Preparing export of {count} settings categories...',
          preparingChatsExport: 'Preparing chats export...',
          preparingSelectedChats_one: 'Preparing export of {count} chat...',
          preparingSelectedChats_other: 'Preparing export of {count} chats...',
          importingSettings: 'Importing settings from {file}...',
          importingChats: 'Importing chats from {file}...',
          importingApiKeys: 'Importing API keys from {file}...',
          resettingSettings: 'Resetting settings...',
          deletingChats: 'Deleting all chats...',
          creatingApiKeysTemplate: 'Creating API keys template...',
          exportingApiKeys: 'Exporting API keys...',
          processingUndo: 'Processing undo operation...',
        },
        progress: {
          exportingSettings: 'Exporting settings',
          creatingFile: 'Creating file',
          downloadingFile: 'Downloading file',
          completingExport: 'Completing export',
          filteringCategories: 'Filtering selected categories',
          retrievingChats: 'Retrieving chats from database',
          readingFile: 'Reading file',
          parsingSettings: 'Parsing settings data',
          validatingSettings: 'Validating settings data',
          applyingSettings: 'Applying settings',
          completingImport: 'Completing import',
          parsingChats: 'Parsing chat data',
          validatingChats: 'Validating chat data',
          preparingTransaction: 'Preparing database transaction',
          importingChats_one: 'Importing {count} chat',
          importingChats_other: 'Importing {count} chats',
          importedChats_one: 'Imported {processed} of {total} chat',
          importedChats_other: 'Imported {processed} of {total} chats',
          parsingApiKeys: 'Parsing API keys data',
          validatingApiKeys: 'Validating API keys data',
          applyingApiKeys: 'Applying API keys',
          backingUpSettings: 'Backing up current settings',
          resettingDefaults: 'Resetting settings to defaults',
          completingReset: 'Completing reset',
          backingUpChats: 'Backing up current chats',
          deletingChats: 'Deleting chats from database',
          completingDeletion: 'Completing deletion',
          creatingTemplate: 'Creating template',
          downloadingTemplate: 'Downloading template',
          completingDownload: 'Completing download',
          retrievingApiKeys: 'Retrieving API keys',
        },
        success: {
          settingsExported: 'Settings exported successfully',
          settingsCategoriesExported_one: '{count} settings category exported successfully',
          settingsCategoriesExported_other: '{count} settings categories exported successfully',
          chatsExported_one: '{count} chat exported successfully',
          chatsExported_other: '{count} chats exported successfully',
          settingsImported: 'Settings imported successfully',
          chatsImported_one: '{count} chat imported successfully',
          chatsImported_other: '{count} chats imported successfully',
          invalidChatsSkipped_one: '{count} invalid chat skipped',
          invalidChatsSkipped_other: '{count} invalid chats skipped',
          apiKeysImported_one: '{count} API key imported successfully',
          apiKeysImported_other: '{count} API keys imported successfully',
          apiKeysUpdated_one: '{count} new or updated key',
          apiKeysUpdated_other: '{count} new or updated keys',
          apiKeysStorageNote:
            'Keys are stored in browser cookies. For server-side usage, add them to your .env.local file.',
          settingsReset: 'Settings reset successfully',
          chatsDeleted: 'All chats deleted successfully',
          templateDownloaded: 'Template downloaded successfully',
          apiKeysExported: 'API keys exported successfully',
          operationUndone: 'Operation undone successfully',
        },
        errors: {
          exportSettings: 'Failed to export settings',
          exportChats: 'Failed to export chats',
          exportSelectedChats: 'Failed to export selected chats',
          importSettings: 'Failed to import settings',
          importChats: 'Failed to import chats',
          importApiKeys: 'Failed to import API keys',
          resetSettings: 'Failed to reset settings',
          deleteChats: 'Failed to delete chats',
          downloadTemplate: 'Failed to download template',
          exportApiKeys: 'Failed to export API keys',
          undo: 'Failed to undo',
          cannotUndo: 'Cannot undo this operation',
          nothingToUndo: 'Nothing to undo',
        },
      },
    },
  },
} as const;

export const searchDataSettingsFr = {
  searchDataSettings: {
    search: {
      seo: {
        title: 'Rechercher sur E-Code',
        description:
          'Recherchez des pages E-Code, des rubriques du Centre d’aide et des modèles prêts pour la production.',
        imageAlt: 'Recherche E-Code parmi les pages, l’aide et les modèles',
      },
      ui: {
        eyebrow: 'Découverte',
        title: 'Rechercher sur E-Code',
        lead: 'Recherchez au même endroit des pages, des rubriques du Centre d’aide et des modèles de démarrage.',
        placeholder: 'Rechercher des pages, des rubriques d’aide et des modèles…',
        ariaLabel: 'Rechercher sur E-Code',
        emptyTitle: 'Rechercher sur E-Code',
        emptyDescription:
          'Saisissez votre recherche ci-dessus pour parcourir les pages, le Centre d’aide et les modèles de démarrage.',
        noResultsTitle: 'Aucun résultat pour « {query} »',
        noResultsDescription:
          'Essayez un autre terme ou consultez directement la galerie de modèles et le Centre d’aide.',
        browseTemplates: 'Parcourir les modèles',
        openHelpCenter: 'Ouvrir le Centre d’aide',
        summary_one: '{count} résultat pour « {query} »',
        summary_other: '{count} résultats pour « {query} »',
        appPages: 'Pages de l’application',
        helpCenter: 'Centre d’aide',
        templates: 'Modèles',
      },
      appPages: {
        dashboard: {
          title: 'Tableau de bord',
          description: 'Accueil de votre espace de travail, avec vos projets récents et des actions rapides.',
        },
        projects: {
          title: 'Projets',
          description: 'Tous les projets de vos organisations, avec recherche et filtres.',
        },
        newProject: {
          title: 'Nouveau projet',
          description: 'Démarrez un projet à partir d’une consigne, d’un modèle ou d’une importation.',
        },
        templates: {
          title: 'Modèles',
          description: 'Galerie de modèles pour applications web, API, mobile et agents IA.',
        },
        deployments: {
          title: 'Déploiements',
          description: 'Déploiements publiés, domaines et état des versions.',
        },
        usage: {
          title: 'Utilisation',
          description: 'Calcul, stockage et utilisation de l’IA par rapport aux limites de votre offre.',
        },
        billing: {
          title: 'Facturation',
          description: 'Gestion de l’offre, du moyen de paiement et de l’abonnement.',
        },
        invoices: {
          title: 'Factures',
          description: 'Historique et téléchargement des factures.',
        },
        teams: {
          title: 'Équipes',
          description: 'Offres d’équipe, collaboration et contrôles d’entreprise.',
        },
        settings: {
          title: 'Paramètres',
          description: 'Paramètres du compte, de l’espace de travail et des notifications.',
        },
        accountSettings: {
          title: 'Paramètres du compte',
          description: 'Gestion du profil, de la sécurité et du compte.',
        },
        apiKeys: {
          title: 'Clés API',
          description: 'Créez et gérez des clés API pour les accès programmatiques.',
        },
        support: {
          title: 'Assistance',
          description: 'Contactez l’équipe d’assistance et consultez les ressources disponibles.',
        },
        docs: {
          title: 'Documentation',
          description: 'Documentation produit et guides.',
        },
        helpCenter: {
          title: 'Centre d’aide',
          description: 'Parcourez les rubriques d’aide et les articles populaires.',
        },
        community: {
          title: 'Communauté',
          description: 'Publications, exemples et discussions de la communauté.',
        },
        pricing: {
          title: 'Tarifs',
          description: 'Offres pour les particuliers, les équipes et les déploiements d’entreprise.',
        },
        marketplace: {
          title: 'Place de marché',
          description: 'Modèles de la place de marché et kits de démarrage de la communauté.',
        },
      },
      help: {
        topics: [
          {
            title: 'Bien démarrer',
            description: 'Configurez votre compte, créez votre premier projet et publiez-le en quelques minutes.',
          },
          {
            title: 'Espaces de travail',
            description: 'Gérez les fichiers, terminaux, ports et aperçus en direct dans l’IDE E-Code.',
          },
          {
            title: 'Déploiements',
            description: 'Publiez des sites statiques et des applications complètes avec des domaines personnalisés.',
          },
          {
            title: 'Facturation',
            description: 'Offres, factures, limites d’utilisation, changement d’offre et résiliation.',
          },
          {
            title: 'Agent IA',
            description: 'Donnez une consigne à l’agent, examinez les modifications proposées et améliorez votre code.',
          },
          {
            title: 'Intégrations',
            description: 'Connectez GitHub, des serveurs MCP et des services tiers à vos projets.',
          },
        ],
        articles: [
          'Comment créer un projet à partir d’une consigne ?',
          'Connecter un dépôt GitHub à votre espace de travail',
          'Ajouter un domaine personnalisé à un déploiement',
          'Comprendre les limites d’utilisation de l’offre gratuite',
          'Pourquoi mon aperçu reste-t-il bloqué sur « Démarrage » ?',
          'Accepter et annuler les modifications de l’agent IA',
          'Inviter des collaborateurs dans une organisation',
          'Configurer une intégration MCP',
        ],
      },
      templates: {
        records: {
          'react-saas': {
            name: 'React SaaS',
            description:
              'Base SaaS prête pour la production avec React, Vite, TypeScript, un tableau de bord authentifié et une structure prête à déployer.',
          },
          'next-dashboard': {
            name: 'Tableau de bord Next',
            description:
              'Base d’application complète avec tableau de bord, Next.js, Prisma, Tailwind CSS et des écrans opérationnels reliés à une base de données.',
          },
          'fastify-api': {
            name: 'API Fastify',
            description:
              'Base de service applicatif avec Node.js, Fastify, une persistance de type PostgreSQL et des conventions d’API de production.',
          },
          'ai-agent': {
            name: 'Agent IA',
            description:
              'Base d’exécution d’agent avec orchestration d’outils, événements diffusés en continu, routage des fournisseurs et points d’intégration à l’IDE.',
          },
          'landing-page': {
            name: 'Page d’atterrissage',
            description:
              'Base marketing adaptative pour les pages de conversion, avec des sections soignées et un routage prêt pour la production.',
          },
          'mobile-starter': {
            name: 'Base mobile',
            description:
              'Base d’application mobile avec Expo, React et TypeScript pour des paquets d’interface utilisateur partagés et des parcours pensés pour les appareils mobiles.',
          },
          'expo-app': {
            name: 'Application Expo',
            description: 'Modèle Expo pour créer des applications mobiles multiplateformes.',
          },
          'basic-astro': {
            name: 'Base Astro',
            description: 'Modèle Astro léger pour créer des sites statiques rapides.',
          },
          'nextjs-shadcn': {
            name: 'Next.js avec shadcn/ui',
            description:
              'Modèle d’application complète Next.js intégrant les composants shadcn/ui et leur système de styles.',
          },
          'vite-shadcn': {
            name: 'Vite avec shadcn/ui',
            description:
              'Modèle d’application complète Vite intégrant les composants shadcn/ui et leur système de styles.',
          },
          'qwik-typescript': {
            name: 'Qwik TypeScript',
            description: 'Modèle Qwik avec TypeScript pour créer des applications reprenables.',
          },
          'remix-typescript': {
            name: 'Remix TypeScript',
            description: 'Modèle Remix avec TypeScript pour les applications web complètes.',
          },
          slidev: {
            name: 'Présentation Slidev',
            description: 'Modèle Slidev pour créer en Markdown des présentations adaptées aux développeurs.',
          },
          sveltekit: {
            name: 'SvelteKit',
            description: 'Modèle SvelteKit pour créer des applications web rapides et efficaces.',
          },
          'vanilla-vite': {
            name: 'Vanilla + Vite',
            description: 'Modèle Vite minimal pour les projets JavaScript sans framework.',
          },
          'vite-react': {
            name: 'React + Vite + TypeScript',
            description: 'Modèle React propulsé par Vite pour un développement rapide.',
          },
          'vite-typescript': {
            name: 'Vite + TypeScript',
            description: 'Modèle Vite configuré avec TypeScript pour un développement fortement typé.',
          },
          vue: {
            name: 'Vue.js',
            description: 'Modèle Vue.js avec des outils modernes et des pratiques éprouvées.',
          },
          angular: {
            name: 'Base Angular',
            description: 'Modèle Angular moderne avec TypeScript et une configuration fondée sur les bonnes pratiques.',
          },
          solidjs: {
            name: 'SolidJS Tailwind',
            description: 'Modèle SolidJS léger pour créer des sites statiques rapides.',
          },
        },
        categories: {
          api: 'API et services applicatifs',
          mobile: 'Mobile',
          'ml-ai': 'IA et ML',
          starter: 'Kits de démarrage',
          web: 'Applications web',
        },
      },
    },
    dataSettings: {
      common: {
        cancel: 'Annuler',
        exportSelected: 'Exporter la sélection',
        exportAll: 'Tout exporter',
        exporting: 'Exportation…',
        importing: 'Importation…',
        deleting: 'Suppression…',
        resetting: 'Réinitialisation…',
        downloading: 'Téléchargement…',
        download: 'Télécharger',
      },
      sharedDialog: {
        close: 'Fermer',
        confirm: 'Confirmer',
        cancel: 'Annuler',
        save: 'Enregistrer',
        selectionDescription: 'Sélectionnez les éléments à inclure, puis choisissez {action}.',
        selectionSummary_one: '{selected} élément sélectionné sur {total}',
        selectionSummary_other: '{selected} éléments sélectionnés sur {total}',
        selectAll: 'Tout sélectionner',
        deselectAll: 'Tout désélectionner',
        noItems: 'Aucun élément à afficher',
      },
      categories: {
        core: { label: 'Paramètres principaux', description: 'Profil utilisateur et paramètres principaux' },
        providers: { label: 'Fournisseurs', description: 'Clés API et configuration des fournisseurs' },
        features: { label: 'Fonctionnalités', description: 'Options et paramètres des fonctionnalités' },
        ui: { label: 'Interface', description: 'Configuration et préférences de l’interface' },
        connections: { label: 'Connexions', description: 'Connexions aux services externes' },
        debug: { label: 'Débogage', description: 'Paramètres et journaux de débogage' },
        updates: { label: 'Mises à jour', description: 'Paramètres de mise à jour et notifications' },
      },
      dialogs: {
        resetSettingsTitle: 'Réinitialiser tous les paramètres ?',
        resetSettingsDescription:
          'Tous vos paramètres seront rétablis à leurs valeurs par défaut. Cette action est irréversible.',
        resetSettingsConfirm: 'Réinitialiser les paramètres',
        deleteChatsTitle: 'Supprimer toutes les conversations ?',
        deleteChatsDescription:
          'Tout votre historique de conversation sera définitivement supprimé. Cette action est irréversible.',
        deleteChatsConfirm: 'Tout supprimer',
        selectSettingsTitle: 'Sélectionner les paramètres à exporter',
        selectChatsTitle: 'Sélectionner les conversations à exporter',
      },
      chats: {
        sectionTitle: 'Conversations',
        fallbackLabel: 'Conversation {id}',
        messages_one: '{count} message',
        messages_other: '{count} messages',
        updated: '{messages} — dernière mise à jour : {date}',
        databaseOpenFailed:
          'Impossible d’ouvrir la base de données de l’historique. L’exportation et l’importation des conversations sont indisponibles. Essayez de recharger la page.',
        databaseLoading: 'Chargement de la base de données des conversations…',
        exportAllTitle: 'Exporter toutes les conversations',
        exportAllDescription: 'Exportez toutes vos conversations dans un fichier JSON.',
        noChatsToExport: 'Aucune conversation à exporter',
        exportSelectedTitle: 'Exporter certaines conversations',
        exportSelectedDescription: 'Choisissez les conversations à exporter.',
        selectChats: 'Sélectionner des conversations',
        importTitle: 'Importer des conversations',
        importDescription: 'Importez des conversations depuis un fichier JSON.',
        importAction: 'Importer des conversations',
        deleteTitle: 'Supprimer toutes les conversations',
        deleteDescription: 'Supprimez tout votre historique de conversation.',
        deleteAction: 'Tout supprimer',
      },
      settings: {
        sectionTitle: 'Paramètres',
        exportAllTitle: 'Exporter tous les paramètres',
        exportAllDescription: 'Exportez tous vos paramètres dans un fichier JSON.',
        exportSelectedTitle: 'Exporter certains paramètres',
        exportSelectedDescription: 'Choisissez les paramètres à exporter.',
        selectSettings: 'Sélectionner des paramètres',
        importTitle: 'Importer des paramètres',
        importDescription: 'Importez des paramètres depuis un fichier JSON.',
        importAction: 'Importer des paramètres',
        resetTitle: 'Réinitialiser tous les paramètres',
        resetDescription: 'Rétablissez tous les paramètres à leurs valeurs par défaut.',
        resetAction: 'Tout réinitialiser',
      },
      apiKeys: {
        sectionTitle: 'Clés API',
        downloadTitle: 'Télécharger le modèle',
        downloadDescription: 'Téléchargez un fichier modèle pour vos clés API.',
        importTitle: 'Importer des clés API',
        importDescription: 'Importez des clés API depuis un fichier JSON.',
        importAction: 'Importer les clés',
      },
      visualization: {
        sectionTitle: 'Utilisation des données',
        chatsCreated: 'Conversations créées',
        messagesByRole: 'Messages par rôle',
        chatHistory: 'Historique des conversations',
        messageDistribution: 'Répartition des messages',
        noDataTitle: 'Aucune donnée disponible',
        noDataDescription:
          'Commencez une conversation pour afficher vos statistiques d’utilisation et la visualisation des données.',
        totalChats: 'Total des conversations',
        totalMessages: 'Total des messages',
        averageMessages: 'Moyenne de messages par conversation',
        roles: { user: 'Utilisateur', assistant: 'Assistant', system: 'Système', tool: 'Outil' },
      },
      feedback: {
        databaseUnavailable: 'Base de données indisponible',
        noChatsAvailable: 'Aucune conversation disponible à l’exportation',
        reloadChatsFailed: 'Impossible de recharger les conversations',
        loadChatsFailed: 'Impossible de charger les conversations',
        noSettingsCategories: 'Aucune catégorie de paramètres sélectionnée',
        noChatsSelected: 'Aucune conversation sélectionnée',
      },
      operations: {
        errorWithDetail: '{message} : {detail}',
        progressWithPercent: '{message} ({percent})',
        technical: {
          databaseInitialization: 'Échec de l’initialisation de la base de données',
          invalidChatData: 'Format des données de conversation non valide',
          importTransactionAborted: 'Transaction d’importation interrompue',
          apiKeyExportRequestFailed: 'Échec de la requête d’exportation des clés API',
          undoRestoreTransactionAborted: 'Transaction de restauration interrompue',
        },
        loading: {
          preparingSettingsExport: 'Préparation de l’exportation des paramètres…',
          preparingSelectedSettings_one: 'Préparation de l’exportation de {count} catégorie de paramètres…',
          preparingSelectedSettings_other: 'Préparation de l’exportation de {count} catégories de paramètres…',
          preparingChatsExport: 'Préparation de l’exportation des conversations…',
          preparingSelectedChats_one: 'Préparation de l’exportation de {count} conversation…',
          preparingSelectedChats_other: 'Préparation de l’exportation de {count} conversations…',
          importingSettings: 'Importation des paramètres depuis {file}…',
          importingChats: 'Importation des conversations depuis {file}…',
          importingApiKeys: 'Importation des clés API depuis {file}…',
          resettingSettings: 'Réinitialisation des paramètres…',
          deletingChats: 'Suppression de toutes les conversations…',
          creatingApiKeysTemplate: 'Création du modèle de clés API…',
          exportingApiKeys: 'Exportation des clés API…',
          processingUndo: 'Annulation de la dernière opération…',
        },
        progress: {
          exportingSettings: 'Exportation des paramètres',
          creatingFile: 'Création du fichier',
          downloadingFile: 'Téléchargement du fichier',
          completingExport: 'Finalisation de l’exportation',
          filteringCategories: 'Filtrage des catégories sélectionnées',
          retrievingChats: 'Récupération des conversations dans la base de données',
          readingFile: 'Lecture du fichier',
          parsingSettings: 'Analyse des données de paramètres',
          validatingSettings: 'Validation des données de paramètres',
          applyingSettings: 'Application des paramètres',
          completingImport: 'Finalisation de l’importation',
          parsingChats: 'Analyse des données de conversation',
          validatingChats: 'Validation des données de conversation',
          preparingTransaction: 'Préparation de la transaction de base de données',
          importingChats_one: 'Importation de {count} conversation',
          importingChats_other: 'Importation de {count} conversations',
          importedChats_one: '{processed} conversation importée sur {total}',
          importedChats_other: '{processed} conversations importées sur {total}',
          parsingApiKeys: 'Analyse des données de clés API',
          validatingApiKeys: 'Validation des données de clés API',
          applyingApiKeys: 'Application des clés API',
          backingUpSettings: 'Sauvegarde des paramètres actuels',
          resettingDefaults: 'Rétablissement des paramètres par défaut',
          completingReset: 'Finalisation de la réinitialisation',
          backingUpChats: 'Sauvegarde des conversations actuelles',
          deletingChats: 'Suppression des conversations de la base de données',
          completingDeletion: 'Finalisation de la suppression',
          creatingTemplate: 'Création du modèle',
          downloadingTemplate: 'Téléchargement du modèle',
          completingDownload: 'Finalisation du téléchargement',
          retrievingApiKeys: 'Récupération des clés API',
        },
        success: {
          settingsExported: 'Paramètres exportés',
          settingsCategoriesExported_one: '{count} catégorie de paramètres exportée',
          settingsCategoriesExported_other: '{count} catégories de paramètres exportées',
          chatsExported_one: '{count} conversation exportée',
          chatsExported_other: '{count} conversations exportées',
          settingsImported: 'Paramètres importés',
          chatsImported_one: '{count} conversation importée',
          chatsImported_other: '{count} conversations importées',
          invalidChatsSkipped_one: '{count} conversation non valide ignorée',
          invalidChatsSkipped_other: '{count} conversations non valides ignorées',
          apiKeysImported_one: '{count} clé API importée',
          apiKeysImported_other: '{count} clés API importées',
          apiKeysUpdated_one: '{count} clé nouvelle ou mise à jour',
          apiKeysUpdated_other: '{count} clés nouvelles ou mises à jour',
          apiKeysStorageNote:
            'Les clés sont stockées dans les cookies du navigateur. Pour les utiliser côté serveur, ajoutez-les à votre fichier .env.local.',
          settingsReset: 'Paramètres réinitialisés',
          chatsDeleted: 'Toutes les conversations ont été supprimées',
          templateDownloaded: 'Modèle téléchargé',
          apiKeysExported: 'Clés API exportées',
          operationUndone: 'Opération annulée',
        },
        errors: {
          exportSettings: 'Impossible d’exporter les paramètres',
          exportChats: 'Impossible d’exporter les conversations',
          exportSelectedChats: 'Impossible d’exporter les conversations sélectionnées',
          importSettings: 'Impossible d’importer les paramètres',
          importChats: 'Impossible d’importer les conversations',
          importApiKeys: 'Impossible d’importer les clés API',
          resetSettings: 'Impossible de réinitialiser les paramètres',
          deleteChats: 'Impossible de supprimer les conversations',
          downloadTemplate: 'Impossible de télécharger le modèle',
          exportApiKeys: 'Impossible d’exporter les clés API',
          undo: 'Impossible d’annuler l’opération',
          cannotUndo: 'Cette opération ne peut pas être annulée',
          nothingToUndo: 'Aucune opération à annuler',
        },
      },
    },
  },
} as const satisfies LocalizedShape<typeof searchDataSettingsEn>;

export type SearchCopy = LocalizedShape<typeof searchDataSettingsEn.searchDataSettings.search>;
export type DataSettingsCopy = LocalizedShape<typeof searchDataSettingsEn.searchDataSettings.dataSettings>;
export type DataOperationsCopy = DataSettingsCopy['operations'];
export type DataSettingsInterpolationValue = string | number | bigint;

export function resolveSearchDataSettingsLanguage(language?: string | null): SearchDataSettingsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getSearchCopy(language?: string | null): SearchCopy {
  return resolveSearchDataSettingsLanguage(language) === 'fr'
    ? searchDataSettingsFr.searchDataSettings.search
    : searchDataSettingsEn.searchDataSettings.search;
}

export function getDataSettingsCopy(language?: string | null): DataSettingsCopy {
  return resolveSearchDataSettingsLanguage(language) === 'fr'
    ? searchDataSettingsFr.searchDataSettings.dataSettings
    : searchDataSettingsEn.searchDataSettings.dataSettings;
}

export function interpolateSearchDataSettingsCopy(
  template: string,
  values: Readonly<Record<string, DataSettingsInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];
    return value === undefined ? token : String(value);
  });
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveSearchDataSettingsLanguage(language);
}

export function formatSearchDataSettingsNumber(
  value: number | bigint,
  language?: string | null,
  options?: Intl.NumberFormatOptions,
): string {
  return formatUserAreaNumber(value, options, supportedLanguage(language));
}

export function formatSearchDataSettingsDate(value: Date | string | number, language?: string | null): string {
  return formatUserAreaDate(value, { dateStyle: 'medium' }, supportedLanguage(language)) ?? '—';
}

export function formatSearchDataSettingsDateTime(value: Date | string | number, language?: string | null): string {
  return formatUserAreaDateTime(value, { dateStyle: 'medium', timeStyle: 'short' }, supportedLanguage(language)) ?? '—';
}

export function formatSearchDataSettingsPercent(value: number, language?: string | null): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return formatSearchDataSettingsNumber(normalized / 100, language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
}

export function formatSearchDataSettingsPlural(
  language: string | null | undefined,
  count: number,
  forms: Readonly<{ one: string; other: string }>,
  values: Readonly<Record<string, DataSettingsInterpolationValue>> = {},
): string {
  const locale = resolveSearchDataSettingsLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateSearchDataSettingsCopy(form, {
    ...values,
    count: formatSearchDataSettingsNumber(count, language),
  });
}

/**
 * Technical exception details remain available in logs. French UI deliberately
 * receives only the translated, actionable summary so raw provider/browser
 * messages can never leak English (or secrets) into a French toast.
 */
export function formatDataSettingsOperationError(
  language: string | null | undefined,
  message: string,
  error: unknown,
): string {
  if (resolveSearchDataSettingsLanguage(language) === 'fr') {
    return message;
  }

  const detail = error instanceof Error ? error.message.trim() : '';

  if (!detail) {
    return message;
  }

  return interpolateSearchDataSettingsCopy(getDataSettingsCopy(language).operations.errorWithDetail, {
    message,
    detail,
  });
}
