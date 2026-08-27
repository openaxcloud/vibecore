import { resolveMarketingLanguage } from './marketing';

export type StudentProtectionId = 'minimization' | 'consent' | 'parental' | 'security' | 'retention' | 'breach';
export type StudentDataCategoryId = 'account' | 'records' | 'technical' | 'communications';
export type StudentRightsId = 'student' | 'guardian' | 'school';
export type StudentSecurityId = 'technical' | 'administrative';
export type StudentContactId = 'email' | 'meeting' | 'resources';

interface MarketingExactStudentDpaCopy {
  exactStudentDpa: {
    hero: {
      badge: string;
      title: string;
      description: string;
      download: string;
      contact: string;
      effectiveDate: string;
      lastUpdated: string;
    };
    important: { label: string; text: string };
    protectionsIntro: { title: string; description: string };
    protections: readonly { id: StudentProtectionId; title: string; description: string }[];
    dataIntro: { title: string; description: string; purposePrefix: string };
    dataCategories: readonly {
      id: StudentDataCategoryId;
      category: string;
      data: readonly string[];
      purpose: string;
    }[];
    noCommercial: { label: string; text: string };
    compliance: {
      title: string;
      compliesWith: string;
      laws: readonly { id: string; name: string; description: string }[];
      controllerTitle: string;
      controllerDescription: string;
      controllerPoints: readonly string[];
    };
    obligationsTitle: string;
    obligations: readonly string[];
    rightsTitle: string;
    rights: readonly { id: StudentRightsId; title: string; items: readonly string[] }[];
    security: {
      title: string;
      groups: readonly { id: StudentSecurityId; title: string; items: readonly string[] }[];
    };
    download: {
      title: string;
      description: string;
      pdf: string;
      word: string;
      pdfSubject: string;
      wordSubject: string;
    };
    contact: {
      title: string;
      description: string;
      cards: readonly { id: StudentContactId; title: string; description: string; action: string }[];
    };
  };
}

export const marketingExactStudentDpaEn = {
  exactStudentDpa: {
    hero: {
      badge: 'EDUCATION PRIVACY',
      title: 'Student Data Processing Agreement',
      description:
        'Our commitment to protecting student privacy in educational settings. This agreement governs how E-Code processes student data for schools and educational institutions.',
      download: 'Download Full Agreement',
      contact: 'Contact Education Team',
      effectiveDate: 'Effective date',
      lastUpdated: 'Last updated',
    },
    important: {
      label: 'Important',
      text: 'This Student DPA supplements our standard Terms of Service and Privacy Policy with additional protections specific to student data. Schools must execute this agreement before using E-Code for classroom instruction.',
    },
    protectionsIntro: {
      title: 'Enhanced Student Privacy Protections',
      description: 'We implement special safeguards for student data beyond our standard privacy practices.',
    },
    protections: [
      {
        id: 'minimization',
        title: 'Data Minimization',
        description: 'We collect only the data necessary for educational purposes.',
      },
      {
        id: 'consent',
        title: 'Age-Appropriate Consent',
        description: 'Special consent mechanisms apply to users under 18.',
      },
      {
        id: 'parental',
        title: 'Parental Access Rights',
        description: 'Parents can access, review, and delete student data.',
      },
      {
        id: 'security',
        title: 'Enhanced Security',
        description: 'Additional security measures protect student accounts.',
      },
      {
        id: 'retention',
        title: 'Data Retention Limits',
        description: 'Data is automatically deleted after educational use ends.',
      },
      {
        id: 'breach',
        title: 'Breach Notification',
        description: 'Schools receive immediate notice of any data incident.',
      },
    ],
    dataIntro: {
      title: 'Student Data Collection and Use',
      description: 'A transparent account of what we collect and why.',
      purposePrefix: 'Purpose',
    },
    dataCategories: [
      {
        id: 'account',
        category: 'Account Information',
        data: ['Student name', 'Email address', 'Username', 'Grade level'],
        purpose: 'Account creation and management',
      },
      {
        id: 'records',
        category: 'Educational Records',
        data: ['Projects created', 'Code submissions', 'Assignment completion', 'Progress tracking'],
        purpose: 'Educational assessment and progress monitoring',
      },
      {
        id: 'technical',
        category: 'Technical Data',
        data: ['Login times', 'Session duration', 'Feature usage', 'Error logs'],
        purpose: 'Platform improvement and technical support',
      },
      {
        id: 'communications',
        category: 'Communication Data',
        data: ['Messages with instructors', 'Forum posts', 'Support requests'],
        purpose: 'Educational collaboration and support',
      },
    ],
    noCommercial: {
      label: 'No Commercial Use',
      text: 'Student data is never sold, used for advertising, or shared with third parties for commercial purposes. It is used solely for educational purposes and platform improvement.',
    },
    compliance: {
      title: 'Legal Compliance',
      compliesWith: 'E-Code complies with:',
      laws: [
        { id: 'ferpa', name: 'FERPA', description: 'Family Educational Rights and Privacy Act' },
        { id: 'coppa', name: 'COPPA', description: 'Children’s Online Privacy Protection Act' },
        { id: 'gdpr', name: 'GDPR', description: 'General Data Protection Regulation (EU)' },
        {
          id: 'state',
          name: 'State Privacy Laws',
          description: 'California, New York, and other applicable state laws',
        },
      ],
      controllerTitle: 'School as Data Controller',
      controllerDescription:
        'Under this agreement, the educational institution acts as Data Controller and E-Code acts as Data Processor. This means:',
      controllerPoints: [
        'Schools determine what data is collected and for what purpose',
        'E-Code processes data only according to school instructions',
        'Schools remain responsible for consent and parental rights',
      ],
    },
    obligationsTitle: 'Our Obligations as Data Processor',
    obligations: [
      'Process student data only for educational purposes',
      'Implement appropriate security measures to protect student data',
      'Ensure compliance with FERPA, COPPA, and applicable state laws',
      'Provide data portability and deletion upon request',
      'Prohibit the sale or commercial use of student data',
      'Limit data retention to the active educational use period',
      'Maintain the confidentiality of all student information',
      'Cooperate with school audits and compliance reviews',
    ],
    rightsTitle: 'Rights and Access',
    rights: [
      {
        id: 'student',
        title: 'Student Rights',
        items: [
          'Access their own data',
          'Request corrections',
          'Download their work',
          'Delete their account',
          'Opt out of optional features',
        ],
      },
      {
        id: 'guardian',
        title: 'Parent or Guardian Rights',
        items: [
          'Review student data',
          'Request data deletion',
          'Withdraw consent',
          'Access activity reports',
          'Contact the privacy team',
        ],
      },
      {
        id: 'school',
        title: 'School Rights',
        items: [
          'Audit data practices',
          'Export all student data',
          'Terminate the agreement',
          'Request compliance reports',
          'Manage user permissions',
        ],
      },
    ],
    security: {
      title: 'Data Security Measures',
      groups: [
        {
          id: 'technical',
          title: 'Technical Safeguards',
          items: [
            '256-bit encryption at rest and in transit',
            'Multi-factor authentication for educators',
            'Regular security audits and penetration testing',
            'Isolated education environment',
          ],
        },
        {
          id: 'administrative',
          title: 'Administrative Safeguards',
          items: [
            'Background checks for staff with data access',
            'Regular privacy training for employees',
            'Strict access controls and logging',
            'Incident response procedures',
          ],
        },
      ],
    },
    download: {
      title: 'Download the Full Agreement',
      description:
        'Get the complete Student Data Processing Agreement in PDF format. Your legal team should review and execute this document before deployment.',
      pdf: 'Download PDF',
      word: 'Download Word',
      pdfSubject: 'Request for Student DPA (PDF)',
      wordSubject: 'Request for Student DPA (Word)',
    },
    contact: {
      title: 'Questions About Student Privacy?',
      description: 'Our education team is here to help.',
      cards: [
        {
          id: 'email',
          title: 'Email Us',
          description: 'For DPA questions and execution',
          action: 'Email the education team',
        },
        {
          id: 'meeting',
          title: 'Schedule a Call',
          description: 'Discuss your school’s needs',
          action: 'Book Meeting',
        },
        {
          id: 'resources',
          title: 'Resources',
          description: 'Privacy guides and best practices',
          action: 'View Resources',
        },
      ],
    },
  },
} as const satisfies MarketingExactStudentDpaCopy;

export const marketingExactStudentDpaFr = {
  exactStudentDpa: {
    hero: {
      badge: 'CONFIDENTIALITÉ DANS L’ÉDUCATION',
      title: 'Accord de traitement des données des élèves',
      description:
        'Notre engagement à protéger la vie privée des élèves dans le cadre éducatif. Cet accord régit la manière dont E-Code traite leurs données pour les établissements scolaires et organismes de formation.',
      download: 'Télécharger l’accord complet',
      contact: 'Contacter l’équipe Éducation',
      effectiveDate: 'Date d’effet',
      lastUpdated: 'Dernière mise à jour',
    },
    important: {
      label: 'Important',
      text: 'Le présent DPA Élèves complète nos Conditions d’utilisation et notre Politique de confidentialité par des protections propres aux données des élèves. Les établissements doivent signer cet accord avant d’utiliser E-Code en classe.',
    },
    protectionsIntro: {
      title: 'Protection renforcée de la vie privée des élèves',
      description:
        'Nous appliquons aux données des élèves des garanties qui vont au-delà de nos pratiques habituelles.',
    },
    protections: [
      {
        id: 'minimization',
        title: 'Minimisation des données',
        description: 'Nous ne collectons que les données nécessaires aux finalités éducatives.',
      },
      {
        id: 'consent',
        title: 'Consentement adapté à l’âge',
        description: 'Des mécanismes de consentement spécifiques s’appliquent aux moins de 18 ans.',
      },
      {
        id: 'parental',
        title: 'Droits d’accès des parents',
        description: 'Les parents peuvent consulter, vérifier et supprimer les données de l’élève.',
      },
      {
        id: 'security',
        title: 'Sécurité renforcée',
        description: 'Des mesures de sécurité supplémentaires protègent les comptes des élèves.',
      },
      {
        id: 'retention',
        title: 'Durées de conservation limitées',
        description: 'Les données sont automatiquement supprimées à la fin de l’usage éducatif.',
      },
      {
        id: 'breach',
        title: 'Notification des violations',
        description: 'Les établissements sont immédiatement informés de tout incident de données.',
      },
    ],
    dataIntro: {
      title: 'Collecte et utilisation des données des élèves',
      description: 'Une présentation transparente des données collectées et de leurs finalités.',
      purposePrefix: 'Finalité',
    },
    dataCategories: [
      {
        id: 'account',
        category: 'Informations du compte',
        data: ['Nom de l’élève', 'Adresse e-mail', 'Nom d’utilisateur', 'Niveau scolaire'],
        purpose: 'Création et gestion du compte',
      },
      {
        id: 'records',
        category: 'Dossiers pédagogiques',
        data: ['Projets créés', 'Code remis', 'Travaux terminés', 'Suivi de la progression'],
        purpose: 'Évaluation pédagogique et suivi de la progression',
      },
      {
        id: 'technical',
        category: 'Données techniques',
        data: ['Heures de connexion', 'Durée des sessions', 'Utilisation des fonctionnalités', 'Journaux d’erreurs'],
        purpose: 'Amélioration de la plateforme et assistance technique',
      },
      {
        id: 'communications',
        category: 'Données de communication',
        data: ['Messages avec les enseignants', 'Publications sur le forum', 'Demandes d’assistance'],
        purpose: 'Collaboration pédagogique et assistance',
      },
    ],
    noCommercial: {
      label: 'Aucun usage commercial',
      text: 'Les données des élèves ne sont jamais vendues, utilisées à des fins publicitaires ni communiquées à des tiers à des fins commerciales. Elles servent uniquement aux finalités éducatives et à l’amélioration de la plateforme.',
    },
    compliance: {
      title: 'Conformité juridique',
      compliesWith: 'E-Code respecte notamment :',
      laws: [
        {
          id: 'ferpa',
          name: 'FERPA',
          description: 'Loi américaine sur les droits éducatifs de la famille et la confidentialité',
        },
        {
          id: 'coppa',
          name: 'COPPA',
          description: 'Loi américaine sur la protection de la vie privée des enfants en ligne',
        },
        { id: 'gdpr', name: 'RGPD', description: 'Règlement général sur la protection des données (UE)' },
        {
          id: 'state',
          name: 'Lois des États sur la vie privée',
          description: 'Lois applicables en Californie, dans l’État de New York et dans les autres États',
        },
      ],
      controllerTitle: 'L’établissement comme Responsable du traitement',
      controllerDescription:
        'Au titre du présent accord, l’établissement agit comme Responsable du traitement et E-Code comme Sous-traitant. Par conséquent :',
      controllerPoints: [
        'Les établissements déterminent les données collectées et leurs finalités',
        'E-Code ne traite les données que conformément aux instructions de l’établissement',
        'Les établissements restent responsables du consentement et des droits parentaux',
      ],
    },
    obligationsTitle: 'Nos obligations en qualité de Sous-traitant',
    obligations: [
      'Traiter les données des élèves uniquement à des fins éducatives',
      'Mettre en œuvre des mesures de sécurité appropriées',
      'Assurer le respect de la FERPA, de la COPPA et des lois applicables des États',
      'Permettre la portabilité et la suppression des données sur demande',
      'Interdire la vente ou l’usage commercial des données des élèves',
      'Limiter la conservation à la période d’utilisation éducative active',
      'Préserver la confidentialité de toutes les informations des élèves',
      'Coopérer aux audits et contrôles de conformité des établissements',
    ],
    rightsTitle: 'Droits et accès',
    rights: [
      {
        id: 'student',
        title: 'Droits des élèves',
        items: [
          'Accéder à leurs propres données',
          'Demander des rectifications',
          'Télécharger leurs travaux',
          'Supprimer leur compte',
          'Refuser les fonctionnalités facultatives',
        ],
      },
      {
        id: 'guardian',
        title: 'Droits des parents ou tuteurs',
        items: [
          'Consulter les données de l’élève',
          'Demander leur suppression',
          'Retirer leur consentement',
          'Accéder aux rapports d’activité',
          'Contacter l’équipe Confidentialité',
        ],
      },
      {
        id: 'school',
        title: 'Droits des établissements',
        items: [
          'Auditer les pratiques relatives aux données',
          'Exporter toutes les données des élèves',
          'Résilier l’accord',
          'Demander des rapports de conformité',
          'Gérer les autorisations des utilisateurs',
        ],
      },
    ],
    security: {
      title: 'Mesures de sécurité des données',
      groups: [
        {
          id: 'technical',
          title: 'Garanties techniques',
          items: [
            'Chiffrement 256 bits au repos et en transit',
            'Authentification multifacteur pour les enseignants',
            'Audits de sécurité et tests d’intrusion réguliers',
            'Environnement éducatif isolé',
          ],
        },
        {
          id: 'administrative',
          title: 'Garanties administratives',
          items: [
            'Vérification des antécédents du personnel ayant accès aux données',
            'Formation régulière du personnel à la confidentialité',
            'Contrôles d’accès et journalisation stricts',
            'Procédures de réponse aux incidents',
          ],
        },
      ],
    },
    download: {
      title: 'Télécharger l’accord complet',
      description:
        'Obtenez l’Accord complet de traitement des données des élèves au format PDF. Votre équipe juridique doit l’examiner et le signer avant le déploiement.',
      pdf: 'Télécharger le PDF',
      word: 'Télécharger le document Word',
      pdfSubject: 'Demande de DPA Élèves (PDF)',
      wordSubject: 'Demande de DPA Élèves (Word)',
    },
    contact: {
      title: 'Des questions sur la vie privée des élèves ?',
      description: 'Notre équipe Éducation est à votre disposition.',
      cards: [
        {
          id: 'email',
          title: 'Écrivez-nous',
          description: 'Pour toute question ou signature du DPA',
          action: 'Écrire à l’équipe Éducation',
        },
        {
          id: 'meeting',
          title: 'Planifier un appel',
          description: 'Échangez sur les besoins de votre établissement',
          action: 'Planifier un rendez-vous',
        },
        {
          id: 'resources',
          title: 'Ressources',
          description: 'Guides de confidentialité et bonnes pratiques',
          action: 'Voir les ressources',
        },
      ],
    },
  },
} as const satisfies MarketingExactStudentDpaCopy;

export function getMarketingExactStudentDpaCopy(language?: string | null): MarketingExactStudentDpaCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactStudentDpaFr : marketingExactStudentDpaEn;
}
