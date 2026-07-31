import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Enterprise. Declined from the App Builder gabarit, centered on a governed
 * organization rollout of E-Code (SSO, SCIM, roles, audit export, private runtime
 * planning, governed deploys and support). All demo data is fictional and labeled;
 * the one real captured E-Code IDE proof lives on /solutions/app-builder.
 */
export const ENTERPRISE_COPY = {
  en: {
    seo: {
      title: 'Enterprise Rollout with Governance | E-Code',
      description:
        'Roll out E-Code across an engineering organization with SSO, SCIM provisioning, role-based access, audit export, private runtime planning, and governed deploys. A capability-driven rollout, not a template.',
    },
    hero: {
      eyebrow: 'Enterprise rollout for governed engineering teams',
      title: 'Roll out E-Code across your org with identity, governance, and control',
      subtitle:
        'Bring E-Code to a whole engineering organization without giving up control. Connect SSO and SCIM, assign roles, export audit events, plan a private runtime, and keep deployments governed — with the same real, inspectable code your teams already build with.',
      primaryCta: { label: 'Plan your rollout', ariaLabel: 'Plan your E-Code enterprise rollout' },
      secondaryCta: { label: 'See how governance works', ariaLabel: 'See how E-Code governance and controls work' },
      microcopy:
        'Start from the controls your organization already requires. Identity, roles, audit export, and deploy governance stay visible as the rollout expands across teams.',
    },
    languageSwitch: { label: 'Choose the Enterprise page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Northwind Platform',
      brandType: 'Platform engineering',
      nav: ['Members', 'Audit', 'Deploys'],
      eyebrow: 'Organization console',
      title: 'Recent audit events',
      intro:
        'A responsive organization console that surfaces identity, audit events, and controls in one governed view.',
      primaryHeading: 'Recent audit events',
      primaryRows: [
        { label: 'Role changed — Engineering', meta: 'admin · 12:04', status: 'SSO' },
        { label: 'Member provisioned — Platform', meta: 'scim-sync · 11:47' },
        { label: 'Deploy approved — Payments API', meta: 'release-owner · 11:20' },
      ],
      asideHeading: 'Controls',
      asideRows: [
        { label: 'Identity / SSO', value: 'SCIM' },
        { label: 'Audit export', value: 'Enabled' },
        { label: 'Runtime', value: 'Private planning' },
      ],
      asideCta: 'Export audit log',
      disclaimer: 'Inline responsive demonstration · fictional organization data · not a generation record',
      caption: {
        title: 'An org console that reads like a real governed rollout',
        body: 'This inline demonstration shows an audit event feed, identity and control status, and an audit export action in one responsive layout.',
      },
      alt: 'Enterprise organization console demonstration with a recent audit event list and an identity controls panel.',
    },
    problem: {
      eyebrow: 'From ungoverned adoption to a controlled rollout',
      title: 'AI build tools spread fast, then collide with identity, access, and audit requirements',
      intro:
        'A single team can adopt a build tool overnight, but an organization cannot. Security, platform, and compliance need central identity, role boundaries, an audit trail, and control over where code runs and how it ships — before adoption becomes a liability.',
      obstacles: [
        {
          title: 'Identity lives outside the org directory',
          body: 'Standalone accounts and per-team logins sit outside SSO, so joiners and leavers are managed by hand and access never reflects the directory of record.',
        },
        {
          title: 'Access and audit are unaccountable',
          body: 'Without role boundaries and an exportable audit trail, no one can answer who changed what, who approved a deploy, or who can reach which environment.',
        },
        {
          title: 'Runtime and delivery are ungoverned',
          body: 'When any workspace can run anything and ship anywhere, platform teams lose the runtime isolation and deploy controls their environment requires.',
        },
      ],
      bridge:
        'E-Code brings the rollout under existing controls: SSO and SCIM for identity, roles for access, exportable audit events, private runtime planning, and governed deploys — over the same real source code your teams already build with.',
    },
    build: {
      eyebrow: 'One request frames the rollout',
      title: 'Describe the governance, not the plumbing',
      intro:
        'The request below reads like a note from a platform lead. The four items map what a governed rollout provides — identity, governance, controlled delivery, and support — over real infrastructure, not a locked template.',
      label: 'Example prompt',
      promptText:
        'Roll out E-Code across our engineering org with SSO, role-based access, audit export, and governed deployments.',
      outputs: [
        {
          title: 'Identity and provisioning',
          body: 'SSO connects E-Code to your identity provider, and SCIM provisioning keeps membership in sync with the directory as people join, move, and leave.',
        },
        {
          title: 'Governance and access',
          body: 'Role-based access defines who can build, review, and ship, and an exportable audit trail records identity, access, and deploy events for review.',
        },
        {
          title: 'Controlled delivery',
          body: 'Private runtime planning and governed deploys keep where code runs and how it ships under platform-team control across environments.',
        },
        {
          title: 'Rollout support',
          body: 'A guided rollout plan, onboarding for teams, and a support path help the organization adopt E-Code in stages rather than all at once.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same real build loop is what your teams run under the controls described here.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What your organization receives',
      title: 'A governed rollout you administer centrally',
      intro:
        'The rollout stays inspectable and accountable from identity through delivery. Central administration, audit export, and deploy governance sit over the same real source code your teams build with.',
      items: [
        {
          title: 'SSO sign-in',
          body: 'Connect E-Code to your identity provider so access follows your organization’s single sign-on.',
        },
        {
          title: 'SCIM provisioning',
          body: 'Keep membership in sync with your directory as people are added, updated, and deprovisioned.',
        },
        {
          title: 'Role-based access',
          body: 'Assign roles that define who can build, review, deploy, and administer across teams.',
        },
        {
          title: 'Audit export',
          body: 'Export identity, access, and deploy events to your own review and monitoring workflow.',
        },
        {
          title: 'Private runtime planning',
          body: 'Plan isolated runtime for where workspaces execute, scoped to your environment requirements.',
        },
        {
          title: 'Governed deploys and support',
          body: 'Keep deployments under review controls, with a guided rollout and a support path for your teams.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for governed organizations',
      title: 'Everything a platform team needs to administer E-Code at scale',
      intro:
        'The Enterprise path keeps identity, access, audit, and delivery in one administrable workflow over real code.',
      items: [
        {
          title: 'Single sign-on',
          body: 'Bring E-Code access under your identity provider so the directory stays the source of truth.',
        },
        {
          title: 'Directory provisioning',
          body: 'SCIM keeps members and roles aligned with your directory automatically.',
        },
        { title: 'Roles and permissions', body: 'Role boundaries scope who can build, review, ship, and administer.' },
        {
          title: 'Audit trail export',
          body: 'Exportable events for identity, access, and deploys feed your review process.',
        },
        {
          title: 'Runtime isolation planning',
          body: 'Plan private runtime so where code executes matches your environment controls.',
        },
        {
          title: 'Deploy governance',
          body: 'Keep releases under approval controls without hiding the underlying code.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who rolls it out',
      title: 'Organizations that adopt E-Code under governance',
      intro:
        'From a platform team standardizing tooling to a regulated org tightening access, the same controls frame a governed rollout.',
      items: [
        {
          title: 'Platform and infrastructure teams',
          body: 'Standardize how the org builds and ships under central identity and deploy controls.',
        },
        {
          title: 'Security and compliance teams',
          body: 'Enforce SSO, role boundaries, and an exportable audit trail across engineering.',
        },
        {
          title: 'Regulated organizations',
          body: 'Adopt E-Code where access, audit, and runtime control are non-negotiable requirements.',
        },
        {
          title: 'Multi-team engineering orgs',
          body: 'Onboard many teams in stages with roles, provisioning, and governed delivery.',
        },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Enterprise rollout, answered honestly',
      intro: 'What a governed E-Code rollout provides, and where its boundaries are.',
      items: [
        {
          title: 'Does E-Code support SSO and SCIM?',
          body: 'Yes. SSO connects sign-in to your identity provider and SCIM keeps membership in sync with your directory. These are configured as part of a rollout with your platform team.',
        },
        {
          title: 'Can I export an audit trail?',
          body: 'Identity, access, and deploy events can be exported to your own review and monitoring workflow. The inline demonstration on this page uses fictional data and no connected backend.',
        },
        {
          title: 'Is E-Code certified for a specific compliance standard?',
          body: 'We describe SSO, provisioning, audit export, and runtime isolation as capabilities you plan and administer. We do not assert a specific compliance certification on this page — talk to us about your requirements.',
        },
        {
          title: 'Can workspaces run on a private runtime?',
          body: 'Private runtime is a planning capability scoped to your environment. Where and how it applies is defined during the rollout with your platform team rather than assumed by default.',
        },
        {
          title: 'How do deployments stay governed?',
          body: 'Role-based access and deploy controls keep who can ship and how releases proceed under review, over the same real source code your teams build and export.',
        },
      ],
    },
    finalCta: {
      title: 'Plan your governed E-Code rollout',
      body: 'Bring E-Code to your organization under SSO, roles, audit export, private runtime planning, and governed deploys — over the same real source code your teams already build with.',
      primaryCta: { label: 'Plan your rollout', ariaLabel: 'Plan your E-Code enterprise rollout' },
      secondaryCta: { label: 'See how governance works', ariaLabel: 'See how E-Code governance and controls work' },
    },
    aria: {
      pageLabel: 'Enterprise solution page',
      heroLabel: 'Enterprise introduction',
      demoLabel: 'Enterprise product demonstration',
      problemLabel: 'The enterprise rollout problem',
      buildLabel: 'How the Enterprise rollout works',
      outputListLabel: 'Enterprise rollout outputs',
      proofLinkLabel: 'See the real E-Code IDE proof',
      deliverablesLabel: 'What the Enterprise rollout delivers',
      featuresLabel: 'Enterprise capabilities',
      useCasesLabel: 'Enterprise use cases',
      faqLabel: 'Enterprise questions',
      finalCtaLabel: 'Start your enterprise rollout',
    },
  },
  fr: {
    seo: {
      title: 'Déploiement entreprise avec gouvernance | E-Code',
      description:
        'Déployez E-Code dans toute une organisation d’ingénierie avec le SSO, le provisionnement SCIM, des accès par rôle, l’export d’audit, la planification d’un runtime privé et des déploiements gouvernés. Un déploiement piloté par les capacités, pas un template.',
    },
    hero: {
      eyebrow: 'Déploiement entreprise pour des équipes d’ingénierie gouvernées',
      title: 'Déployez E-Code dans toute votre organisation avec identité, gouvernance et contrôle',
      subtitle:
        'Amenez E-Code à toute une organisation d’ingénierie sans renoncer au contrôle. Connectez le SSO et le SCIM, attribuez des rôles, exportez les événements d’audit, planifiez un runtime privé et gardez les déploiements gouvernés — avec le même vrai code inspectable que vos équipes utilisent déjà.',
      primaryCta: { label: 'Planifiez votre déploiement', ariaLabel: 'Planifiez votre déploiement entreprise E-Code' },
      secondaryCta: {
        label: 'Voir la gouvernance',
        ariaLabel: 'Voir comment fonctionnent la gouvernance et les contrôles E-Code',
      },
      microcopy:
        'Partez des contrôles que votre organisation exige déjà. Identité, rôles, export d’audit et gouvernance des déploiements restent visibles à mesure que le déploiement s’étend aux équipes.',
    },
    languageSwitch: { label: 'Choisir la langue de la page Entreprise', english: 'English', french: 'Français' },
    demo: {
      badge: 'Données fictives',
      brand: 'Northwind Platform',
      brandType: 'Ingénierie de plateforme',
      nav: ['Membres', 'Audit', 'Déploiements'],
      eyebrow: 'Console d’organisation',
      title: 'Événements d’audit récents',
      intro:
        'Une console d’organisation responsive qui présente l’identité, les événements d’audit et les contrôles dans une vue gouvernée.',
      primaryHeading: 'Événements d’audit récents',
      primaryRows: [
        { label: 'Rôle modifié — Ingénierie', meta: 'admin · 12:04', status: 'SSO' },
        { label: 'Membre provisionné — Plateforme', meta: 'scim-sync · 11:47' },
        { label: 'Déploiement approuvé — API Paiements', meta: 'release-owner · 11:20' },
      ],
      asideHeading: 'Contrôles',
      asideRows: [
        { label: 'Identité / SSO', value: 'SCIM' },
        { label: 'Export d’audit', value: 'Activé' },
        { label: 'Runtime', value: 'Planification privée' },
      ],
      asideCta: 'Exporter le journal d’audit',
      disclaimer: 'Démonstration responsive intégrée · données d’organisation fictives · pas une trace de génération',
      caption: {
        title: 'Une console d’organisation qui se lit comme un vrai déploiement gouverné',
        body: 'Cette démonstration intégrée présente un flux d’événements d’audit, l’état de l’identité et des contrôles, et une action d’export d’audit dans une mise en page responsive.',
      },
      alt: 'Démonstration de console d’organisation entreprise avec une liste d’événements d’audit récents et un panneau de contrôles d’identité.',
    },
    problem: {
      eyebrow: 'De l’adoption non gouvernée à un déploiement contrôlé',
      title:
        'Les outils de génération IA se répandent vite, puis se heurtent aux exigences d’identité, d’accès et d’audit',
      intro:
        'Une seule équipe peut adopter un outil de génération du jour au lendemain, mais pas une organisation. La sécurité, la plateforme et la conformité ont besoin d’une identité centrale, de frontières de rôles, d’une piste d’audit et du contrôle de l’endroit où le code s’exécute et de la façon dont il est livré — avant que l’adoption ne devienne un risque.',
      obstacles: [
        {
          title: 'L’identité vit hors de l’annuaire',
          body: 'Des comptes autonomes et des connexions par équipe restent hors du SSO, si bien que les arrivées et départs se gèrent à la main et que les accès ne reflètent jamais l’annuaire de référence.',
        },
        {
          title: 'Accès et audit ne sont pas traçables',
          body: 'Sans frontières de rôles ni piste d’audit exportable, personne ne peut dire qui a changé quoi, qui a approuvé un déploiement, ni qui peut atteindre quel environnement.',
        },
        {
          title: 'Runtime et livraison ne sont pas gouvernés',
          body: 'Quand n’importe quel workspace peut tout exécuter et livrer partout, les équipes plateforme perdent l’isolation du runtime et les contrôles de déploiement qu’exige leur environnement.',
        },
      ],
      bridge:
        'E-Code place le déploiement sous les contrôles existants : SSO et SCIM pour l’identité, rôles pour l’accès, événements d’audit exportables, planification d’un runtime privé et déploiements gouvernés — sur le même vrai code source que vos équipes utilisent déjà.',
    },
    build: {
      eyebrow: 'Une demande cadre le déploiement',
      title: 'Décrivez la gouvernance, pas la tuyauterie',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable plateforme. Les quatre éléments cartographient ce qu’un déploiement gouverné fournit — identité, gouvernance, livraison contrôlée et support — sur une vraie infrastructure, pas un template verrouillé.',
      label: 'Exemple de prompt',
      promptText:
        'Déployez E-Code dans toute notre organisation d’ingénierie avec le SSO, des accès par rôle, l’export d’audit et des déploiements gouvernés.',
      outputs: [
        {
          title: 'Identité et provisionnement',
          body: 'Le SSO relie E-Code à votre fournisseur d’identité, et le provisionnement SCIM garde l’appartenance synchronisée avec l’annuaire à mesure que les personnes arrivent, changent et partent.',
        },
        {
          title: 'Gouvernance et accès',
          body: 'Les accès par rôle définissent qui peut construire, relire et livrer, et une piste d’audit exportable enregistre les événements d’identité, d’accès et de déploiement à des fins de revue.',
        },
        {
          title: 'Livraison contrôlée',
          body: 'La planification d’un runtime privé et les déploiements gouvernés maintiennent l’endroit où le code s’exécute et la façon dont il est livré sous le contrôle de l’équipe plateforme, à travers les environnements.',
        },
        {
          title: 'Support au déploiement',
          body: 'Un plan de déploiement guidé, un onboarding des équipes et un canal de support aident l’organisation à adopter E-Code par étapes plutôt que d’un seul coup.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. C’est la même vraie boucle de construction que vos équipes exécutent sous les contrôles décrits ici.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que reçoit votre organisation',
      title: 'Un déploiement gouverné que vous administrez de façon centralisée',
      intro:
        'Le déploiement reste inspectable et traçable de l’identité jusqu’à la livraison. L’administration centrale, l’export d’audit et la gouvernance des déploiements se posent sur le même vrai code source que vos équipes utilisent.',
      items: [
        {
          title: 'Connexion SSO',
          body: 'Reliez E-Code à votre fournisseur d’identité pour que l’accès suive le SSO de votre organisation.',
        },
        {
          title: 'Provisionnement SCIM',
          body: 'Gardez l’appartenance synchronisée avec votre annuaire à mesure que les personnes sont ajoutées, mises à jour et déprovisionnées.',
        },
        {
          title: 'Accès par rôle',
          body: 'Attribuez des rôles qui définissent qui peut construire, relire, déployer et administrer entre les équipes.',
        },
        {
          title: 'Export d’audit',
          body: 'Exportez les événements d’identité, d’accès et de déploiement vers votre propre flux de revue et de supervision.',
        },
        {
          title: 'Planification de runtime privé',
          body: 'Planifiez un runtime isolé pour l’exécution des workspaces, cadré sur les exigences de votre environnement.',
        },
        {
          title: 'Déploiements gouvernés et support',
          body: 'Gardez les déploiements sous contrôles de revue, avec un déploiement guidé et un canal de support pour vos équipes.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour les organisations gouvernées',
      title: 'Tout ce dont une équipe plateforme a besoin pour administrer E-Code à l’échelle',
      intro:
        'Le parcours Entreprise garde identité, accès, audit et livraison dans un seul flux administrable sur du vrai code.',
      items: [
        {
          title: 'Authentification unique',
          body: 'Placez l’accès E-Code sous votre fournisseur d’identité pour que l’annuaire reste la source de vérité.',
        },
        {
          title: 'Provisionnement par annuaire',
          body: 'Le SCIM garde membres et rôles alignés sur votre annuaire automatiquement.',
        },
        {
          title: 'Rôles et permissions',
          body: 'Les frontières de rôles cadrent qui peut construire, relire, livrer et administrer.',
        },
        {
          title: 'Export de piste d’audit',
          body: 'Des événements exportables d’identité, d’accès et de déploiement alimentent votre processus de revue.',
        },
        {
          title: 'Planification d’isolation runtime',
          body: 'Planifiez un runtime privé pour que l’exécution du code corresponde à vos contrôles d’environnement.',
        },
        {
          title: 'Gouvernance des déploiements',
          body: 'Gardez les livraisons sous contrôles d’approbation sans masquer le code sous-jacent.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui le déploie',
      title: 'Les organisations qui adoptent E-Code sous gouvernance',
      intro:
        'D’une équipe plateforme qui standardise l’outillage à une organisation régulée qui resserre les accès, les mêmes contrôles cadrent un déploiement gouverné.',
      items: [
        {
          title: 'Équipes plateforme et infrastructure',
          body: 'Standardisez la façon dont l’organisation construit et livre sous identité centrale et contrôles de déploiement.',
        },
        {
          title: 'Équipes sécurité et conformité',
          body: 'Imposez le SSO, les frontières de rôles et une piste d’audit exportable à toute l’ingénierie.',
        },
        {
          title: 'Organisations régulées',
          body: 'Adoptez E-Code là où l’accès, l’audit et le contrôle du runtime sont des exigences non négociables.',
        },
        {
          title: 'Organisations multi-équipes',
          body: 'Intégrez de nombreuses équipes par étapes avec rôles, provisionnement et livraison gouvernée.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Le déploiement entreprise, en toute honnêteté',
      intro: 'Ce que fournit un déploiement E-Code gouverné, et où sont ses limites.',
      items: [
        {
          title: 'E-Code prend-il en charge le SSO et le SCIM ?',
          body: 'Oui. Le SSO relie la connexion à votre fournisseur d’identité et le SCIM garde l’appartenance synchronisée avec votre annuaire. Ils se configurent dans le cadre d’un déploiement avec votre équipe plateforme.',
        },
        {
          title: 'Puis-je exporter une piste d’audit ?',
          body: 'Les événements d’identité, d’accès et de déploiement peuvent être exportés vers votre propre flux de revue et de supervision. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'E-Code est-il certifié pour une norme de conformité précise ?',
          body: 'Nous décrivons le SSO, le provisionnement, l’export d’audit et l’isolation du runtime comme des capacités que vous planifiez et administrez. Nous n’affirmons pas de certification de conformité précise sur cette page — parlons-en selon vos exigences.',
        },
        {
          title: 'Les workspaces peuvent-ils tourner sur un runtime privé ?',
          body: 'Le runtime privé est une capacité de planification cadrée sur votre environnement. Où et comment il s’applique se définit pendant le déploiement avec votre équipe plateforme, pas par défaut.',
        },
        {
          title: 'Comment les déploiements restent-ils gouvernés ?',
          body: 'Les accès par rôle et les contrôles de déploiement gardent sous revue qui peut livrer et comment les livraisons se déroulent, sur le même vrai code source que vos équipes construisent et exportent.',
        },
      ],
    },
    finalCta: {
      title: 'Planifiez votre déploiement E-Code gouverné',
      body: 'Amenez E-Code à votre organisation sous SSO, rôles, export d’audit, planification d’un runtime privé et déploiements gouvernés — sur le même vrai code source que vos équipes utilisent déjà.',
      primaryCta: { label: 'Planifiez votre déploiement', ariaLabel: 'Planifiez votre déploiement entreprise E-Code' },
      secondaryCta: {
        label: 'Voir la gouvernance',
        ariaLabel: 'Voir comment fonctionnent la gouvernance et les contrôles E-Code',
      },
    },
    aria: {
      pageLabel: 'Page solution Entreprise',
      heroLabel: 'Introduction Entreprise',
      demoLabel: 'Démonstration produit Entreprise',
      problemLabel: 'Le problème du déploiement entreprise',
      buildLabel: 'Comment fonctionne le déploiement Entreprise',
      outputListLabel: 'Résultats du déploiement Entreprise',
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le déploiement Entreprise',
      featuresLabel: 'Capacités Entreprise',
      useCasesLabel: 'Cas d’usage Entreprise',
      faqLabel: 'Questions sur l’Entreprise',
      finalCtaLabel: 'Démarrer votre déploiement entreprise',
    },
  },
} as const satisfies SolutionCopyByLanguage;
