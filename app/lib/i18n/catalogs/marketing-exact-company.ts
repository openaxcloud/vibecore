import { resolveMarketingLanguage } from './marketing';

export type CareerPerkId = 'remote' | 'wellness' | 'equity' | 'timeOff' | 'learning' | 'tooling';
export type CareerValueId = 'ship' | 'ownership' | 'craft' | 'candor';
export type CareerRoleId = 'fullstack' | 'aiPlatform' | 'infrastructure' | 'productDesign' | 'advocacy' | 'sales';
export type EnterpriseFeatureId = 'sso' | 'quotas' | 'singleTenant' | 'vpc' | 'support' | 'procurement';

interface MarketingExactCompanyCopy {
  exactCareers: {
    hero: { title: string; description: string; openRoles: string; remote: string };
    product: {
      eyebrow: string;
      title: string;
      paragraphs: readonly string[];
      windowLabel: string;
      imageAlt: string;
      caption: string;
    };
    benefits: {
      title: string;
      description: string;
      items: readonly { id: CareerPerkId; title: string; description: string }[];
    };
    roles: {
      title: string;
      description: string;
      apply: string;
      items: readonly {
        id: CareerRoleId;
        title: string;
        team: string;
        location: string;
        type: string;
      }[];
    };
    values: {
      title: string;
      description: string;
      items: readonly { id: CareerValueId; title: string; description: string }[];
    };
    inclusion: { title: string; description: string; paragraphs: readonly string[] };
    cta: { title: string; description: string; contact: string; product: string };
  };
  exactContactSales: {
    validation: {
      nameRequired: string;
      emailRequired: string;
      emailInvalid: string;
      companyRequired: string;
      messageRequired: string;
    };
    mailto: {
      subject: string;
      name: string;
      email: string;
      company: string;
      teamSize: string;
      pagePath: string;
      message: string;
    };
    errors: { submit: string };
    toasts: { title: string; prepared: string; fallback: string };
    hero: { title: string; description: string; badge: string };
    features: {
      title: string;
      items: readonly { id: EnterpriseFeatureId; title: string; description: string }[];
    };
    expectations: { title: string; items: readonly { title: string; description: string }[] };
    success: { title: string; description: string; referencePrefix: string; referenceSuffix: string };
    form: {
      title: string;
      description: string;
      name: string;
      namePlaceholder: string;
      email: string;
      emailPlaceholder: string;
      company: string;
      companyPlaceholder: string;
      teamSize: string;
      teamSizePlaceholder: string;
      developerSuffix: string;
      message: string;
      messagePlaceholder: string;
      submitting: string;
      submit: string;
      consent: string;
    };
  };
}

export type ContactSalesValidationCopy = MarketingExactCompanyCopy['exactContactSales']['validation'];
export type ContactSalesMailtoCopy = MarketingExactCompanyCopy['exactContactSales']['mailto'];

export const marketingExactCompanyEn = {
  exactCareers: {
    hero: {
      title: 'Build the future with us',
      description:
        "We're a small, ambitious team making software creation as natural as describing an idea. Help us put an AI-native development platform in the hands of builders everywhere.",
      openRoles: 'open roles',
      remote: 'Remote-first',
    },
    product: {
      eyebrow: "What you'll build",
      title: 'A platform builders use every day',
      paragraphs: [
        'E-Code pairs an autonomous coding agent with a complete cloud workspace — editor, terminal, live preview, Git, and one-click deploy — so anyone can go from a prompt to a running app in the browser.',
        "You'll work on the product surfaces our users touch every day, from the agent and IDE to the dashboard that ties their projects together. It's real software, shipped to real people, fast.",
      ],
      windowLabel: 'E-Code Dashboard',
      imageAlt: "The E-Code dashboard showing a builder's projects, recent activity and deployments",
      caption: 'The E-Code dashboard: where every project, deploy and teammate comes together.',
    },
    benefits: {
      title: "Why you'll love it here",
      description: 'The support and flexibility to do the best work of your career.',
      items: [
        {
          id: 'remote',
          title: 'Remote-First',
          description:
            'Work from anywhere. We hire across time zones and trust you to do your best work wherever you are.',
        },
        {
          id: 'wellness',
          title: 'Health & Wellness',
          description: 'Comprehensive medical, dental and vision coverage, plus a monthly wellness stipend.',
        },
        {
          id: 'equity',
          title: 'Meaningful Equity',
          description: 'Every team member shares in the upside with a generous equity grant from day one.',
        },
        {
          id: 'timeOff',
          title: 'Flexible Time Off',
          description: 'Unlimited PTO with a four-week minimum we actually encourage you to take.',
        },
        {
          id: 'learning',
          title: 'Learning Budget',
          description: 'An annual budget for courses, conferences, books and anything that helps you grow.',
        },
        {
          id: 'tooling',
          title: 'Latest Tooling',
          description: 'Top-tier hardware and unlimited access to the AI tools we build and use every day.',
        },
      ],
    },
    roles: {
      title: 'Open roles',
      description: "Don't see the perfect fit? We're always glad to meet great people — reach out anyway.",
      apply: 'Apply',
      items: [
        {
          id: 'fullstack',
          title: 'Senior Full-Stack Engineer',
          team: 'Engineering',
          location: 'Remote (Global)',
          type: 'Full-time',
        },
        {
          id: 'aiPlatform',
          title: 'AI Platform Engineer',
          team: 'Engineering',
          location: 'Remote (Global)',
          type: 'Full-time',
        },
        {
          id: 'infrastructure',
          title: 'Infrastructure Engineer, Kubernetes',
          team: 'Engineering',
          location: 'Remote (Global)',
          type: 'Full-time',
        },
        {
          id: 'productDesign',
          title: 'Product Designer',
          team: 'Design',
          location: 'Remote (US / EU)',
          type: 'Full-time',
        },
        {
          id: 'advocacy',
          title: 'Developer Advocate',
          team: 'Go-to-Market',
          location: 'Remote (Global)',
          type: 'Full-time',
        },
        {
          id: 'sales',
          title: 'Founding Account Executive',
          team: 'Go-to-Market',
          location: 'Remote (US)',
          type: 'Full-time',
        },
      ],
    },
    values: {
      title: 'How we work',
      description: 'A few principles that shape how we collaborate, make decisions, and treat each other.',
      items: [
        {
          id: 'ship',
          title: 'Ship to learn',
          description: 'We move fast, put real work in front of users, and let what we learn shape what we build next.',
        },
        {
          id: 'ownership',
          title: 'Default to ownership',
          description: 'Everyone owns outcomes end to end. Titles are loose, responsibility is real.',
        },
        {
          id: 'craft',
          title: 'Craft matters',
          description: 'We sweat the details because the people building software deserve tools that feel right.',
        },
        {
          id: 'candor',
          title: 'Low ego, high candor',
          description: 'We give direct feedback, assume good intent, and care more about the work than being right.',
        },
      ],
    },
    inclusion: {
      title: 'An inclusive place to do your best work',
      description: 'Great products are built by teams with different backgrounds, perspectives and lived experiences.',
      paragraphs: [
        "E-Code is an equal-opportunity employer. We welcome applicants of every race, gender, age, religion, identity, ability and experience, and we're committed to a hiring process that is fair, accessible and free of bias.",
        "Need an accommodation during the interview process? Let us know on your application and we'll make it happen — no questions asked.",
      ],
    },
    cta: {
      title: "Let's talk",
      description:
        "Tell us what you're great at and where you want to grow. We read every message and reply to every candidate.",
      contact: 'Get in touch',
      product: 'Try the product',
    },
  },
  exactContactSales: {
    validation: {
      nameRequired: 'Enter your name.',
      emailRequired: 'Enter your work email.',
      emailInvalid: 'Enter a valid email address.',
      companyRequired: 'Enter your company name.',
      messageRequired: 'Tell us briefly how we can help.',
    },
    mailto: {
      subject: 'E-Code Enterprise inquiry',
      name: 'Name',
      email: 'Work email',
      company: 'Company',
      teamSize: 'Team size',
      pagePath: 'Page path',
      message: 'How can we help?',
    },
    errors: { submit: 'Failed to submit your request.' },
    toasts: {
      title: 'Opening email client',
      prepared: 'Your details were prepared for sales@e-code.ai.',
      fallback: "We couldn't reach the server, so we've prepared your request for sales@e-code.ai instead.",
    },
    hero: {
      title: 'Talk to our sales team',
      description:
        'E-Code Enterprise brings SSO/SAML, custom quotas, single-tenant deployments, VPC peering, and dedicated support to teams shipping software at scale.',
      badge: 'Enterprise plan',
    },
    features: {
      title: 'Built for Enterprise',
      items: [
        {
          id: 'sso',
          title: 'SSO & SAML',
          description: 'Connect Okta, Azure AD, or any SAML 2.0 identity provider with SCIM user provisioning',
        },
        {
          id: 'quotas',
          title: 'Custom Quotas',
          description: 'Tailored compute, workspace, and seat limits sized to how your teams actually build',
        },
        {
          id: 'singleTenant',
          title: 'Single-Tenant',
          description: 'Dedicated, isolated infrastructure for your organization with no shared workloads',
        },
        {
          id: 'vpc',
          title: 'VPC Peering',
          description: 'Private network connectivity so E-Code reaches your internal services securely',
        },
        {
          id: 'support',
          title: 'Dedicated Support',
          description: 'A named account team, priority response SLAs, and direct access to our engineers',
        },
        {
          id: 'procurement',
          title: 'Procurement Ready',
          description: 'Security reviews, custom contracts, invoicing, and DPAs handled by our team',
        },
      ],
    },
    expectations: {
      title: 'What to expect',
      items: [
        {
          title: 'Discovery call',
          description: 'A 30-minute conversation to understand your stack, security needs, and rollout goals',
        },
        {
          title: 'Tailored proposal',
          description: 'Quotas, deployment model, and pricing scoped to your team — no off-the-shelf tiers',
        },
        {
          title: 'Guided pilot',
          description: 'A hands-on trial with onboarding support so your developers can evaluate E-Code live',
        },
        {
          title: 'Rollout & onboarding',
          description: 'SSO wiring, workspace setup, and admin training to get every team productive fast',
        },
      ],
    },
    success: {
      title: 'Request received',
      description: "Thanks for reaching out — we'll get back within 1 business day.",
      referencePrefix: 'Your reference number is',
      referenceSuffix: '— quote it in any follow-up.',
    },
    form: {
      title: 'Contact sales',
      description: "Tell us about your team and we'll be in touch within one business day.",
      name: 'Name',
      namePlaceholder: 'Ada Lovelace',
      email: 'Work email',
      emailPlaceholder: 'you@company.com',
      company: 'Company',
      companyPlaceholder: 'Acme Inc.',
      teamSize: 'Team size',
      teamSizePlaceholder: 'Select team size',
      developerSuffix: 'developers',
      message: 'How can we help?',
      messagePlaceholder: 'Tell us about your use case, security requirements, or timeline.',
      submitting: 'Sending...',
      submit: 'Contact sales',
      consent: "By submitting, you agree to be contacted about E-Code Enterprise. We'll never share your details.",
    },
  },
} as const satisfies MarketingExactCompanyCopy;

export const marketingExactCompanyFr = {
  exactCareers: {
    hero: {
      title: 'Construisez l’avenir avec nous',
      description:
        'Nous formons une équipe resserrée et ambitieuse qui rend la création logicielle aussi naturelle que la description d’une idée. Aidez-nous à mettre une plateforme de développement pensée pour l’IA entre les mains des créateurs du monde entier.',
      openRoles: 'postes à pourvoir',
      remote: 'Télétravail par défaut',
    },
    product: {
      eyebrow: 'Ce que vous construirez',
      title: 'Une plateforme utilisée chaque jour par les créateurs',
      paragraphs: [
        'E-Code associe un agent de programmation autonome à un espace de travail cloud complet — éditeur, terminal, aperçu en direct, Git et déploiement en un clic — pour permettre à chacun de passer d’un prompt à une application fonctionnelle dans son navigateur.',
        'Vous interviendrez sur les surfaces que nos utilisateurs emploient au quotidien, de l’agent et de l’IDE au tableau de bord qui rassemble leurs projets. Du vrai logiciel, livré rapidement à de vraies personnes.',
      ],
      windowLabel: 'Tableau de bord E-Code',
      imageAlt: 'Tableau de bord E-Code affichant les projets, l’activité récente et les déploiements d’un créateur',
      caption: 'Le tableau de bord E-Code réunit chaque projet, déploiement et membre de l’équipe.',
    },
    benefits: {
      title: 'Pourquoi vous aimerez travailler ici',
      description: 'Le soutien et la souplesse nécessaires pour accomplir le meilleur travail de votre carrière.',
      items: [
        {
          id: 'remote',
          title: 'Télétravail par défaut',
          description:
            'Travaillez où vous le souhaitez. Nous recrutons sur plusieurs fuseaux horaires et vous faisons confiance pour donner le meilleur, où que vous soyez.',
        },
        {
          id: 'wellness',
          title: 'Santé et bien-être',
          description: 'Une couverture santé complète, ainsi qu’une allocation mensuelle consacrée au bien-être.',
        },
        {
          id: 'equity',
          title: 'Participation au capital',
          description:
            'Chaque membre de l’équipe bénéficie dès son arrivée d’une participation généreuse à la réussite collective.',
        },
        {
          id: 'timeOff',
          title: 'Congés flexibles',
          description:
            'Des congés illimités, avec un minimum de quatre semaines que nous vous encourageons réellement à prendre.',
        },
        {
          id: 'learning',
          title: 'Budget de formation',
          description:
            'Un budget annuel pour les cours, conférences, livres et tout ce qui contribue à votre progression.',
        },
        {
          id: 'tooling',
          title: 'Outils de pointe',
          description:
            'Du matériel haut de gamme et un accès illimité aux outils d’IA que nous concevons et utilisons chaque jour.',
        },
      ],
    },
    roles: {
      title: 'Postes à pourvoir',
      description:
        'Vous ne trouvez pas le poste idéal ? Nous sommes toujours heureux de rencontrer des personnes remarquables : contactez-nous malgré tout.',
      apply: 'Postuler',
      items: [
        {
          id: 'fullstack',
          title: 'Ingénieur·e logiciel senior — applications complètes',
          team: 'Ingénierie',
          location: 'Télétravail (monde)',
          type: 'Temps plein',
        },
        {
          id: 'aiPlatform',
          title: 'Ingénieur·e plateforme IA',
          team: 'Ingénierie',
          location: 'Télétravail (monde)',
          type: 'Temps plein',
        },
        {
          id: 'infrastructure',
          title: 'Ingénieur·e infrastructure Kubernetes',
          team: 'Ingénierie',
          location: 'Télétravail (monde)',
          type: 'Temps plein',
        },
        {
          id: 'productDesign',
          title: 'Designer produit',
          team: 'Design',
          location: 'Télétravail (États-Unis / UE)',
          type: 'Temps plein',
        },
        {
          id: 'advocacy',
          title: 'Responsable des relations développeurs',
          team: 'Commercialisation',
          location: 'Télétravail (monde)',
          type: 'Temps plein',
        },
        {
          id: 'sales',
          title: 'Responsable grands comptes — équipe fondatrice',
          team: 'Commercialisation',
          location: 'Télétravail (États-Unis)',
          type: 'Temps plein',
        },
      ],
    },
    values: {
      title: 'Notre façon de travailler',
      description:
        'Quelques principes guident notre collaboration, nos décisions et la manière dont nous nous traitons.',
      items: [
        {
          id: 'ship',
          title: 'Livrer pour apprendre',
          description:
            'Nous avançons vite, confrontons notre travail aux utilisateurs et laissons les enseignements guider la suite.',
        },
        {
          id: 'ownership',
          title: 'La responsabilité avant tout',
          description:
            'Chacun assume les résultats de bout en bout. Les titres sont souples, la responsabilité est réelle.',
        },
        {
          id: 'craft',
          title: 'Le soin du détail compte',
          description:
            'Nous soignons chaque détail, car les personnes qui créent des logiciels méritent des outils vraiment agréables.',
        },
        {
          id: 'candor',
          title: 'Peu d’ego, beaucoup de franchise',
          description:
            'Nous donnons des retours directs, présumons les bonnes intentions et privilégions la qualité du travail au besoin d’avoir raison.',
        },
      ],
    },
    inclusion: {
      title: 'Un environnement inclusif pour donner le meilleur de vous-même',
      description:
        'Les meilleurs produits naissent d’équipes aux parcours, points de vue et expériences de vie différents.',
      paragraphs: [
        'E-Code pratique l’égalité des chances. Nous accueillons les candidatures sans distinction d’origine, de genre, d’âge, de religion, d’identité, de handicap ou d’expérience, et nous veillons à proposer un recrutement équitable, accessible et sans biais.',
        'Vous avez besoin d’un aménagement pendant les entretiens ? Indiquez-le dans votre candidature : nous le mettrons en place, sans vous demander de justification.',
      ],
    },
    cta: {
      title: 'Faisons connaissance',
      description:
        'Parlez-nous de vos points forts et de la direction dans laquelle vous souhaitez progresser. Nous lisons chaque message et répondons à chaque candidature.',
      contact: 'Nous contacter',
      product: 'Essayer le produit',
    },
  },
  exactContactSales: {
    validation: {
      nameRequired: 'Saisissez votre nom.',
      emailRequired: 'Saisissez votre adresse e-mail professionnelle.',
      emailInvalid: 'Saisissez une adresse e-mail valide.',
      companyRequired: 'Saisissez le nom de votre entreprise.',
      messageRequired: 'Indiquez brièvement comment nous pouvons vous aider.',
    },
    mailto: {
      subject: 'Demande E-Code Enterprise',
      name: 'Nom',
      email: 'E-mail professionnel',
      company: 'Entreprise',
      teamSize: 'Taille de l’équipe',
      pagePath: 'Page',
      message: 'Comment pouvons-nous vous aider ?',
    },
    errors: { submit: 'Impossible d’envoyer votre demande.' },
    toasts: {
      title: 'Ouverture de votre messagerie',
      prepared: 'Vos informations ont été préparées pour sales@e-code.ai.',
      fallback:
        'Le serveur est momentanément indisponible. Votre demande a été préparée pour sales@e-code.ai afin que vous puissiez l’envoyer par e-mail.',
    },
    hero: {
      title: 'Parlez à notre équipe commerciale',
      description:
        'E-Code Enterprise apporte le SSO/SAML, des quotas personnalisés, des déploiements dédiés, l’appairage VPC et une assistance dédiée aux équipes qui livrent des logiciels à grande échelle.',
      badge: 'Offre Enterprise',
    },
    features: {
      title: 'Conçu pour les entreprises',
      items: [
        {
          id: 'sso',
          title: 'SSO et SAML',
          description:
            'Connectez Okta, Azure AD ou tout fournisseur d’identité SAML 2.0, avec provisionnement des utilisateurs par SCIM',
        },
        {
          id: 'quotas',
          title: 'Quotas personnalisés',
          description:
            'Adaptez les limites de calcul, d’espaces de travail et de licences à la façon dont vos équipes créent réellement',
        },
        {
          id: 'singleTenant',
          title: 'Instance dédiée',
          description: 'Une infrastructure dédiée et isolée pour votre organisation, sans charge de travail partagée',
        },
        {
          id: 'vpc',
          title: 'Appairage VPC',
          description: 'Une connectivité réseau privée pour qu’E-Code accède à vos services internes en toute sécurité',
        },
        {
          id: 'support',
          title: 'Assistance dédiée',
          description:
            'Une équipe de compte attitrée, des délais de réponse prioritaires et un accès direct à nos ingénieurs',
        },
        {
          id: 'procurement',
          title: 'Prêt pour les achats',
          description:
            'Notre équipe prend en charge les audits de sécurité, contrats personnalisés, factures et accords de traitement des données',
        },
      ],
    },
    expectations: {
      title: 'Ce qui vous attend',
      items: [
        {
          title: 'Entretien de découverte',
          description:
            'Un échange de 30 minutes pour comprendre votre environnement technique, vos besoins de sécurité et vos objectifs de déploiement',
        },
        {
          title: 'Proposition sur mesure',
          description:
            'Des quotas, un modèle de déploiement et une tarification adaptés à votre équipe, sans formule standard imposée',
        },
        {
          title: 'Pilote accompagné',
          description:
            'Un essai pratique avec accompagnement à la prise en main pour que vos développeurs évaluent E-Code en conditions réelles',
        },
        {
          title: 'Déploiement et prise en main',
          description:
            'Configuration du SSO et des espaces de travail, puis formation des administrateurs pour rendre chaque équipe rapidement autonome',
        },
      ],
    },
    success: {
      title: 'Demande reçue',
      description: 'Merci de nous avoir contactés. Nous vous répondrons sous un jour ouvré.',
      referencePrefix: 'Votre numéro de référence est',
      referenceSuffix: '— mentionnez-le dans tout échange ultérieur.',
    },
    form: {
      title: 'Contacter l’équipe commerciale',
      description: 'Présentez-nous votre équipe ; nous vous répondrons sous un jour ouvré.',
      name: 'Nom',
      namePlaceholder: 'Camille Martin',
      email: 'E-mail professionnel',
      emailPlaceholder: 'vous@entreprise.fr',
      company: 'Entreprise',
      companyPlaceholder: 'Entreprise SAS',
      teamSize: 'Taille de l’équipe',
      teamSizePlaceholder: 'Sélectionnez la taille de l’équipe',
      developerSuffix: 'développeurs',
      message: 'Comment pouvons-nous vous aider ?',
      messagePlaceholder: 'Décrivez votre cas d’usage, vos exigences de sécurité ou votre calendrier.',
      submitting: 'Envoi en cours…',
      submit: 'Contacter l’équipe commerciale',
      consent:
        'En envoyant ce formulaire, vous acceptez d’être contacté au sujet d’E-Code Enterprise. Nous ne communiquerons jamais vos informations.',
    },
  },
} as const satisfies MarketingExactCompanyCopy;

export function getMarketingExactCompanyCopy(language?: string | null): MarketingExactCompanyCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactCompanyFr : marketingExactCompanyEn;
}
