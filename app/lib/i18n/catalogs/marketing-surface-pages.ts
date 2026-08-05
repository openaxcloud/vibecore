import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export interface MarketingSurfacePageCopy {
  title: string;
  description: string;
  highlights: readonly string[];
  secondaryActionLabel?: string;
}

export const marketingSurfacePageEn = {
  pages: {
    new: {
      title: 'New E-Code Project',
      description:
        'A direct creation route for teams starting a new AI-built application from a prompt, template or import.',
      highlights: ['Natural-language brief', 'Template selection', 'Git/import choices', 'Preview-first validation'],
    },
    home: {
      title: 'Workspace Home',
      description:
        'A signed-in style home surface that routes users to recent work, creation flows, docs and team activity.',
      highlights: ['Recent projects', 'Creation shortcuts', 'Team activity', 'Operational status'],
    },
    'agent-activity': {
      title: 'Agent Activity',
      description:
        'A traceable activity route for AI planning, patch review, command execution and validation outcomes.',
      highlights: ['Prompt history', 'Patch summaries', 'Command results', 'Review checkpoints'],
    },
    apps: {
      title: 'Apps',
      description:
        'The imported E-Code app catalog for internal tools, SaaS surfaces, AI workflows and reusable product kits.',
      highlights: ['Internal tools', 'SaaS starters', 'AI applications', 'Reusable workspace kits'],
    },
    teams: {
      title: 'Teams',
      description:
        'The plural E-Code teams route for organization workspaces, members, roles, billing and governed projects.',
      highlights: ['Members and roles', 'Shared billing', 'Project access', 'Audit-ready review'],
    },
    vnc: {
      title: 'VNC Runtime',
      description:
        'A runtime screen route for desktop-style previews, visual debugging and remote application inspection.',
      highlights: ['Visual runtime access', 'Preview inspection', 'Remote debugging', 'Recoverable session state'],
    },
    analytics: {
      title: 'Analytics',
      description: 'Operational analytics for usage, build velocity, preview health, agent activity and team adoption.',
      highlights: ['Usage signals', 'Preview health', 'Build velocity', 'Team adoption'],
    },
    scalability: {
      title: 'Scalability',
      description:
        'Capacity planning content for teams growing from first project to enterprise runtime and governance needs.',
      highlights: ['Runtime scaling', 'Team growth', 'Release capacity', 'Enterprise controls'],
    },
    education: {
      title: 'Education',
      description: 'Education program guidance for classrooms, bootcamps and universities adopting E-Code safely.',
      highlights: ['Student workspaces', 'Classroom templates', 'Privacy controls', 'Instructor review'],
    },
    'api-sdk': {
      title: 'API SDK',
      description:
        'Typed integration guidance for teams connecting E-Code projects, runtime events and platform automation.',
      highlights: ['Typed clients', 'Runtime events', 'Project automation', 'Webhook-ready contracts'],
    },
    'mobile-apps': {
      title: 'Mobile Apps',
      description:
        'Mobile application delivery paths that connect Expo-style projects, previews and release preparation.',
      highlights: ['Phone previews', 'Tablet workflows', 'Expo starters', 'Release assets'],
    },
    profile: {
      title: 'Profile',
      description: 'A public profile route for builders, projects, community identity and shared E-Code work.',
      highlights: ['Builder identity', 'Shared projects', 'Community context', 'Verified routes'],
    },
    runtimes: {
      title: 'Runtimes',
      description:
        'Runtime choices for generated apps, including browser previews, remote execution and deployment handoff.',
      highlights: ['Browser runtime', 'Remote execution', 'Port mapping', 'Deployment handoff'],
    },
    'runtime-diagnostics': {
      title: 'Runtime Diagnostics',
      description:
        'A diagnostics surface for dependency install, server start, preview rendering and runtime error recovery.',
      highlights: ['Install checks', 'Server health', 'Port detection', 'Error recovery'],
    },
    'search-advanced': {
      title: 'Advanced Search',
      description:
        'Search across projects, files, docs, templates, community content and agent activity with clearer scopes.',
      highlights: ['Project scope', 'File search', 'Docs search', 'Agent context'],
    },
    secrets: {
      title: 'Secrets',
      description:
        'A secure route for environment secrets, provider credentials and runtime-safe configuration practices.',
      highlights: ['Encrypted values', 'Runtime boundaries', 'Provider keys', 'No source leakage'],
    },
    workflows: {
      title: 'Workflows',
      description:
        'Automated development workflows for generation, validation, review, preview and release preparation.',
      highlights: ['Prompt to patch', 'Validation gates', 'Review loops', 'Release preparation'],
    },
    ssh: {
      title: 'SSH Access',
      description: 'Secure shell access guidance for advanced runtime debugging without bypassing team controls.',
      highlights: ['Secure sessions', 'Scoped access', 'Audit context', 'Runtime debugging'],
    },
    'security-scanner': {
      title: 'Security Scanner',
      description: 'Scan generated code, dependencies and configuration for security issues before preview or release.',
      highlights: ['Dependency review', 'Secret detection', 'Config checks', 'Release confidence'],
    },
    dependencies: {
      title: 'Dependencies',
      description:
        'Dependency insight for generated projects, package updates, install failures and runtime compatibility.',
      highlights: ['Package graph', 'Install health', 'Version updates', 'Runtime compatibility'],
    },
    'object-storage': {
      title: 'Object Storage',
      description: 'Object storage planning for uploaded files, generated assets, public media and user content.',
      highlights: ['Uploads', 'Public media', 'Access policies', 'Asset lifecycle'],
    },
    'usage-alerts': {
      title: 'Usage Alerts',
      description: 'Alerting surfaces for spend, runtime limits, AI usage, team quotas and operational thresholds.',
      highlights: ['Spend alerts', 'Runtime limits', 'AI usage', 'Team quotas'],
    },
    'mobile-admin': {
      title: 'Mobile Admin',
      description: 'Admin controls designed for phone and tablet review of projects, team access and platform state.',
      highlights: ['Mobile approvals', 'Team access', 'Project review', 'Operational status'],
    },
    account: {
      title: 'Account',
      description: 'Account-level settings for identity, plan ownership, billing direction and secure product access.',
      highlights: ['Identity', 'Billing context', 'Plan ownership', 'Security settings'],
    },
    cycles: {
      title: 'Cycles',
      description: 'Product cycle planning for prompts, implementation passes, validation gates and release readiness.',
      highlights: ['Planning cycles', 'Build passes', 'Validation gates', 'Release readiness'],
    },
    powerups: {
      title: 'Powerups',
      description: 'Enhancement packs for agents, templates, integrations and runtime capabilities inside E-Code.',
      highlights: ['Agent boosts', 'Template packs', 'Runtime add-ons', 'Integration kits'],
    },
    badges: {
      title: 'Badges',
      description: 'Recognition surfaces for builders, teams, launches, contribution quality and community activity.',
      highlights: ['Builder recognition', 'Launch milestones', 'Quality signals', 'Community proof'],
    },
    subscribe: {
      title: 'Subscribe',
      description: 'A subscription route for plan selection, product updates and ongoing E-Code access.',
      highlights: ['Plan selection', 'Billing path', 'Product updates', 'Account continuity'],
    },
    plans: {
      title: 'Plans',
      description: 'Plan comparison content for individuals, teams and enterprises using the E-Code platform.',
      highlights: ['Individual plan', 'Team plan', 'Enterprise plan', 'Usage controls'],
      secondaryActionLabel: 'View pricing',
    },
    learn: {
      title: 'Learn',
      description: 'Structured learning paths for prompt-to-app delivery, runtimes, security and team workflows.',
      highlights: ['First project', 'Runtime basics', 'Security practices', 'Team delivery'],
    },
    themes: {
      title: 'Themes',
      description:
        'Theme guidance for dark default, light mode, app styling, brand tokens and generated UI consistency.',
      highlights: ['Dark default', 'Light toggle', 'Brand tokens', 'Responsive styling'],
    },
    performance: {
      title: 'Performance',
      description:
        'Performance guidance for generated apps, previews, bundles, runtime start and user-facing responsiveness.',
      highlights: ['Bundle awareness', 'Fast previews', 'Runtime startup', 'Responsive UI'],
    },
    'sso-configuration': {
      title: 'SSO Configuration',
      description: 'Configure enterprise identity, SAML/OIDC handoff, team domains and secure onboarding flows.',
      highlights: ['SAML/OIDC', 'Domain policy', 'Secure onboarding', 'Access audit'],
    },
    'custom-roles': {
      title: 'Custom Roles',
      description: 'Role design for project access, billing administration, security ownership and release approvals.',
      highlights: ['Project roles', 'Billing admins', 'Security owners', 'Release approvers'],
    },
    assistant: {
      title: 'Assistant',
      description:
        'The E-Code assistant route for daily coding help, project context, review support and next actions.',
      highlights: ['Project-aware help', 'Code suggestions', 'Review support', 'Next actions'],
    },
    'code-search': {
      title: 'Code Search',
      description: 'Code search across generated files, templates, dependencies and team-owned project repositories.',
      highlights: ['File search', 'Symbol discovery', 'Template lookup', 'Team context'],
    },
    problems: {
      title: 'Problems',
      description:
        'A diagnostics route for TypeScript errors, runtime failures, dependency issues and preview blockers.',
      highlights: ['Type errors', 'Runtime failures', 'Dependency issues', 'Preview blockers'],
    },
    database: {
      title: 'Database',
      description: 'Database planning and implementation guidance for generated apps with real schemas and migrations.',
      highlights: ['Schema design', 'Migrations', 'Seed data', 'Query safety'],
    },
    console: {
      title: 'Console',
      description: 'A product console route for commands, status output, runtime logs and operational actions.',
      highlights: ['Command output', 'Runtime logs', 'Operational actions', 'Status visibility'],
    },
    shell: {
      title: 'Shell',
      description: 'Shell workflow guidance for controlled command execution inside an E-Code project environment.',
      highlights: ['Command execution', 'Environment context', 'Log capture', 'Safe recovery'],
    },
    packages: {
      title: 'Packages',
      description:
        'Package management content for dependencies, workspace packages, version updates and install diagnostics.',
      highlights: ['Workspace packages', 'Dependency versions', 'Install diagnostics', 'Update paths'],
    },
    'kv-store': {
      title: 'KV Store',
      description: 'Key-value storage guidance for sessions, feature flags, lightweight state and edge-ready products.',
      highlights: ['Session state', 'Feature flags', 'Edge data', 'Low-latency reads'],
    },
    preview: {
      title: 'Preview',
      description: 'Preview validation for generated apps, visual QA, route checks and runtime readiness.',
      highlights: ['Visual QA', 'Route checks', 'Runtime readiness', 'Shareable review'],
    },
    authentication: {
      title: 'Authentication',
      description: 'Authentication architecture for generated apps, from passwords and OAuth to enterprise SSO.',
      highlights: ['Password auth', 'OAuth', 'Session security', 'Enterprise SSO'],
    },
    extensions: {
      title: 'Extensions',
      description: 'Extension points for project tools, data connectors, automations and approved agent capabilities.',
      highlights: ['Tool extensions', 'Data connectors', 'Agent capabilities', 'Approval controls'],
    },
    integrations: {
      title: 'Integrations',
      description: 'Connect source control, deployment providers, databases, AI providers and operational systems.',
      highlights: ['Source control', 'Deployment providers', 'Databases', 'AI providers'],
    },
    networking: {
      title: 'Networking',
      description:
        'Networking guidance for exposed ports, preview URLs, custom domains and secure runtime connectivity.',
      highlights: ['Port mapping', 'Preview URLs', 'Custom domains', 'Secure connectivity'],
    },
    threads: {
      title: 'Threads',
      description: 'Discussion threads for project review, agent decisions, team questions and release coordination.',
      highlights: ['Project discussion', 'Agent decisions', 'Review questions', 'Release coordination'],
    },
    referrals: {
      title: 'Referrals',
      description: 'Referral and invite flows for bringing builders, teams and partners into E-Code workspaces.',
      highlights: ['Builder invites', 'Team referrals', 'Partner paths', 'Community growth'],
    },
    'solartech-ai-chat': {
      title: 'SolarTech AI Chat',
      description:
        'A real app route for the imported SolarTech AI chat template with support, sales and workflow patterns.',
      highlights: ['AI chat UX', 'Support workflows', 'Knowledge routing', 'Template-ready app'],
    },
    'solartech-crm': {
      title: 'SolarTech CRM',
      description:
        'A CRM app template route for pipeline management, accounts, opportunities and operational workflows.',
      highlights: ['Pipeline views', 'Accounts', 'Opportunities', 'Operational dashboards'],
    },
    'salesforcepro-crm': {
      title: 'SalesforcePro CRM',
      description:
        'An enterprise CRM template route adapted from E-Code for sales operations and account intelligence.',
      highlights: ['Sales operations', 'Account intelligence', 'Team workflows', 'Executive reporting'],
    },
    'solartech-fortune500-store': {
      title: 'SolarTech Fortune 500 Store',
      description: 'A commerce and procurement app route for enterprise catalogs, approvals and customer buying flows.',
      highlights: ['Enterprise catalog', 'Procurement approvals', 'Commerce UX', 'Customer workflows'],
    },
    'advanced/mobile': {
      title: 'Advanced Mobile',
      description: 'Advanced mobile delivery for responsive IDE surfaces, app assets, previews and release workflows.',
      highlights: ['Responsive IDE', 'App assets', 'Mobile previews', 'Release workflows'],
    },
    'advanced/sso': {
      title: 'Advanced SSO',
      description: 'Advanced identity architecture for enterprise SAML/OIDC, SCIM, domains and role mapping.',
      highlights: ['SAML/OIDC', 'SCIM', 'Domain controls', 'Role mapping'],
    },
    'advanced/collaboration': {
      title: 'Advanced Collaboration',
      description:
        'Team collaboration patterns for review threads, shared context, access controls and release coordination.',
      highlights: ['Review threads', 'Shared context', 'Access controls', 'Release coordination'],
    },
    'advanced/storage': {
      title: 'Advanced Storage',
      description:
        'Storage architecture for generated apps, object buckets, KV data, database files and media lifecycle.',
      highlights: ['Object buckets', 'KV data', 'Database files', 'Media lifecycle'],
    },
    'advanced/community': {
      title: 'Advanced Community',
      description: 'Community architecture for posts, profiles, moderation, templates and builder discovery.',
      highlights: ['Profiles', 'Posts', 'Moderation', 'Builder discovery'],
    },
    'ai-agent/studio': {
      title: 'AI Agent Studio',
      description: 'A studio route for planning, supervising and validating E-Code AI agent work inside real projects.',
      highlights: ['Prompt planning', 'Tool boundaries', 'Patch review', 'Preview-aware validation'],
    },
    'editor/new': {
      title: 'New Editor Session',
      description: 'Start a fresh editor session for an E-Code project, prompt or imported workspace.',
      highlights: ['Fresh workspace', 'Prompt context', 'File editor', 'Preview handoff'],
    },
    'teams/new': {
      title: 'New Team',
      description: 'Create a new E-Code team workspace with members, roles, billing context and project governance.',
      highlights: ['Team creation', 'Member invites', 'Role planning', 'Shared billing'],
    },
    'user/settings': {
      title: 'User Settings',
      description: 'Personal settings for identity, notifications, editor defaults and connected E-Code accounts.',
      highlights: ['Identity settings', 'Notifications', 'Editor defaults', 'Connected accounts'],
    },
  },
} as const satisfies { pages: Record<string, MarketingSurfacePageCopy> };

export const marketingSurfacePageFr = {
  pages: {
    new: {
      title: 'Nouveau projet E-Code',
      description:
        'Une page de création directe pour les équipes qui lancent une nouvelle application conçue par l’IA à partir d’un prompt, d’un modèle ou d’un import.',
      highlights: [
        'Cahier des charges en langage naturel',
        'Sélection d’un modèle',
        'Choix Git ou import',
        'Validation par l’aperçu',
      ],
    },
    home: {
      title: 'Accueil de l’espace de travail',
      description:
        'Une page d’accueil pour les utilisateurs connectés, qui donne accès aux travaux récents, aux parcours de création, à la documentation et à l’activité de l’équipe.',
      highlights: ['Projets récents', 'Raccourcis de création', 'Activité de l’équipe', 'État opérationnel'],
    },
    'agent-activity': {
      title: 'Activité de l’agent',
      description:
        'Un suivi traçable de la planification par l’IA, de la revue des patchs, de l’exécution des commandes et des résultats de validation.',
      highlights: [
        'Historique des prompts',
        'Synthèses des patchs',
        'Résultats des commandes',
        'Points de contrôle de la revue',
      ],
    },
    apps: {
      title: 'Applications',
      description:
        'Le catalogue d’applications E-Code importé pour les outils internes, les interfaces SaaS, les flux de travail IA et les kits produit réutilisables.',
      highlights: ['Outils internes', 'Socles SaaS', 'Applications IA', 'Kits d’espace de travail réutilisables'],
    },
    teams: {
      title: 'Équipes',
      description:
        'La page E-Code consacrée aux espaces de travail des organisations, aux membres, aux rôles, à la facturation et aux projets gouvernés.',
      highlights: ['Membres et rôles', 'Facturation partagée', 'Accès aux projets', 'Revue auditable'],
    },
    vnc: {
      title: 'Environnement VNC',
      description:
        'Une page d’exécution pour les aperçus de type bureau, le débogage visuel et l’inspection des applications à distance.',
      highlights: [
        'Accès visuel à l’environnement',
        'Inspection de l’aperçu',
        'Débogage à distance',
        'État de session récupérable',
      ],
    },
    analytics: {
      title: 'Analyses',
      description:
        'Des analyses opérationnelles sur l’utilisation, la vélocité de développement, la santé des aperçus, l’activité des agents et l’adoption par les équipes.',
      highlights: [
        'Indicateurs d’utilisation',
        'Santé des aperçus',
        'Vélocité de développement',
        'Adoption par les équipes',
      ],
    },
    scalability: {
      title: 'Scalabilité',
      description:
        'Des repères de planification de capacité pour accompagner les équipes, du premier projet aux exigences d’exécution et de gouvernance des entreprises.',
      highlights: [
        'Mise à l’échelle des environnements',
        'Croissance des équipes',
        'Capacité de livraison',
        'Contrôles d’entreprise',
      ],
    },
    education: {
      title: 'Éducation',
      description:
        'Des recommandations destinées aux classes, aux formations intensives et aux universités qui adoptent E-Code en toute sécurité.',
      highlights: [
        'Espaces de travail étudiants',
        'Modèles pour la classe',
        'Contrôles de confidentialité',
        'Revue par les enseignants',
      ],
    },
    'api-sdk': {
      title: 'SDK d’API',
      description:
        'Des recommandations d’intégration typée pour les équipes qui relient les projets E-Code, les événements d’exécution et les automatisations de la plateforme.',
      highlights: [
        'Clients typés',
        'Événements d’exécution',
        'Automatisation des projets',
        'Contrats prêts pour les webhooks',
      ],
    },
    'mobile-apps': {
      title: 'Applications mobiles',
      description:
        'Des parcours de livraison mobile qui relient les projets de type Expo, les aperçus et la préparation des versions.',
      highlights: ['Aperçus sur téléphone', 'Flux de travail sur tablette', 'Bases Expo', 'Ressources de publication'],
    },
    profile: {
      title: 'Profil',
      description:
        'Un profil public pour présenter les créateurs, leurs projets, leur identité communautaire et les travaux E-Code partagés.',
      highlights: ['Identité du créateur', 'Projets partagés', 'Contexte communautaire', 'Routes vérifiées'],
    },
    runtimes: {
      title: 'Environnements d’exécution',
      description:
        'Les modes d’exécution des applications générées, notamment les aperçus dans le navigateur, l’exécution à distance et le passage au déploiement.',
      highlights: [
        'Exécution dans le navigateur',
        'Exécution à distance',
        'Mappage des ports',
        'Passage au déploiement',
      ],
    },
    'runtime-diagnostics': {
      title: 'Diagnostic de l’environnement d’exécution',
      description:
        'Une page de diagnostic pour l’installation des dépendances, le démarrage du serveur, le rendu de l’aperçu et la récupération après une erreur d’exécution.',
      highlights: ['Contrôles d’installation', 'Santé du serveur', 'Détection des ports', 'Récupération après erreur'],
    },
    'search-advanced': {
      title: 'Recherche avancée',
      description:
        'Recherchez dans les projets, les fichiers, la documentation, les modèles, les contenus communautaires et l’activité des agents avec des périmètres explicites.',
      highlights: [
        'Périmètre du projet',
        'Recherche de fichiers',
        'Recherche dans la documentation',
        'Contexte de l’agent',
      ],
    },
    secrets: {
      title: 'Secrets',
      description:
        'Une page sécurisée pour les secrets d’environnement, les identifiants des fournisseurs et les pratiques de configuration sûres à l’exécution.',
      highlights: [
        'Valeurs chiffrées',
        'Limites de l’environnement d’exécution',
        'Clés des fournisseurs',
        'Aucune fuite dans le code source',
      ],
    },
    workflows: {
      title: 'Flux de travail',
      description:
        'Des flux de développement automatisés pour la génération, la validation, la revue, l’aperçu et la préparation des versions.',
      highlights: ['Du prompt au patch', 'Barrières de validation', 'Boucles de revue', 'Préparation des versions'],
    },
    ssh: {
      title: 'Accès SSH',
      description:
        'Des recommandations d’accès shell sécurisé pour le débogage avancé des environnements, sans contourner les contrôles de l’équipe.',
      highlights: ['Sessions sécurisées', 'Accès limité', 'Contexte d’audit', 'Débogage de l’environnement'],
    },
    'security-scanner': {
      title: 'Analyseur de sécurité',
      description:
        'Analysez le code généré, les dépendances et la configuration afin de détecter les problèmes de sécurité avant l’aperçu ou la publication.',
      highlights: [
        'Revue des dépendances',
        'Détection des secrets',
        'Contrôles de configuration',
        'Confiance avant publication',
      ],
    },
    dependencies: {
      title: 'Dépendances',
      description:
        'Une vue claire des dépendances des projets générés, des mises à jour de paquets, des échecs d’installation et de la compatibilité d’exécution.',
      highlights: [
        'Graphe des paquets',
        'Santé de l’installation',
        'Mises à jour des versions',
        'Compatibilité d’exécution',
      ],
    },
    'object-storage': {
      title: 'Stockage d’objets',
      description:
        'Planifiez le stockage des fichiers téléversés, des ressources générées, des médias publics et des contenus utilisateur.',
      highlights: ['Téléversements', 'Médias publics', 'Politiques d’accès', 'Cycle de vie des ressources'],
    },
    'usage-alerts': {
      title: 'Alertes d’utilisation',
      description:
        'Des alertes sur les dépenses, les limites d’exécution, l’utilisation de l’IA, les quotas d’équipe et les seuils opérationnels.',
      highlights: ['Alertes de dépenses', 'Limites d’exécution', 'Utilisation de l’IA', 'Quotas des équipes'],
    },
    'mobile-admin': {
      title: 'Administration mobile',
      description:
        'Des contrôles d’administration conçus pour examiner les projets, les accès des équipes et l’état de la plateforme sur téléphone et tablette.',
      highlights: ['Approbations sur mobile', 'Accès des équipes', 'Revue des projets', 'État opérationnel'],
    },
    account: {
      title: 'Compte',
      description:
        'Les paramètres du compte pour l’identité, la gestion de l’offre, la facturation et l’accès sécurisé au produit.',
      highlights: ['Identité', 'Contexte de facturation', 'Gestion de l’offre', 'Paramètres de sécurité'],
    },
    cycles: {
      title: 'Cycles',
      description:
        'Planifiez les cycles produit, des prompts aux passes d’implémentation, aux barrières de validation et à la préparation de la publication.',
      highlights: [
        'Cycles de planification',
        'Passes de développement',
        'Barrières de validation',
        'Préparation de la publication',
      ],
    },
    powerups: {
      title: 'Powerups',
      description:
        'Des packs d’amélioration pour les agents, les modèles, les intégrations et les capacités d’exécution dans E-Code.',
      highlights: ['Améliorations des agents', 'Packs de modèles', 'Extensions d’exécution', 'Kits d’intégration'],
    },
    badges: {
      title: 'Badges',
      description:
        'Des distinctions pour les créateurs, les équipes, les lancements, la qualité des contributions et l’activité communautaire.',
      highlights: [
        'Reconnaissance des créateurs',
        'Étapes de lancement',
        'Signaux de qualité',
        'Preuves communautaires',
      ],
    },
    subscribe: {
      title: 'S’abonner',
      description:
        'Une page d’abonnement pour choisir une offre, suivre les nouveautés du produit et conserver son accès à E-Code.',
      highlights: ['Choix de l’offre', 'Parcours de facturation', 'Nouveautés du produit', 'Continuité du compte'],
    },
    plans: {
      title: 'Offres',
      description:
        'Comparez les offres destinées aux particuliers, aux équipes et aux entreprises qui utilisent la plateforme E-Code.',
      highlights: ['Offre individuelle', 'Offre pour les équipes', 'Offre entreprise', 'Contrôles d’utilisation'],
      secondaryActionLabel: 'Voir les tarifs',
    },
    learn: {
      title: 'Apprendre',
      description:
        'Des parcours d’apprentissage structurés pour passer du prompt à l’application, maîtriser les environnements d’exécution, la sécurité et le travail en équipe.',
      highlights: ['Premier projet', 'Principes de l’exécution', 'Pratiques de sécurité', 'Livraison en équipe'],
    },
    themes: {
      title: 'Thèmes',
      description:
        'Des recommandations pour le thème sombre par défaut, le mode clair, le style des applications, les tokens de marque et la cohérence des interfaces générées.',
      highlights: ['Mode sombre par défaut', 'Bascule en mode clair', 'Tokens de marque', 'Style adaptatif'],
    },
    performance: {
      title: 'Performances',
      description:
        'Des recommandations de performance pour les applications générées, les aperçus, les bundles, le démarrage des environnements et la réactivité visible par les utilisateurs.',
      highlights: ['Maîtrise des bundles', 'Aperçus rapides', 'Démarrage des environnements', 'Interface réactive'],
    },
    'sso-configuration': {
      title: 'Configuration SSO',
      description:
        'Configurez l’identité d’entreprise, la fédération SAML/OIDC, les domaines d’équipe et les parcours d’intégration sécurisés.',
      highlights: ['SAML/OIDC', 'Politique de domaine', 'Intégration sécurisée', 'Audit des accès'],
    },
    'custom-roles': {
      title: 'Rôles personnalisés',
      description:
        'Concevez les rôles liés à l’accès aux projets, à l’administration de la facturation, à la responsabilité de la sécurité et aux approbations de publication.',
      highlights: [
        'Rôles des projets',
        'Administrateurs de facturation',
        'Responsables de la sécurité',
        'Approbateurs des publications',
      ],
    },
    assistant: {
      title: 'Assistant',
      description:
        'La page de l’assistant E-Code pour l’aide quotidienne au développement, le contexte du projet, la revue et les prochaines actions.',
      highlights: ['Aide contextualisée au projet', 'Suggestions de code', 'Aide à la revue', 'Prochaines actions'],
    },
    'code-search': {
      title: 'Recherche dans le code',
      description:
        'Recherchez dans les fichiers générés, les modèles, les dépendances et les dépôts de projets appartenant à l’équipe.',
      highlights: ['Recherche de fichiers', 'Découverte de symboles', 'Recherche de modèles', 'Contexte de l’équipe'],
    },
    problems: {
      title: 'Problèmes',
      description:
        'Une page de diagnostic pour les erreurs TypeScript, les échecs d’exécution, les problèmes de dépendances et les blocages de l’aperçu.',
      highlights: ['Erreurs de typage', 'Échecs d’exécution', 'Problèmes de dépendances', 'Blocages de l’aperçu'],
    },
    database: {
      title: 'Base de données',
      description:
        'Des recommandations de conception et d’implémentation des bases de données pour les applications générées, avec de véritables schémas et migrations.',
      highlights: ['Conception du schéma', 'Migrations', 'Données initiales', 'Sûreté des requêtes'],
    },
    console: {
      title: 'Console',
      description:
        'Une console produit pour les commandes, les sorties d’état, les journaux d’exécution et les actions opérationnelles.',
      highlights: ['Sortie des commandes', 'Journaux d’exécution', 'Actions opérationnelles', 'Visibilité de l’état'],
    },
    shell: {
      title: 'Shell',
      description:
        'Des recommandations pour exécuter des commandes de façon contrôlée dans l’environnement d’un projet E-Code.',
      highlights: [
        'Exécution des commandes',
        'Contexte de l’environnement',
        'Capture des journaux',
        'Récupération sûre',
      ],
    },
    packages: {
      title: 'Paquets',
      description:
        'Gérez les dépendances, les paquets de l’espace de travail, les mises à jour de versions et les diagnostics d’installation.',
      highlights: [
        'Paquets de l’espace de travail',
        'Versions des dépendances',
        'Diagnostics d’installation',
        'Parcours de mise à jour',
      ],
    },
    'kv-store': {
      title: 'Stockage clé-valeur',
      description:
        'Des recommandations de stockage clé-valeur pour les sessions, les feature flags, les états légers et les produits adaptés à l’edge.',
      highlights: ['État des sessions', 'Feature flags', 'Données edge', 'Lectures à faible latence'],
    },
    preview: {
      title: 'Aperçu',
      description:
        'Validez les applications générées grâce à l’assurance qualité visuelle, aux contrôles des routes et à la vérification de l’état de l’environnement d’exécution.',
      highlights: [
        'Assurance qualité visuelle',
        'Contrôles des routes',
        'État de l’environnement',
        'Revue partageable',
      ],
    },
    authentication: {
      title: 'Authentification',
      description:
        'Une architecture d’authentification pour les applications générées, des mots de passe et d’OAuth jusqu’au SSO d’entreprise.',
      highlights: ['Authentification par mot de passe', 'OAuth', 'Sécurité des sessions', 'SSO d’entreprise'],
    },
    extensions: {
      title: 'Extensions',
      description:
        'Des points d’extension pour les outils de projet, les connecteurs de données, les automatisations et les capacités approuvées des agents.',
      highlights: ['Extensions d’outils', 'Connecteurs de données', 'Capacités des agents', 'Contrôles d’approbation'],
    },
    integrations: {
      title: 'Intégrations',
      description:
        'Connectez le contrôle de version, les fournisseurs de déploiement, les bases de données, les fournisseurs d’IA et les systèmes opérationnels.',
      highlights: ['Contrôle de version', 'Fournisseurs de déploiement', 'Bases de données', 'Fournisseurs d’IA'],
    },
    networking: {
      title: 'Réseau',
      description:
        'Des recommandations réseau pour les ports exposés, les URL d’aperçu, les domaines personnalisés et la connectivité sécurisée des environnements.',
      highlights: ['Mappage des ports', 'URL d’aperçu', 'Domaines personnalisés', 'Connectivité sécurisée'],
    },
    threads: {
      title: 'Fils de discussion',
      description:
        'Des fils de discussion pour la revue des projets, les décisions des agents, les questions des équipes et la coordination des publications.',
      highlights: [
        'Discussion sur le projet',
        'Décisions des agents',
        'Questions de revue',
        'Coordination des publications',
      ],
    },
    referrals: {
      title: 'Parrainages',
      description:
        'Des parcours de parrainage et d’invitation pour accueillir des créateurs, des équipes et des partenaires dans les espaces de travail E-Code.',
      highlights: [
        'Invitations de créateurs',
        'Parrainages d’équipes',
        'Parcours partenaires',
        'Croissance de la communauté',
      ],
    },
    'solartech-ai-chat': {
      title: 'SolarTech AI Chat',
      description:
        'Une véritable page d’application pour le modèle de chat IA SolarTech importé, avec des schémas pour l’assistance, la vente et les flux de travail.',
      highlights: [
        'Expérience de chat IA',
        'Flux d’assistance',
        'Routage des connaissances',
        'Application prête à partir d’un modèle',
      ],
    },
    'solartech-crm': {
      title: 'SolarTech CRM',
      description:
        'Un modèle d’application CRM pour gérer le pipeline, les comptes, les opportunités et les flux opérationnels.',
      highlights: ['Vues du pipeline', 'Comptes', 'Opportunités', 'Tableaux de bord opérationnels'],
    },
    'salesforcepro-crm': {
      title: 'SalesforcePro CRM',
      description:
        'Un modèle CRM d’entreprise adapté à E-Code pour les opérations commerciales et la connaissance des comptes.',
      highlights: [
        'Opérations commerciales',
        'Connaissance des comptes',
        'Flux de travail des équipes',
        'Rapports de direction',
      ],
    },
    'solartech-fortune500-store': {
      title: 'SolarTech Fortune 500 Store',
      description:
        'Une page d’application de commerce et d’approvisionnement pour les catalogues d’entreprise, les approbations et les parcours d’achat des clients.',
      highlights: ['Catalogue d’entreprise', 'Approbations des achats', 'Expérience d’achat', 'Parcours clients'],
    },
    'advanced/mobile': {
      title: 'Mobile avancé',
      description:
        'Des fonctions avancées de livraison mobile pour les interfaces IDE adaptatives, les ressources de l’application, les aperçus et les flux de publication.',
      highlights: ['IDE adaptatif', 'Ressources de l’application', 'Aperçus mobiles', 'Flux de publication'],
    },
    'advanced/sso': {
      title: 'SSO avancé',
      description:
        'Une architecture d’identité avancée pour SAML/OIDC, SCIM, les domaines et le mappage des rôles en entreprise.',
      highlights: ['SAML/OIDC', 'SCIM', 'Contrôles des domaines', 'Mappage des rôles'],
    },
    'advanced/collaboration': {
      title: 'Collaboration avancée',
      description:
        'Des pratiques de collaboration en équipe pour les fils de revue, le contexte partagé, les contrôles d’accès et la coordination des publications.',
      highlights: ['Fils de revue', 'Contexte partagé', 'Contrôles d’accès', 'Coordination des publications'],
    },
    'advanced/storage': {
      title: 'Stockage avancé',
      description:
        'Une architecture de stockage pour les applications générées, les buckets d’objets, les données clé-valeur, les fichiers de base de données et le cycle de vie des médias.',
      highlights: ['Buckets d’objets', 'Données clé-valeur', 'Fichiers de base de données', 'Cycle de vie des médias'],
    },
    'advanced/community': {
      title: 'Communauté avancée',
      description:
        'Une architecture communautaire pour les publications, les profils, la modération, les modèles et la découverte des créateurs.',
      highlights: ['Profils', 'Publications', 'Modération', 'Découverte des créateurs'],
    },
    'ai-agent/studio': {
      title: 'Studio d’agents IA',
      description:
        'Un studio pour planifier, superviser et valider le travail des agents IA E-Code dans de véritables projets.',
      highlights: [
        'Planification des prompts',
        'Limites des outils',
        'Revue des patchs',
        'Validation tenant compte de l’aperçu',
      ],
    },
    'editor/new': {
      title: 'Nouvelle session d’éditeur',
      description:
        'Démarrez une nouvelle session d’éditeur pour un projet E-Code, un prompt ou un espace de travail importé.',
      highlights: ['Nouvel espace de travail', 'Contexte du prompt', 'Éditeur de fichiers', 'Passage à l’aperçu'],
    },
    'teams/new': {
      title: 'Nouvelle équipe',
      description:
        'Créez un nouvel espace de travail d’équipe E-Code avec ses membres, ses rôles, son contexte de facturation et la gouvernance de ses projets.',
      highlights: [
        'Création de l’équipe',
        'Invitations des membres',
        'Planification des rôles',
        'Facturation partagée',
      ],
    },
    'user/settings': {
      title: 'Paramètres utilisateur',
      description:
        'Les paramètres personnels de l’identité, des notifications, des réglages par défaut de l’éditeur et des comptes E-Code connectés.',
      highlights: ['Paramètres d’identité', 'Notifications', 'Réglages par défaut de l’éditeur', 'Comptes connectés'],
    },
  },
} as const satisfies {
  pages: Record<keyof typeof marketingSurfacePageEn.pages, MarketingSurfacePageCopy>;
};

export const marketingSurfacePageEnglish = marketingSurfacePageEn.pages;
export const marketingSurfacePageFrench = marketingSurfacePageFr.pages;

export type MarketingSurfacePageSlug = keyof typeof marketingSurfacePageEnglish;

export function getMarketingSurfacePageCopy(
  language: MarketingLanguage | string | null | undefined,
  slug: string,
): MarketingSurfacePageCopy | undefined {
  const locale = resolveMarketingLanguage(language);
  const french = (marketingSurfacePageFrench as Readonly<Record<string, MarketingSurfacePageCopy>>)[slug];
  const english = (marketingSurfacePageEnglish as Readonly<Record<string, MarketingSurfacePageCopy>>)[slug];

  return locale === 'fr' ? (french ?? english) : english;
}
