import { resolveMarketingLanguage } from './marketing';

export type PressBrandAssetId = 'mark' | 'wordmark' | 'colors' | 'guidelines';
export type PressPlatformFactId = 'category' | 'runtime' | 'workflow' | 'reach';
export type PressStoryAngleId = 'agents' | 'cloud' | 'delivery';
export type PressProductShotId = 'ide' | 'git' | 'deploy' | 'dashboard';
export type PressTechnologyId = 'react' | 'typescript' | 'vite' | 'node';
export type SecurityFeatureId = 'encryption' | 'authentication' | 'infrastructure' | 'data';
export type SecurityCertificationId = 'soc2' | 'iso27001' | 'gdpr' | 'ccpa' | 'hipaa' | 'pci';
export type SecurityPracticeId = 'audits' | 'monitoring' | 'response' | 'training';
export type SecurityDataControlId = 'ownership' | 'portability' | 'retention' | 'privacy';
export type AccessibilityCommitmentId = 'perceivable' | 'operable' | 'understandable' | 'robust';
export type AccessibilityConformanceId = 'standard' | 'testing' | 'limitations';
export type AccessibilityTechnologyId =
  | 'voiceOver'
  | 'talkBack'
  | 'orca'
  | 'voiceControl'
  | 'magnifiers'
  | 'voiceAccess';
export type AccessibilityShortcutId = 'tab' | 'activate' | 'escape' | 'arrows';

interface MarketingExactTrustPressCopy {
  exactPress: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    contact: { title: string; description: string };
    screenshots: {
      title: string;
      description: string;
      items: readonly { id: PressProductShotId; label: string; imageAlt: string }[];
      mobile: { label: string; imageAlt: string };
    };
    brand: {
      title: string;
      description: string;
      items: readonly { id: PressBrandAssetId; name: string; description: string; format: string }[];
    };
    stories: {
      title: string;
      description: string;
      items: readonly { id: PressStoryAngleId; title: string; body: string }[];
    };
    facts: {
      title: string;
      items: readonly { id: PressPlatformFactId; label: string; value: string }[];
    };
    about: {
      title: string;
      description: string;
      body: string;
      builtOn: string;
      technologies: readonly { id: PressTechnologyId; name: string }[];
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
  exactSecurity: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    features: {
      title: string;
      items: readonly { id: SecurityFeatureId; title: string; description: string }[];
    };
    certifications: {
      title: string;
      items: readonly { id: SecurityCertificationId; name: string; status: string }[];
    };
    practices: {
      title: string;
      items: readonly { id: SecurityPracticeId; title: string; description: string }[];
    };
    data: {
      title: string;
      cardTitle: string;
      cardDescription: string;
      items: readonly { id: SecurityDataControlId; title: string; description: string }[];
    };
    cta: { title: string; description: string; button: string };
  };
  exactAccessibility: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    commitment: {
      title: string;
      description: string;
      items: readonly { id: AccessibilityCommitmentId; title: string; description: string }[];
    };
    conformance: {
      title: string;
      cardTitle: string;
      cardDescription: string;
      items: readonly { id: AccessibilityConformanceId; title: string; description: string }[];
      imageAlt: string;
      imageCaption: string;
    };
    technologies: {
      title: string;
      description: string;
      items: readonly { id: AccessibilityTechnologyId; name: string; detail: string }[];
    };
    keyboard: {
      title: string;
      description: string;
      items: readonly { id: AccessibilityShortcutId; keys: string; action: string }[];
    };
    report: { title: string; description: string };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
}

export const marketingExactTrustPressEn = {
  exactPress: {
    seo: {
      title: 'Press — E-Code',
      description: 'Access the E-Code press kit, brand assets, verified platform facts and product screenshots.',
      imageAlt: 'E-Code press kit and product media assets',
    },
    hero: {
      title: 'Press & Media',
      description:
        'Everything you need to tell the E-Code story — brand assets, real product captures, and the facts about what the platform does.',
      badge: 'Press Kit',
    },
    contact: {
      title: 'Media inquiries',
      description: 'Reach our press team for interviews, quotes, and assets',
    },
    screenshots: {
      title: 'Product Screenshots',
      description: 'Real captures of the E-Code platform — free to use in coverage. Please credit “E-Code”.',
      items: [
        {
          id: 'ide',
          label: 'AI agent and live cloud IDE',
          imageAlt: 'The E-Code AI agent and live cloud IDE',
        },
        {
          id: 'git',
          label: 'Integrated Git workflow',
          imageAlt: 'The integrated E-Code Git workflow',
        },
        {
          id: 'deploy',
          label: 'One-click deploys',
          imageAlt: 'One-click deployments in E-Code',
        },
        {
          id: 'dashboard',
          label: 'Project dashboard',
          imageAlt: 'The E-Code project dashboard',
        },
      ],
      mobile: { label: 'E-Code on mobile', imageAlt: 'E-Code on mobile' },
    },
    brand: {
      title: 'Brand Assets & Logos',
      description:
        'The official E-Code brand system. Please follow our guidelines when using these — keep the orange accent and IBM Plex type intact, and never recolor the mark.',
      items: [
        {
          id: 'mark',
          name: 'Logo Mark',
          description: 'The E-Code symbol for avatars, favicons, and app icons.',
          format: 'SVG · PNG',
        },
        {
          id: 'wordmark',
          name: 'Wordmark',
          description: 'Full “E-Code” lockup for headers and partner pages.',
          format: 'SVG · PNG',
        },
        {
          id: 'colors',
          name: 'Color & Type',
          description: 'Accent orange #F26207 and the IBM Plex type system.',
          format: 'PDF · ASE',
        },
        {
          id: 'guidelines',
          name: 'Brand Guidelines',
          description: 'Clear-space, do/don’t, and usage rules for the logo.',
          format: 'PDF',
        },
      ],
    },
    stories: {
      title: 'Story Angles',
      description:
        'What makes E-Code worth covering — every angle below is something you can see for yourself in the product.',
      items: [
        {
          id: 'agents',
          title: 'Autonomous multi-agent builds',
          body: 'Describe an app in plain language and watch agents plan, write, run, and fix code in a real workspace — with every step streamed live.',
        },
        {
          id: 'cloud',
          title: 'A full dev environment in the cloud',
          body: 'Each project gets a sandboxed container with an editor, terminal, package manager, and live preview — no local setup required.',
        },
        {
          id: 'delivery',
          title: 'From idea to deployed in one flow',
          body: 'Connect a Git provider, commit from the IDE, and ship to a live URL with one-click deploys — all without leaving the browser.',
        },
      ],
    },
    facts: {
      title: 'Platform Facts',
      items: [
        { id: 'category', label: 'Category', value: 'AI development platform' },
        { id: 'runtime', label: 'Runtime', value: 'Cloud IDE & live workspace' },
        { id: 'workflow', label: 'Workflow', value: 'Prompt → build → deploy' },
        { id: 'reach', label: 'Reach', value: 'Web & mobile' },
      ],
    },
    about: {
      title: 'About E-Code',
      description: 'The AI development platform that turns a prompt into a deployed application',
      body: 'E-Code is an AI-native development platform where anyone can describe an idea in plain language and watch autonomous agents plan, build, run, and deploy a full-stack application in a live cloud IDE. By combining multi-agent reasoning with a real workspace, terminal, and one-click deploys, E-Code closes the gap between intent and shipped software.',
      builtOn: 'Built on',
      technologies: [
        { id: 'react', name: 'React' },
        { id: 'typescript', name: 'TypeScript' },
        { id: 'vite', name: 'Vite' },
        { id: 'node', name: 'Node.js' },
      ],
    },
    cta: {
      title: 'See E-Code for yourself',
      description:
        'The fastest way to understand the story is to build something. Spin up a project and ship it in minutes.',
      primary: 'Get started free',
      secondary: 'Contact press team',
    },
  },
  exactSecurity: {
    seo: {
      title: 'Security — E-Code',
      description: 'Review E-Code security controls, compliance posture, data protection and security practices.',
      imageAlt: 'E-Code security controls and data protection',
    },
    hero: {
      title: 'Enterprise-Grade Security',
      description: 'Your code and data are protected by industry-leading security measures',
      badge: 'SOC 2 Type II Certified',
    },
    features: {
      title: 'Security Features',
      items: [
        {
          id: 'encryption',
          title: 'End-to-End Encryption',
          description: 'All data is encrypted in transit and at rest using industry-standard encryption',
        },
        {
          id: 'authentication',
          title: 'Secure Authentication',
          description: 'Multi-factor authentication and SSO support for enterprise customers',
        },
        {
          id: 'infrastructure',
          title: 'Infrastructure Security',
          description: 'Hosted on secure cloud infrastructure with regular security audits',
        },
        {
          id: 'data',
          title: 'Data Protection',
          description: 'GDPR compliant with strict data protection and privacy policies',
        },
      ],
    },
    certifications: {
      title: 'Compliance & Certifications',
      items: [
        { id: 'soc2', name: 'SOC 2 Type II', status: 'Certified' },
        { id: 'iso27001', name: 'ISO 27001', status: 'Certified' },
        { id: 'gdpr', name: 'GDPR Compliant', status: 'Compliant' },
        { id: 'ccpa', name: 'CCPA Compliant', status: 'Compliant' },
        { id: 'hipaa', name: 'HIPAA', status: 'Available' },
        { id: 'pci', name: 'PCI DSS', status: 'Level 1' },
      ],
    },
    practices: {
      title: 'Our Security Practices',
      items: [
        {
          id: 'audits',
          title: 'Regular Security Audits',
          description: 'Third-party penetration testing and security assessments',
        },
        {
          id: 'monitoring',
          title: '24/7 Monitoring',
          description: 'Continuous monitoring of systems for security threats',
        },
        {
          id: 'response',
          title: 'Incident Response',
          description: 'Dedicated security team with rapid incident response',
        },
        {
          id: 'training',
          title: 'Employee Training',
          description: 'Regular security training for all employees',
        },
      ],
    },
    data: {
      title: 'Data Protection',
      cardTitle: 'Your Data, Your Control',
      cardDescription: 'We believe in transparency and giving you full control over your data',
      items: [
        {
          id: 'ownership',
          title: 'Data Ownership',
          description: 'You retain full ownership of all code and data you create on E-Code',
        },
        {
          id: 'portability',
          title: 'Data Portability',
          description: 'Export your projects and data at any time in standard formats',
        },
        {
          id: 'retention',
          title: 'Data Retention',
          description: 'Clear data retention policies with automatic deletion options',
        },
        {
          id: 'privacy',
          title: 'Privacy Controls',
          description: 'Granular privacy settings to control who can see your projects',
        },
      ],
    },
    cta: {
      title: 'Have a Security Question?',
      description:
        'Learn more about our security practices, compliance certifications, and commitment to protecting your data',
      button: 'Contact Our Security Team',
    },
  },
  exactAccessibility: {
    seo: {
      title: 'Accessibility — E-Code',
      description:
        'Review the E-Code accessibility commitment, WCAG 2.1 AA target, assistive technology support and issue reporting process.',
      imageAlt: 'Accessibility features and assistive technology support in E-Code',
    },
    hero: {
      title: 'Accessibility at E-Code',
      description:
        'We are building a development platform that everyone can use — regardless of ability or the assistive technology they rely on.',
      badge: 'Targeting WCAG 2.1 Level AA',
    },
    commitment: {
      title: 'Our Commitment',
      description:
        'Accessibility is a core part of how we design and build E-Code. We follow the four guiding principles of the Web Content Accessibility Guidelines, and we treat accessibility issues as bugs that deserve the same priority as any other defect.',
      items: [
        {
          id: 'perceivable',
          title: 'Perceivable',
          description: 'Sufficient color contrast, scalable text, and text alternatives for non-text content',
        },
        {
          id: 'operable',
          title: 'Operable',
          description: 'Full keyboard operability, visible focus states, and no time-based traps',
        },
        {
          id: 'understandable',
          title: 'Understandable',
          description: 'Predictable navigation, clear labels, and helpful, consistent error messaging',
        },
        {
          id: 'robust',
          title: 'Robust',
          description: 'Semantic, standards-compliant markup that works with current and future assistive tech',
        },
      ],
    },
    conformance: {
      title: 'Conformance Status',
      cardTitle: 'WCAG 2.1 Level AA',
      cardDescription: 'E-Code aims to conform to Level AA of the Web Content Accessibility Guidelines 2.1.',
      items: [
        {
          id: 'standard',
          title: 'Target Standard',
          description:
            'We measure our product against WCAG 2.1 AA success criteria across the marketing site, dashboard, and the in-browser IDE.',
        },
        {
          id: 'testing',
          title: 'Ongoing Testing',
          description:
            'Automated checks run in our pipeline and are supplemented by manual screen-reader and keyboard-only testing on key user flows.',
        },
        {
          id: 'limitations',
          title: 'Known Limitations',
          description:
            'Some highly interactive editor surfaces are still being improved. Where a gap exists, we document it and prioritize a fix.',
        },
      ],
      imageAlt: 'The E-Code dashboard, navigable end-to-end with a keyboard and screen reader',
      imageCaption: 'The E-Code dashboard — built with semantic landmarks, visible focus, and accessible labels.',
    },
    technologies: {
      title: 'Supported Assistive Technology',
      description: 'We test E-Code against the screen readers and input technologies our developers actually use.',
      items: [
        { id: 'voiceOver', name: 'VoiceOver', detail: 'Built-in macOS and iOS screen reader' },
        { id: 'talkBack', name: 'TalkBack', detail: 'Built-in Android screen reader' },
        { id: 'orca', name: 'Orca', detail: 'Open-source screen reader on Linux desktops' },
        { id: 'voiceControl', name: 'Voice Control', detail: 'Speech-driven navigation and dictation' },
        { id: 'magnifiers', name: 'Screen Magnifiers', detail: 'OS-level zoom and on-screen magnification' },
        { id: 'voiceAccess', name: 'Voice Access', detail: 'Hands-free control on Android and ChromeOS' },
      ],
    },
    keyboard: {
      title: 'Keyboard Navigation',
      description:
        'Every interactive element is reachable and operable with a keyboard alone, with a clear visible focus indicator at all times.',
      items: [
        { id: 'tab', keys: 'Tab / Shift + Tab', action: 'Move forward or backward between interactive elements' },
        { id: 'activate', keys: 'Enter / Space', action: 'Activate buttons, links, and controls' },
        { id: 'escape', keys: 'Esc', action: 'Close dialogs, menus, and overlays' },
        { id: 'arrows', keys: 'Arrow Keys', action: 'Navigate menus, tabs, and list items' },
      ],
    },
    report: {
      title: 'Report an Accessibility Issue',
      description:
        'If you encounter a barrier while using E-Code, we want to hear about it. Please include the page, the assistive technology you were using, and a short description so we can reproduce and resolve it quickly.',
    },
    cta: {
      title: 'Build something everyone can use',
      description:
        'Spin up an accessible workspace in seconds — the same projects, agent, and previews, fully keyboard- and screen-reader-navigable from day one.',
      primary: 'Get started free',
      secondary: 'Open dashboard',
    },
  },
} as const satisfies MarketingExactTrustPressCopy;

export const marketingExactTrustPressFr = {
  exactPress: {
    seo: {
      title: 'Presse — E-Code',
      description:
        'Accédez au dossier de presse E-Code, aux ressources de marque, aux informations vérifiables et aux captures du produit.',
      imageAlt: 'Dossier de presse E-Code et ressources médias du produit',
    },
    hero: {
      title: 'Presse et médias',
      description:
        'Tout ce qu’il vous faut pour raconter l’histoire d’E-Code : ressources de marque, captures réelles du produit et informations sur les capacités de la plateforme.',
      badge: 'Dossier de presse',
    },
    contact: {
      title: 'Demandes des médias',
      description: 'Contactez notre équipe presse pour une interview, une citation ou des ressources',
    },
    screenshots: {
      title: 'Captures du produit',
      description:
        'De véritables captures de la plateforme E-Code, libres d’utilisation dans vos publications. Merci de créditer « E-Code ».',
      items: [
        {
          id: 'ide',
          label: 'Agent IA et IDE cloud en direct',
          imageAlt: 'L’agent IA et l’IDE cloud en direct d’E-Code',
        },
        {
          id: 'git',
          label: 'Parcours Git intégré',
          imageAlt: 'Le parcours Git intégré d’E-Code',
        },
        {
          id: 'deploy',
          label: 'Déploiements en un clic',
          imageAlt: 'Les déploiements en un clic dans E-Code',
        },
        {
          id: 'dashboard',
          label: 'Tableau de bord des projets',
          imageAlt: 'Le tableau de bord des projets E-Code',
        },
      ],
      mobile: { label: 'E-Code sur mobile', imageAlt: 'E-Code sur mobile' },
    },
    brand: {
      title: 'Ressources de marque et logos',
      description:
        'Le système de marque officiel E-Code. Respectez la charte lors de son utilisation : conservez l’accent orange et la typographie IBM Plex, sans jamais recolorer le symbole.',
      items: [
        {
          id: 'mark',
          name: 'Symbole',
          description: 'Le symbole E-Code destiné aux avatars, favicons et icônes d’application.',
          format: 'SVG · PNG',
        },
        {
          id: 'wordmark',
          name: 'Logotype',
          description: 'La composition complète « E-Code » pour les en-têtes et les pages partenaires.',
          format: 'SVG · PNG',
        },
        {
          id: 'colors',
          name: 'Couleurs et typographie',
          description: 'L’orange d’accentuation #F26207 et le système typographique IBM Plex.',
          format: 'PDF · ASE',
        },
        {
          id: 'guidelines',
          name: 'Charte graphique',
          description:
            'Les règles d’espacement, les usages autorisés et interdits, et les consignes relatives au logo.',
          format: 'PDF',
        },
      ],
    },
    stories: {
      title: 'Angles éditoriaux',
      description:
        'Ce qui mérite d’être raconté sur E-Code : chacun des sujets ci-dessous peut être constaté directement dans le produit.',
      items: [
        {
          id: 'agents',
          title: 'Création autonome par plusieurs agents',
          body: 'Décrivez une application en langage naturel et observez les agents planifier, écrire, exécuter et corriger le code dans un véritable espace de travail, avec chaque étape diffusée en direct.',
        },
        {
          id: 'cloud',
          title: 'Un environnement de développement complet dans le cloud',
          body: 'Chaque projet dispose d’un conteneur isolé avec un éditeur, un terminal, un gestionnaire de paquets et un aperçu en direct, sans configuration locale.',
        },
        {
          id: 'delivery',
          title: 'De l’idée au déploiement dans un même parcours',
          body: 'Connectez un fournisseur Git, effectuez vos commits depuis l’IDE et publiez sur une URL en direct grâce au déploiement en un clic, sans quitter le navigateur.',
        },
      ],
    },
    facts: {
      title: 'Informations sur la plateforme',
      items: [
        { id: 'category', label: 'Catégorie', value: 'Plateforme de développement avec IA' },
        { id: 'runtime', label: 'Environnement', value: 'IDE cloud et espace de travail en direct' },
        { id: 'workflow', label: 'Parcours', value: 'Prompt → création → déploiement' },
        { id: 'reach', label: 'Disponibilité', value: 'Web et mobile' },
      ],
    },
    about: {
      title: 'À propos d’E-Code',
      description: 'La plateforme de développement avec IA qui transforme un prompt en application déployée',
      body: 'E-Code est une plateforme de développement native de l’IA où chacun peut décrire une idée en langage naturel et observer des agents autonomes planifier, créer, exécuter et déployer une application complète dans un IDE cloud en direct. En associant le raisonnement multi-agents à un véritable espace de travail, un terminal et des déploiements en un clic, E-Code réduit l’écart entre l’intention et le logiciel livré.',
      builtOn: 'Technologies principales',
      technologies: [
        { id: 'react', name: 'React' },
        { id: 'typescript', name: 'TypeScript' },
        { id: 'vite', name: 'Vite' },
        { id: 'node', name: 'Node.js' },
      ],
    },
    cta: {
      title: 'Découvrez E-Code par vous-même',
      description:
        'La façon la plus rapide de comprendre l’histoire consiste à créer quelque chose. Lancez un projet et livrez-le en quelques minutes.',
      primary: 'Commencer gratuitement',
      secondary: 'Contacter l’équipe presse',
    },
  },
  exactSecurity: {
    seo: {
      title: 'Sécurité — E-Code',
      description:
        'Consultez les contrôles de sécurité, la conformité, la protection des données et les pratiques de sécurité d’E-Code.',
      imageAlt: 'Contrôles de sécurité et protection des données E-Code',
    },
    hero: {
      title: 'Sécurité de niveau entreprise',
      description:
        'Votre code et vos données sont protégés par des mesures de sécurité conformes aux pratiques du secteur',
      badge: 'Certification SOC 2 Type II',
    },
    features: {
      title: 'Fonctionnalités de sécurité',
      items: [
        {
          id: 'encryption',
          title: 'Chiffrement de bout en bout',
          description:
            'Toutes les données sont chiffrées en transit et au repos selon les pratiques reconnues du secteur',
        },
        {
          id: 'authentication',
          title: 'Authentification sécurisée',
          description: 'Authentification multifacteur et prise en charge du SSO pour les clients entreprise',
        },
        {
          id: 'infrastructure',
          title: 'Sécurité de l’infrastructure',
          description: 'Hébergement sur une infrastructure cloud sécurisée soumise à des audits de sécurité réguliers',
        },
        {
          id: 'data',
          title: 'Protection des données',
          description:
            'Conformité au RGPD avec des politiques strictes de protection des données et de confidentialité',
        },
      ],
    },
    certifications: {
      title: 'Conformité et certifications',
      items: [
        { id: 'soc2', name: 'SOC 2 Type II', status: 'Certifié' },
        { id: 'iso27001', name: 'ISO 27001', status: 'Certifié' },
        { id: 'gdpr', name: 'Conformité au RGPD', status: 'Conforme' },
        { id: 'ccpa', name: 'Conformité au CCPA', status: 'Conforme' },
        { id: 'hipaa', name: 'HIPAA', status: 'Disponible' },
        { id: 'pci', name: 'PCI DSS', status: 'Niveau 1' },
      ],
    },
    practices: {
      title: 'Nos pratiques de sécurité',
      items: [
        {
          id: 'audits',
          title: 'Audits de sécurité réguliers',
          description: 'Tests d’intrusion et évaluations de sécurité réalisés par des tiers',
        },
        {
          id: 'monitoring',
          title: 'Surveillance permanente',
          description: 'Surveillance continue des systèmes afin de détecter les menaces de sécurité',
        },
        {
          id: 'response',
          title: 'Réponse aux incidents',
          description: 'Équipe de sécurité dédiée et intervention rapide en cas d’incident',
        },
        {
          id: 'training',
          title: 'Formation des collaborateurs',
          description: 'Formation régulière de tous les collaborateurs aux pratiques de sécurité',
        },
      ],
    },
    data: {
      title: 'Protection des données',
      cardTitle: 'Vos données, votre contrôle',
      cardDescription: 'Nous privilégions la transparence et vous donnons la maîtrise complète de vos données',
      items: [
        {
          id: 'ownership',
          title: 'Propriété des données',
          description: 'Vous conservez la pleine propriété du code et des données que vous créez sur E-Code',
        },
        {
          id: 'portability',
          title: 'Portabilité des données',
          description: 'Exportez vos projets et vos données à tout moment dans des formats standard',
        },
        {
          id: 'retention',
          title: 'Conservation des données',
          description: 'Politiques de conservation claires avec des options de suppression automatique',
        },
        {
          id: 'privacy',
          title: 'Contrôles de confidentialité',
          description: 'Paramètres granulaires permettant de contrôler qui peut consulter vos projets',
        },
      ],
    },
    cta: {
      title: 'Une question sur la sécurité ?',
      description:
        'Découvrez nos pratiques de sécurité, nos certifications de conformité et notre engagement à protéger vos données',
      button: 'Contacter notre équipe de sécurité',
    },
  },
  exactAccessibility: {
    seo: {
      title: 'Accessibilité — E-Code',
      description:
        'Consultez l’engagement d’E-Code en matière d’accessibilité, son objectif WCAG 2.1 AA, les technologies d’assistance prises en charge et la procédure de signalement.',
      imageAlt: 'Fonctionnalités d’accessibilité et technologies d’assistance prises en charge par E-Code',
    },
    hero: {
      title: 'L’accessibilité chez E-Code',
      description:
        'Nous construisons une plateforme de développement utilisable par toutes et tous, quelles que soient leurs capacités ou les technologies d’assistance dont ils dépendent.',
      badge: 'Objectif : niveau AA des WCAG 2.1',
    },
    commitment: {
      title: 'Notre engagement',
      description:
        'L’accessibilité est au cœur de la conception et du développement d’E-Code. Nous suivons les quatre principes directeurs des Règles pour l’accessibilité des contenus Web et traitons les problèmes d’accessibilité comme des anomalies qui méritent la même priorité que tout autre défaut.',
      items: [
        {
          id: 'perceivable',
          title: 'Perceptible',
          description:
            'Contraste suffisant, texte redimensionnable et alternatives textuelles aux contenus non textuels',
        },
        {
          id: 'operable',
          title: 'Utilisable',
          description: 'Utilisation complète au clavier, focus visible et absence de pièges liés au temps',
        },
        {
          id: 'understandable',
          title: 'Compréhensible',
          description: 'Navigation prévisible, libellés clairs et messages d’erreur utiles et cohérents',
        },
        {
          id: 'robust',
          title: 'Robuste',
          description:
            'Balisage sémantique conforme aux standards et compatible avec les technologies d’assistance actuelles et futures',
        },
      ],
    },
    conformance: {
      title: 'État de conformité',
      cardTitle: 'Niveau AA des WCAG 2.1',
      cardDescription: 'E-Code vise le niveau AA des Règles pour l’accessibilité des contenus Web 2.1.',
      items: [
        {
          id: 'standard',
          title: 'Norme visée',
          description:
            'Nous évaluons le produit selon les critères de réussite WCAG 2.1 AA sur le site marketing, le tableau de bord et l’IDE dans le navigateur.',
        },
        {
          id: 'testing',
          title: 'Tests continus',
          description:
            'Les contrôles automatisés de notre pipeline sont complétés par des tests manuels au lecteur d’écran et au clavier sur les principaux parcours.',
        },
        {
          id: 'limitations',
          title: 'Limites connues',
          description:
            'Certaines surfaces très interactives de l’éditeur sont encore en cours d’amélioration. Lorsqu’un écart existe, nous le documentons et donnons la priorité à sa correction.',
        },
      ],
      imageAlt: 'Le tableau de bord E-Code, entièrement utilisable au clavier et avec un lecteur d’écran',
      imageCaption:
        'Le tableau de bord E-Code, construit avec des repères sémantiques, un focus visible et des libellés accessibles.',
    },
    technologies: {
      title: 'Technologies d’assistance prises en charge',
      description:
        'Nous testons E-Code avec les lecteurs d’écran et technologies de saisie réellement utilisés par les développeurs.',
      items: [
        { id: 'voiceOver', name: 'VoiceOver', detail: 'Lecteur d’écran intégré à macOS et iOS' },
        { id: 'talkBack', name: 'TalkBack', detail: 'Lecteur d’écran intégré à Android' },
        {
          id: 'orca',
          name: 'Orca',
          detail: 'Lecteur d’écran à code source ouvert pour les environnements de bureau Linux',
        },
        { id: 'voiceControl', name: 'Voice Control', detail: 'Navigation et dictée commandées par la voix' },
        { id: 'magnifiers', name: 'Loupes d’écran', detail: 'Zoom du système et agrandissement à l’écran' },
        { id: 'voiceAccess', name: 'Voice Access', detail: 'Contrôle mains libres sur Android et ChromeOS' },
      ],
    },
    keyboard: {
      title: 'Navigation au clavier',
      description:
        'Chaque élément interactif est accessible et utilisable uniquement au clavier, avec un indicateur de focus visible en permanence.',
      items: [
        {
          id: 'tab',
          keys: 'Tab / Maj + Tab',
          action: 'Passer à l’élément interactif suivant ou précédent',
        },
        { id: 'activate', keys: 'Entrée / Espace', action: 'Activer les boutons, liens et commandes' },
        { id: 'escape', keys: 'Échap', action: 'Fermer les boîtes de dialogue, menus et superpositions' },
        { id: 'arrows', keys: 'Touches fléchées', action: 'Parcourir les menus, onglets et éléments de liste' },
      ],
    },
    report: {
      title: 'Signaler un problème d’accessibilité',
      description:
        'Si vous rencontrez un obstacle pendant l’utilisation d’E-Code, contactez-nous. Indiquez la page concernée, la technologie d’assistance utilisée et une brève description afin que nous puissions reproduire et corriger rapidement le problème.',
    },
    cta: {
      title: 'Créez un produit utilisable par toutes et tous',
      description:
        'Lancez en quelques secondes un espace de travail accessible : les mêmes projets, le même agent et les mêmes aperçus, entièrement utilisables au clavier et au lecteur d’écran dès le premier jour.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
} as const satisfies MarketingExactTrustPressCopy;

export function getMarketingExactTrustPressCopy(language?: string | null): MarketingExactTrustPressCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactTrustPressFr : marketingExactTrustPressEn;
}
