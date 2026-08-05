import { resolveMarketingLanguage } from './marketing';

export type AgreementSectionId =
  | 'scope'
  | 'subscriptions'
  | 'payment'
  | 'serviceLevels'
  | 'dataProcessing'
  | 'confidentiality'
  | 'liability'
  | 'termination'
  | 'law'
  | 'contact';
export type TeamFeatureId =
  | 'multiplayer'
  | 'versionControl'
  | 'communication'
  | 'security'
  | 'environments'
  | 'performance';
export type TeamUseCaseId = 'remote' | 'education';
export type TeamTestimonialId = 'sarah' | 'marcus' | 'emily';

interface MarketingExactAgreementTeamCopy {
  exactCommercialAgreement: {
    seo: { title: string; description: string; imageAlt: string };
    title: string;
    lastUpdated: string;
    introduction: string;
    sections: readonly {
      id: AgreementSectionId;
      title: string;
      paragraphs: readonly string[];
      points: readonly string[];
    }[];
    contact: { emailLabel: string; addressLabel: string };
  };
  exactTeam: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; primary: string; secondary: string };
    features: {
      title: string;
      items: readonly { id: TeamFeatureId; title: string; description: string }[];
    };
    useCases: {
      title: string;
      items: readonly { id: TeamUseCaseId; title: string; description: string; points: readonly string[] }[];
    };
    testimonials: {
      title: string;
      items: readonly { id: TeamTestimonialId; quote: string; role: string }[];
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
}

export const marketingExactAgreementTeamEn = {
  exactCommercialAgreement: {
    seo: {
      title: 'Commercial Agreement — E-Code',
      description: 'Read the E-Code Commercial Agreement governing paid plans, enterprise services, and subscriptions.',
      imageAlt: 'E-Code — build, ship and scale production applications with AI',
    },
    title: 'Commercial Agreement',
    lastUpdated: 'Last updated',
    introduction:
      'This Commercial Agreement (the "Agreement") governs your purchase and use of paid plans, subscriptions, and enterprise services offered by E-Code (operated by Snatch Group Limited, "E-Code", "we", "us"). It supplements our Terms of Service and applies whenever you subscribe to a paid plan or sign an order form referencing this Agreement. Capitalized terms not defined here have the meaning given in the Terms of Service.',
    sections: [
      {
        id: 'scope',
        title: '1. Scope',
        paragraphs: [
          'This Agreement covers E-Code\'s cloud development platform, AI agents, workspaces, deployment services, and related support (collectively, the "Services") that you access under a paid plan. The specific Services, usage limits, and pricing applicable to you are set out in your selected plan or in a separately executed order form. Where an order form conflicts with this Agreement, the order form controls for the affected subject matter.',
        ],
        points: [],
      },
      {
        id: 'subscriptions',
        title: '2. Subscription & Fees',
        paragraphs: [
          "Subscriptions are offered on a recurring basis (monthly or annual) and renew automatically at the end of each billing cycle unless cancelled before the renewal date. Fees are based on the plan tier you select and any metered usage, including additional seats, compute, storage, and AI usage beyond your plan's included allowances.",
        ],
        points: [
          'Plan prices and included allowances are published on our pricing page or in your order form.',
          'Metered overages are charged at the rates in effect for your plan at the time of use.',
          "We may change list prices with at least 30 days' notice, effective on your next renewal.",
          'All fees are exclusive of taxes, which you are responsible for unless you provide a valid exemption.',
        ],
      },
      {
        id: 'payment',
        title: '3. Payment Terms',
        paragraphs: [
          'Fees are due in advance for each billing cycle and are charged to your designated payment method through our payment processor. For invoiced enterprise accounts, payment is due within 30 days of the invoice date unless otherwise agreed in writing.',
        ],
        points: [
          'Recurring charges are processed automatically on each renewal date.',
          'Failed payments may result in suspension of paid features until the balance is settled.',
          'Except where required by law, fees are non-refundable and unused allowances do not carry over.',
          'Past-due invoices may accrue interest at the lower of 1.5% per month or the maximum allowed by law.',
        ],
      },
      {
        id: 'serviceLevels',
        title: '4. Service Levels',
        paragraphs: [
          'We aim to make the Services available with a target monthly uptime of 99.9%, excluding scheduled maintenance and events outside our reasonable control. Enterprise plans may include a separate service level agreement with defined response times and service credits. Service credits, where applicable, are your sole and exclusive remedy for availability shortfalls. We provide support through the channels and during the hours described for your plan tier.',
        ],
        points: [],
      },
      {
        id: 'dataProcessing',
        title: '5. Data Processing',
        paragraphs: [
          'We process your code, project content, and personal data only as necessary to provide the Services and in accordance with our Privacy Policy. Where we act as a processor of personal data on your behalf, our Data Processing Addendum governs that processing and is incorporated into this Agreement by reference.',
        ],
        points: [
          'You retain ownership of all code and data you create or upload to the Services.',
          'We apply encryption in transit and at rest and maintain industry-standard security controls.',
          'We do not use your private project content to train shared models without your consent.',
          'You can export your projects and data in standard formats at any time during the term.',
        ],
      },
      {
        id: 'confidentiality',
        title: '6. Confidentiality',
        paragraphs: [
          'Each party may receive confidential information from the other in connection with this Agreement. The receiving party will use such information only to perform under this Agreement, protect it with at least the same care it uses for its own confidential information, and not disclose it to third parties except to personnel and contractors bound by similar obligations. Confidentiality obligations do not apply to information that is public through no fault of the receiving party, independently developed, or rightfully obtained from another source.',
        ],
        points: [],
      },
      {
        id: 'liability',
        title: '7. Liability',
        paragraphs: [
          'To the maximum extent permitted by law, neither party is liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data, arising out of or relating to this Agreement. Except for liability arising from a party\'s breach of confidentiality, indemnity obligations, or amounts owed under this Agreement, each party\'s total aggregate liability is limited to the fees paid or payable by you for the Services in the 12 months preceding the event giving rise to the claim. The Services are otherwise provided on an "as is" and "as available" basis.',
        ],
        points: [],
      },
      {
        id: 'termination',
        title: '8. Term & Termination',
        paragraphs: [
          'This Agreement begins when you subscribe to a paid plan and continues for the duration of your subscription, including renewals. Either party may terminate for material breach if the breach remains uncured 30 days after written notice.',
        ],
        points: [
          'You may cancel renewal at any time; cancellation takes effect at the end of the current cycle.',
          'We may suspend or terminate access for non-payment or violation of the Terms of Service.',
          'Upon termination, your right to use the Services ends and accrued fees become payable.',
          'We retain your data for a limited period after termination to allow export before deletion.',
        ],
      },
      {
        id: 'law',
        title: '9. Governing Law',
        paragraphs: [
          'This Agreement is governed by the laws of the State of Israel, without regard to its conflict-of-laws rules. The competent courts located in Tel Aviv, Israel will have exclusive jurisdiction over any dispute arising out of or relating to this Agreement, except that either party may seek injunctive relief in any court of competent jurisdiction to protect its intellectual property or confidential information.',
        ],
        points: [],
      },
      {
        id: 'contact',
        title: '10. Contact',
        paragraphs: ['For questions about this Commercial Agreement, please contact us at:'],
        points: [],
      },
    ],
    contact: { emailLabel: 'Email', addressLabel: 'Address' },
  },
  exactTeam: {
    seo: {
      title: 'Teams — E-Code',
      description: 'Build together and ship faster with E-Code real-time collaboration for modern development teams.',
      imageAlt: 'E-Code — build, ship and scale production applications with AI',
    },
    hero: {
      title: 'Build Together, Ship Faster',
      description:
        'Real-time collaboration that feels like magic. Code, debug, and deploy with your team in perfect sync.',
      primary: 'Start Collaborating Free',
      secondary: 'Contact Sales',
    },
    features: {
      title: 'Everything Your Team Needs',
      items: [
        {
          id: 'multiplayer',
          title: 'Real-time Multiplayer',
          description: "See teammates' cursors, selections, and edits in real-time. It's like being in the same room.",
        },
        {
          id: 'versionControl',
          title: 'Advanced Version Control',
          description: 'Built-in Git with visual branching, merge conflict resolution, and code review tools.',
        },
        {
          id: 'communication',
          title: 'Integrated Communication',
          description: 'Voice chat, video calls, and threaded discussions right in your workspace.',
        },
        {
          id: 'security',
          title: 'Enterprise Security',
          description: 'SSO, 2FA, audit logs, and granular permissions to keep your code secure.',
        },
        {
          id: 'environments',
          title: 'Instant Environments',
          description: 'Spin up identical development environments for every team member in seconds.',
        },
        {
          id: 'performance',
          title: 'Global Performance',
          description: 'Low-latency collaboration from anywhere with our global edge network.',
        },
      ],
    },
    useCases: {
      title: 'Built for Modern Teams',
      items: [
        {
          id: 'remote',
          title: 'Remote Teams',
          description:
            'Bridge the distance with real-time collaboration that makes remote feel local. Share screens, pair program, and ship code together from anywhere in the world.',
          points: ['Live presence indicators', 'Voice and video chat', 'Timezone-aware scheduling'],
        },
        {
          id: 'education',
          title: 'Educational Institutions',
          description:
            "Transform how students learn to code. Teachers can jump into any student's project, provide real-time feedback, and track progress effortlessly.",
          points: ['Classroom management tools', 'Assignment distribution', 'Progress tracking'],
        },
      ],
    },
    testimonials: {
      title: 'Loved by Teams Worldwide',
      items: [
        {
          id: 'sarah',
          quote:
            'E-Code transformed how our distributed team works. We ship 3x faster and onboard new developers in hours, not weeks.',
          role: 'CTO',
        },
        {
          id: 'marcus',
          quote:
            'The real-time collaboration features are game-changing. Our team feels more connected than ever, despite being across 5 time zones.',
          role: 'Engineering Lead',
        },
        {
          id: 'emily',
          quote:
            'Teaching programming has never been easier. I can help students debug in real-time and the whole class can learn together.',
          role: 'CS Professor',
        },
      ],
    },
    cta: {
      title: "Ready to Transform Your Team's Workflow?",
      description: 'Join thousands of teams building amazing things together on E-Code.',
      primary: 'Start Free Trial',
      secondary: 'View Pricing',
    },
  },
} as const satisfies MarketingExactAgreementTeamCopy;

export const marketingExactAgreementTeamFr = {
  exactCommercialAgreement: {
    seo: {
      title: 'Accord commercial — E-Code',
      description:
        'Consultez l’Accord commercial E-Code qui régit les offres payantes, les services aux entreprises et les abonnements.',
      imageAlt: 'E-Code — créez et livrez des applications de production avec l’IA',
    },
    title: 'Accord commercial',
    lastUpdated: 'Dernière mise à jour',
    introduction:
      'Le présent Accord commercial (l’« Accord ») régit votre achat et votre utilisation des offres payantes, abonnements et services aux entreprises proposés par E-Code (exploité par Snatch Group Limited, « E-Code », « nous »). Il complète nos Conditions d’utilisation et s’applique dès lors que vous souscrivez une offre payante ou signez un bon de commande faisant référence au présent Accord. Les termes commençant par une majuscule qui ne sont pas définis ici ont le sens qui leur est donné dans les Conditions d’utilisation.',
    sections: [
      {
        id: 'scope',
        title: '1. Champ d’application',
        paragraphs: [
          'Le présent Accord couvre la plateforme de développement cloud d’E-Code, les agents IA, les espaces de travail, les services de déploiement et l’assistance associée (collectivement, les « Services ») auxquels vous accédez dans le cadre d’une offre payante. Les Services, limites d’utilisation et tarifs qui vous sont applicables sont précisés dans l’offre choisie ou dans un bon de commande signé séparément. En cas de contradiction entre un bon de commande et le présent Accord, le bon de commande prévaut pour les éléments concernés.',
        ],
        points: [],
      },
      {
        id: 'subscriptions',
        title: '2. Abonnements et frais',
        paragraphs: [
          'Les abonnements sont proposés de façon récurrente, mensuelle ou annuelle, et se renouvellent automatiquement à la fin de chaque période de facturation, sauf résiliation avant la date de renouvellement. Les frais dépendent de l’offre choisie et de toute utilisation mesurée, notamment les licences, ressources de calcul, capacités de stockage et usages de l’IA dépassant les quotas inclus.',
        ],
        points: [
          'Les tarifs des offres et les quotas inclus sont publiés sur notre page de tarification ou dans votre bon de commande.',
          'Les dépassements mesurés sont facturés aux tarifs en vigueur pour votre offre au moment de leur utilisation.',
          'Nous pouvons modifier nos prix catalogue moyennant un préavis d’au moins 30 jours ; les nouveaux prix s’appliquent lors de votre prochain renouvellement.',
          'Tous les frais s’entendent hors taxes, lesquelles restent à votre charge sauf présentation d’une exonération valide.',
        ],
      },
      {
        id: 'payment',
        title: '3. Conditions de paiement',
        paragraphs: [
          'Les frais sont dus d’avance pour chaque période de facturation et prélevés sur le moyen de paiement que vous avez désigné par l’intermédiaire de notre prestataire de paiement. Pour les comptes entreprise facturés sur facture, le paiement est dû dans les 30 jours suivant la date de facturation, sauf accord écrit contraire.',
        ],
        points: [
          'Les frais récurrents sont prélevés automatiquement à chaque date de renouvellement.',
          'Un défaut de paiement peut entraîner la suspension des fonctionnalités payantes jusqu’au règlement du solde.',
          'Sauf obligation légale contraire, les frais ne sont pas remboursables et les quotas inutilisés ne sont pas reportés.',
          'Les factures échues peuvent produire des intérêts au taux le plus faible entre 1,5 % par mois et le taux maximal autorisé par la loi.',
        ],
      },
      {
        id: 'serviceLevels',
        title: '4. Niveaux de service',
        paragraphs: [
          'Nous visons une disponibilité mensuelle des Services de 99,9 %, hors opérations de maintenance planifiées et événements échappant raisonnablement à notre contrôle. Les offres Entreprise peuvent inclure un accord de niveau de service distinct précisant les délais de réponse et crédits de service. Le cas échéant, ces crédits constituent votre seul recours en cas d’insuffisance de disponibilité. L’assistance est fournie par les canaux et pendant les horaires prévus pour votre offre.',
        ],
        points: [],
      },
      {
        id: 'dataProcessing',
        title: '5. Traitement des données',
        paragraphs: [
          'Nous traitons votre code, le contenu de vos projets et vos données personnelles uniquement dans la mesure nécessaire à la fourniture des Services et conformément à notre Politique de confidentialité. Lorsque nous agissons en qualité de sous-traitant de données personnelles pour votre compte, notre Accord de traitement des données régit ce traitement et est intégré au présent Accord par référence.',
        ],
        points: [
          'Vous conservez la propriété de l’ensemble du code et des données que vous créez ou importez dans les Services.',
          'Nous appliquons un chiffrement en transit et au repos et maintenons des contrôles de sécurité conformes aux pratiques du secteur.',
          'Nous n’utilisons pas le contenu de vos projets privés pour entraîner des modèles partagés sans votre consentement.',
          'Vous pouvez exporter vos projets et vos données dans des formats standard à tout moment pendant la durée de l’Accord.',
        ],
      },
      {
        id: 'confidentiality',
        title: '6. Confidentialité',
        paragraphs: [
          'Chaque partie peut recevoir des informations confidentielles de l’autre partie dans le cadre du présent Accord. La partie destinataire n’utilise ces informations qu’aux fins de l’exécution de l’Accord, les protège avec au moins le même soin que ses propres informations confidentielles et ne les communique qu’aux membres de son personnel et prestataires soumis à des obligations similaires. Les obligations de confidentialité ne s’appliquent pas aux informations devenues publiques sans faute de la partie destinataire, développées indépendamment ou obtenues légitimement auprès d’une autre source.',
        ],
        points: [],
      },
      {
        id: 'liability',
        title: '7. Responsabilité',
        paragraphs: [
          'Dans toute la mesure permise par la loi, aucune partie n’est responsable des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, ni des pertes de bénéfices, de chiffre d’affaires ou de données résultant du présent Accord ou s’y rapportant. À l’exception des responsabilités découlant d’une violation de la confidentialité, des obligations d’indemnisation ou des sommes dues au titre du présent Accord, la responsabilité totale cumulée de chaque partie est limitée aux frais payés ou dus par vous au titre des Services au cours des 12 mois précédant l’événement à l’origine de la réclamation. Pour le surplus, les Services sont fournis « en l’état » et « selon disponibilité ».',
        ],
        points: [],
      },
      {
        id: 'termination',
        title: '8. Durée et résiliation',
        paragraphs: [
          'Le présent Accord prend effet lorsque vous souscrivez une offre payante et demeure en vigueur pendant toute la durée de votre abonnement, renouvellements compris. Chaque partie peut le résilier en cas de manquement substantiel qui n’est pas corrigé dans les 30 jours suivant une notification écrite.',
        ],
        points: [
          'Vous pouvez annuler le renouvellement à tout moment ; l’annulation prend effet à la fin de la période en cours.',
          'Nous pouvons suspendre ou résilier l’accès en cas de défaut de paiement ou de violation des Conditions d’utilisation.',
          'À la résiliation, votre droit d’utiliser les Services prend fin et les frais déjà acquis deviennent exigibles.',
          'Nous conservons vos données pendant une durée limitée après la résiliation afin de permettre leur exportation avant suppression.',
        ],
      },
      {
        id: 'law',
        title: '9. Droit applicable',
        paragraphs: [
          'Le présent Accord est régi par les lois de l’État d’Israël, à l’exclusion de ses règles de conflit de lois. Les juridictions compétentes situées à Tel-Aviv, Israël, disposent d’une compétence exclusive pour tout litige découlant du présent Accord ou s’y rapportant. Chaque partie peut toutefois demander des mesures conservatoires à toute juridiction compétente afin de protéger sa propriété intellectuelle ou ses informations confidentielles.',
        ],
        points: [],
      },
      {
        id: 'contact',
        title: '10. Contact',
        paragraphs: [
          'Pour toute question relative au présent Accord commercial, contactez-nous à l’adresse suivante :',
        ],
        points: [],
      },
    ],
    contact: { emailLabel: 'E-mail', addressLabel: 'Adresse' },
  },
  exactTeam: {
    seo: {
      title: 'Équipes — E-Code',
      description:
        'Créez ensemble et livrez plus vite grâce à la collaboration en temps réel d’E-Code pour les équipes de développement modernes.',
      imageAlt: 'E-Code — créez et livrez des applications de production avec l’IA',
    },
    hero: {
      title: 'Créez ensemble, livrez plus vite',
      description:
        'Une collaboration en temps réel qui paraît naturelle. Programmez, déboguez et déployez avec votre équipe, en parfaite synchronisation.',
      primary: 'Collaborer gratuitement',
      secondary: 'Contacter l’équipe commerciale',
    },
    features: {
      title: 'Tout ce dont votre équipe a besoin',
      items: [
        {
          id: 'multiplayer',
          title: 'Collaboration en temps réel',
          description:
            'Voyez les curseurs, sélections et modifications de vos collègues en direct, comme si vous étiez dans la même pièce.',
        },
        {
          id: 'versionControl',
          title: 'Gestion de versions avancée',
          description:
            'Git est intégré avec une représentation visuelle des branches, la résolution des conflits de fusion et des outils de revue de code.',
        },
        {
          id: 'communication',
          title: 'Communication intégrée',
          description:
            'Échangez par audio, visioconférence et discussions thématiques directement dans votre espace de travail.',
        },
        {
          id: 'security',
          title: 'Sécurité pour les entreprises',
          description:
            'SSO, authentification à deux facteurs, journaux d’audit et autorisations granulaires protègent votre code.',
        },
        {
          id: 'environments',
          title: 'Environnements instantanés',
          description:
            'Créez en quelques secondes un environnement de développement identique pour chaque membre de l’équipe.',
        },
        {
          id: 'performance',
          title: 'Performances mondiales',
          description:
            'Collaborez avec une faible latence depuis n’importe où grâce à notre réseau périphérique mondial.',
        },
      ],
    },
    useCases: {
      title: 'Conçu pour les équipes modernes',
      items: [
        {
          id: 'remote',
          title: 'Équipes distribuées',
          description:
            'Réduisez les distances grâce à une collaboration en temps réel qui rapproche les équipes. Partagez votre écran, programmez en binôme et livrez du code ensemble depuis partout dans le monde.',
          points: [
            'Indicateurs de présence en direct',
            'Échanges audio et vidéo',
            'Planification adaptée aux fuseaux horaires',
          ],
        },
        {
          id: 'education',
          title: 'Établissements d’enseignement',
          description:
            'Transformez l’apprentissage de la programmation. Les enseignants peuvent rejoindre le projet de chaque élève, commenter en direct et suivre facilement sa progression.',
          points: ['Outils de gestion de classe', 'Distribution des devoirs', 'Suivi de la progression'],
        },
      ],
    },
    testimonials: {
      title: 'Plébiscité par des équipes du monde entier',
      items: [
        {
          id: 'sarah',
          quote:
            'E-Code a transformé le fonctionnement de notre équipe distribuée. Nous livrons trois fois plus vite et intégrons les nouveaux développeurs en quelques heures, au lieu de plusieurs semaines.',
          role: 'Directrice technique',
        },
        {
          id: 'marcus',
          quote:
            'Les fonctionnalités de collaboration en temps réel changent la donne. Notre équipe se sent plus proche que jamais, malgré cinq fuseaux horaires différents.',
          role: 'Responsable ingénierie',
        },
        {
          id: 'emily',
          quote:
            'Enseigner la programmation n’a jamais été aussi simple. Je peux aider les étudiants à déboguer en direct et toute la classe apprend ensemble.',
          role: 'Professeure d’informatique',
        },
      ],
    },
    cta: {
      title: 'Prêts à transformer le travail de votre équipe ?',
      description: 'Rejoignez les milliers d’équipes qui créent ensemble des produits remarquables sur E-Code.',
      primary: 'Commencer l’essai gratuit',
      secondary: 'Voir les tarifs',
    },
  },
} as const satisfies MarketingExactAgreementTeamCopy;

export function getMarketingExactAgreementTeamCopy(language?: string | null): MarketingExactAgreementTeamCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactAgreementTeamFr : marketingExactAgreementTeamEn;
}
