import { resolveMarketingLanguage } from './marketing';

export type SubprocessorId =
  | 'aws'
  | 'gcp'
  | 'cloudflare'
  | 'stripe'
  | 'sendgrid'
  | 'datadog'
  | 'github'
  | 'auth0'
  | 'intercom'
  | 'mongodb';
export type SubprocessorCategoryId =
  | 'infrastructure'
  | 'payments'
  | 'communications'
  | 'analytics'
  | 'development'
  | 'security';

interface MarketingExactSubprocessorsCopy {
  exactSubprocessors: {
    title: string;
    description: string;
    lastUpdated: string;
    commitment: {
      title: string;
      intro: string;
      requirements: readonly string[];
      monitoring: string;
    };
    table: {
      title: string;
      headers: readonly string[];
      viewDetails: string;
      providers: readonly {
        id: SubprocessorId;
        service: string;
        categoryId: SubprocessorCategoryId;
        category: string;
        location: string;
        purpose: string;
      }[];
    };
    dataCenters: {
      title: string;
      regionsTitle: string;
      regions: readonly string[];
      residencyTitle: string;
      residencyDescription: string;
      safeguards: readonly string[];
    };
    updates: {
      title: string;
      intro: string;
      processTitle: string;
      process: readonly string[];
      subscribeTitle: string;
      subscribeDescription: string;
      subscribeAction: string;
      mailSubject: string;
    };
    related: {
      title: string;
      description: string;
      documents: readonly {
        id: 'privacy' | 'dpa' | 'security';
        title: string;
        description: string;
        action: string;
      }[];
    };
    contact: { title: string; description: string; primary: string; secondary: string };
  };
}

export const marketingExactSubprocessorsEn = {
  exactSubprocessors: {
    title: 'Subprocessors',
    description:
      'E-Code partners with industry-leading service providers to deliver a secure, reliable, and performant platform.',
    lastUpdated: 'Last updated',
    commitment: {
      title: 'Our Commitment to Data Protection',
      intro:
        'E-Code carefully selects subprocessors that maintain the highest standards of security and privacy. All subprocessors must:',
      requirements: [
        'Sign data processing agreements that meet GDPR requirements',
        'Implement appropriate technical and organizational measures',
        'Undergo regular security audits and maintain compliance certifications',
        'Limit data processing to the specific purposes outlined below',
        'Delete or return data upon termination of services',
      ],
      monitoring: 'We continuously monitor our subprocessors to ensure they maintain these standards.',
    },
    table: {
      title: 'Current Subprocessors',
      headers: ['Service Provider', 'Category', 'Location', 'Purpose', 'Compliance'],
      viewDetails: 'View details',
      providers: [
        {
          id: 'aws',
          service: 'AWS',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'United States',
          purpose: 'Cloud hosting, storage, and compute services',
        },
        {
          id: 'gcp',
          service: 'GCP',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'United States',
          purpose: 'Cloud services and container hosting',
        },
        {
          id: 'cloudflare',
          service: 'CDN & Security',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'United States',
          purpose: 'Content delivery network and DDoS protection',
        },
        {
          id: 'stripe',
          service: 'Payment Processing',
          categoryId: 'payments',
          category: 'Payments',
          location: 'United States',
          purpose: 'Payment processing and subscription management',
        },
        {
          id: 'sendgrid',
          service: 'Email Service',
          categoryId: 'communications',
          category: 'Communications',
          location: 'United States',
          purpose: 'Transactional email delivery',
        },
        {
          id: 'datadog',
          service: 'Monitoring',
          categoryId: 'analytics',
          category: 'Analytics',
          location: 'United States',
          purpose: 'Application performance monitoring and logging',
        },
        {
          id: 'github',
          service: 'Version Control',
          categoryId: 'development',
          category: 'Development',
          location: 'United States',
          purpose: 'Code repository and version control integration',
        },
        {
          id: 'auth0',
          service: 'Authentication',
          categoryId: 'security',
          category: 'Security',
          location: 'United States',
          purpose: 'User authentication and identity management',
        },
        {
          id: 'intercom',
          service: 'Customer Support',
          categoryId: 'communications',
          category: 'Communications',
          location: 'United States',
          purpose: 'Customer support and chat services',
        },
        {
          id: 'mongodb',
          service: 'Database',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'United States',
          purpose: 'Managed database services',
        },
      ],
    },
    dataCenters: {
      title: 'Data Center Locations',
      regionsTitle: 'Primary Regions',
      regions: [
        'United States (US-East, US-West)',
        'European Union (EU-West, EU-Central)',
        'Asia Pacific (APAC-Southeast)',
        'Canada (CA-Central)',
      ],
      residencyTitle: 'Data Residency',
      residencyDescription: 'Customer data is stored in the region closest to the primary usage location.',
      safeguards: [
        'Data encrypted at rest and in transit',
        'Automated backups in the same region',
        'No cross-region data transfer by default',
      ],
    },
    updates: {
      title: 'Subprocessor Updates',
      intro: 'We are committed to transparency about our use of subprocessors. Here is how we keep you informed:',
      processTitle: 'Notification Process',
      process: [
        '30-day advance notice for new subprocessors',
        'Email notifications to account administrators',
        'Updates posted to this page',
        'Opportunity to object to changes',
      ],
      subscribeTitle: 'Subscribe to Updates',
      subscribeDescription: 'Stay informed about changes to our subprocessor list.',
      subscribeAction: 'Subscribe to Notifications',
      mailSubject: 'Subscribe to Subprocessor Updates',
    },
    related: {
      title: 'Related Documents',
      description: 'Learn more about our data protection practices.',
      documents: [
        {
          id: 'privacy',
          title: 'Privacy Policy',
          description: 'How we collect, use, and protect your data',
          action: 'View Policy',
        },
        {
          id: 'dpa',
          title: 'Data Processing Agreement',
          description: 'Our commitments for processing personal data',
          action: 'View DPA',
        },
        {
          id: 'security',
          title: 'Security Overview',
          description: 'Our security measures and certifications',
          action: 'View Security',
        },
      ],
    },
    contact: {
      title: 'Questions About Our Subprocessors?',
      description: 'Our privacy team is here to answer your questions about data processing and subprocessors.',
      primary: 'Contact Privacy Team',
      secondary: 'Get Support',
    },
  },
} as const satisfies MarketingExactSubprocessorsCopy;

export const marketingExactSubprocessorsFr = {
  exactSubprocessors: {
    title: 'Sous-traitants ultérieurs',
    description:
      'E-Code s’appuie sur des prestataires de premier plan pour fournir une plateforme sûre, fiable et performante.',
    lastUpdated: 'Dernière mise à jour',
    commitment: {
      title: 'Notre engagement en matière de protection des données',
      intro:
        'E-Code sélectionne avec soin des sous-traitants qui respectent les normes les plus exigeantes de sécurité et de confidentialité. Tous doivent :',
      requirements: [
        'Signer des accords de traitement des données conformes aux exigences du RGPD',
        'Mettre en œuvre des mesures techniques et organisationnelles appropriées',
        'Se soumettre à des audits de sécurité réguliers et conserver leurs certifications de conformité',
        'Limiter le traitement des données aux finalités précises décrites ci-dessous',
        'Supprimer ou restituer les données à la fin des services',
      ],
      monitoring: 'Nous contrôlons en continu nos sous-traitants afin de vérifier le maintien de ces normes.',
    },
    table: {
      title: 'Sous-traitants actuels',
      headers: ['Prestataire', 'Catégorie', 'Localisation', 'Finalité', 'Conformité'],
      viewDetails: 'Voir les détails',
      providers: [
        {
          id: 'aws',
          service: 'AWS',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'États-Unis',
          purpose: 'Hébergement cloud, stockage et services de calcul',
        },
        {
          id: 'gcp',
          service: 'GCP',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'États-Unis',
          purpose: 'Services cloud et hébergement de conteneurs',
        },
        {
          id: 'cloudflare',
          service: 'CDN et sécurité',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'États-Unis',
          purpose: 'Réseau de diffusion de contenu et protection contre les attaques DDoS',
        },
        {
          id: 'stripe',
          service: 'Traitement des paiements',
          categoryId: 'payments',
          category: 'Paiements',
          location: 'États-Unis',
          purpose: 'Traitement des paiements et gestion des abonnements',
        },
        {
          id: 'sendgrid',
          service: 'Service d’e-mail',
          categoryId: 'communications',
          category: 'Communications',
          location: 'États-Unis',
          purpose: 'Envoi d’e-mails transactionnels',
        },
        {
          id: 'datadog',
          service: 'Supervision',
          categoryId: 'analytics',
          category: 'Analyses',
          location: 'États-Unis',
          purpose: 'Supervision des performances applicatives et journalisation',
        },
        {
          id: 'github',
          service: 'Gestion de versions',
          categoryId: 'development',
          category: 'Développement',
          location: 'États-Unis',
          purpose: 'Dépôt de code et intégration de la gestion de versions',
        },
        {
          id: 'auth0',
          service: 'Authentification',
          categoryId: 'security',
          category: 'Sécurité',
          location: 'États-Unis',
          purpose: 'Authentification des utilisateurs et gestion des identités',
        },
        {
          id: 'intercom',
          service: 'Assistance client',
          categoryId: 'communications',
          category: 'Communications',
          location: 'États-Unis',
          purpose: 'Assistance client et services de chat',
        },
        {
          id: 'mongodb',
          service: 'Base de données',
          categoryId: 'infrastructure',
          category: 'Infrastructure',
          location: 'États-Unis',
          purpose: 'Services de base de données gérés',
        },
      ],
    },
    dataCenters: {
      title: 'Localisation des centres de données',
      regionsTitle: 'Régions principales',
      regions: [
        'États-Unis (US-East, US-West)',
        'Union européenne (EU-West, EU-Central)',
        'Asie-Pacifique (APAC-Southeast)',
        'Canada (CA-Central)',
      ],
      residencyTitle: 'Résidence des données',
      residencyDescription:
        'Les données client sont stockées dans la région la plus proche de leur principal lieu d’utilisation.',
      safeguards: [
        'Données chiffrées au repos et en transit',
        'Sauvegardes automatiques dans la même région',
        'Aucun transfert interrégional par défaut',
      ],
    },
    updates: {
      title: 'Évolution des sous-traitants',
      intro:
        'Nous nous engageons à être transparents sur le recours à nos sous-traitants. Voici comment nous vous tenons informé :',
      processTitle: 'Processus de notification',
      process: [
        'Préavis de 30 jours avant l’ajout d’un sous-traitant',
        'Notifications par e-mail aux administrateurs du compte',
        'Mises à jour publiées sur cette page',
        'Possibilité de s’opposer aux changements',
      ],
      subscribeTitle: 'S’abonner aux mises à jour',
      subscribeDescription: 'Restez informé des changements apportés à notre liste de sous-traitants.',
      subscribeAction: 'S’abonner aux notifications',
      mailSubject: 'Abonnement aux mises à jour des sous-traitants E-Code',
    },
    related: {
      title: 'Documents connexes',
      description: 'En savoir plus sur nos pratiques de protection des données.',
      documents: [
        {
          id: 'privacy',
          title: 'Politique de confidentialité',
          description: 'Comment nous collectons, utilisons et protégeons vos données',
          action: 'Voir la politique',
        },
        {
          id: 'dpa',
          title: 'Accord de traitement des données',
          description: 'Nos engagements relatifs au traitement des données personnelles',
          action: 'Voir l’accord',
        },
        {
          id: 'security',
          title: 'Présentation de la sécurité',
          description: 'Nos mesures de sécurité et certifications',
          action: 'Voir la sécurité',
        },
      ],
    },
    contact: {
      title: 'Des questions sur nos sous-traitants ?',
      description:
        'Notre équipe Confidentialité répond à vos questions sur le traitement des données et nos sous-traitants.',
      primary: 'Contacter l’équipe Confidentialité',
      secondary: 'Obtenir de l’aide',
    },
  },
} as const satisfies MarketingExactSubprocessorsCopy;

export function getMarketingExactSubprocessorsCopy(language?: string | null): MarketingExactSubprocessorsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactSubprocessorsFr : marketingExactSubprocessorsEn;
}
