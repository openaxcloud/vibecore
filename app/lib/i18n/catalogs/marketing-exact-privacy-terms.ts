import { resolveMarketingLanguage } from './marketing';

export type PrivacySectionId = 'collection' | 'use' | 'sharing' | 'security' | 'rights';
export type TermsSectionId =
  | 'acceptance'
  | 'license'
  | 'accounts'
  | 'prohibited'
  | 'content'
  | 'privacy'
  | 'termination'
  | 'disclaimer';
export type LegalResourceId =
  | 'terms'
  | 'privacy'
  | 'subprocessors'
  | 'dpa'
  | 'studentDpa'
  | 'security'
  | 'acceptableUse'
  | 'enforcement'
  | 'licensing'
  | 'inactivity'
  | 'dataDeletion'
  | 'reportAbuse';

interface PolicySection<Id extends string> {
  id: Id;
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
}

interface MarketingExactPrivacyTermsCopy {
  shared: {
    legalEntity: string;
    privacyEmail: string;
    legalEmail: string;
    postalAddress: string;
  };
  exactPrivacy: {
    seo: { title: string; description: string; imageAlt: string };
    title: string;
    lastUpdatedLabel: string;
    sections: readonly PolicySection<PrivacySectionId>[];
    contact: {
      title: string;
      description: string;
      emailLabel: string;
      addressLabel: string;
    };
  };
  exactTerms: {
    seo: { title: string; description: string; imageAlt: string };
    title: string;
    lastUpdatedLabel: string;
    sections: readonly PolicySection<TermsSectionId>[];
    contact: {
      title: string;
      description: string;
      emailLabel: string;
      addressLabel: string;
    };
  };
  exactLegal: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { eyebrow: string; title: string; description: string };
    documents: readonly {
      id: LegalResourceId;
      title: string;
      description: string;
      badge: string;
    }[];
    documentAction: string;
    contact: {
      title: string;
      description: string;
      primary: string;
      secondary: string;
    };
  };
}

export const marketingExactPrivacyTermsEn = {
  shared: {
    legalEntity: 'E-Code.AI (Snatch Group Limited)',
    privacyEmail: 'privacy@e-code.ai',
    legalEmail: 'legal@e-code.ai',
    postalAddress: 'Abba Eban 8 Blvd, 46120 Herzliya Pituach, Israel',
  },
  exactPrivacy: {
    seo: {
      title: 'Privacy Policy — E-Code',
      description: 'Read how E-Code collects, uses, shares and protects personal information and review your rights.',
      imageAlt: 'E-Code Privacy Policy and personal data protections',
    },
    title: 'Privacy Policy',
    lastUpdatedLabel: 'Last updated:',
    sections: [
      {
        id: 'collection',
        title: 'Information We Collect',
        paragraphs: [
          'We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.',
        ],
        items: [
          'Account information (name, email, password)',
          'Profile information (avatar, bio, location)',
          'Content you create (code, comments, posts)',
          'Communication data (support tickets, feedback)',
        ],
      },
      {
        id: 'use',
        title: 'How We Use Your Information',
        paragraphs: ['We use the information we collect to:'],
        items: [
          'Provide, maintain, and improve our services',
          'Process transactions and send related information',
          'Send technical notices and support messages',
          'Respond to your comments and questions',
          'Monitor and analyze trends and usage',
        ],
      },
      {
        id: 'sharing',
        title: 'Information Sharing',
        paragraphs: [
          'We do not sell, trade, or rent your personal information to third parties. We may share your information in certain situations:',
        ],
        items: [
          'With your consent',
          'To comply with legal obligations',
          'To protect our rights and safety',
          'With service providers who assist our operations',
        ],
      },
      {
        id: 'security',
        title: 'Data Security',
        paragraphs: [
          'We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.',
        ],
      },
      {
        id: 'rights',
        title: 'Your Rights',
        paragraphs: ['You have the right to:'],
        items: [
          'Access your personal information',
          'Correct inaccurate data',
          'Request deletion of your data',
          'Object to data processing',
          'Data portability',
        ],
      },
    ],
    contact: {
      title: 'Contact Us',
      description: 'If you have questions about this Privacy Policy, please contact us at:',
      emailLabel: 'Email:',
      addressLabel: 'Address:',
    },
  },
  exactTerms: {
    seo: {
      title: 'Terms of Service — E-Code',
      description: 'Review the terms that govern access to and use of E-Code services, accounts and content.',
      imageAlt: 'E-Code Terms of Service and account rules',
    },
    title: 'Terms of Service',
    lastUpdatedLabel: 'Last updated:',
    sections: [
      {
        id: 'acceptance',
        title: '1. Acceptance of Terms',
        paragraphs: [
          'By accessing and using E-Code ("Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by the above, please do not use this Service.',
        ],
      },
      {
        id: 'license',
        title: '2. Use License',
        paragraphs: [
          'Permission is granted to temporarily use E-Code for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:',
        ],
        items: [
          'Modify or copy the materials',
          'Use the materials for any commercial purpose or for any public display',
          'Attempt to reverse engineer any software contained on E-Code',
          'Remove any copyright or other proprietary notations from the materials',
        ],
      },
      {
        id: 'accounts',
        title: '3. User Accounts',
        paragraphs: [
          'When you create an account with us, you must provide information that is accurate, complete, and current at all times. You are responsible for safeguarding the password and for all activities that occur under your account.',
        ],
      },
      {
        id: 'prohibited',
        title: '4. Prohibited Uses',
        paragraphs: ['You may not use our Service:'],
        items: [
          'For any unlawful purpose or to solicit others to perform unlawful acts',
          'To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances',
          'To infringe upon or violate our intellectual property rights or the intellectual property rights of others',
          'To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate',
          'To submit false or misleading information',
        ],
      },
      {
        id: 'content',
        title: '5. Content',
        paragraphs: [
          'Our Service allows you to post, link, store, share and otherwise make available certain information, text, graphics, videos, or other material ("Content"). You are responsible for Content that you post on or through the Service, including its legality, reliability, and appropriateness.',
        ],
      },
      {
        id: 'privacy',
        title: '6. Privacy Policy',
        paragraphs: [
          'Your use of our Service is also governed by our Privacy Policy. Please review our Privacy Policy, which also governs the Site and informs users of our data collection practices.',
        ],
      },
      {
        id: 'termination',
        title: '7. Termination',
        paragraphs: [
          'We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of these Terms.',
        ],
      },
      {
        id: 'disclaimer',
        title: '8. Disclaimer',
        paragraphs: [
          'The information on this website is provided on an "as is" basis. To the fullest extent permitted by law, E-Code:',
        ],
        items: [
          'Excludes all representations and warranties relating to this website and its contents',
          'Excludes all liability for damages arising out of or in connection with your use of this website',
        ],
      },
    ],
    contact: {
      title: '9. Contact Information',
      description: 'If you have any questions about these Terms, please contact us at:',
      emailLabel: 'Email:',
      addressLabel: 'Address:',
    },
  },
  exactLegal: {
    seo: {
      title: 'Legal Center — E-Code',
      description: 'Review E-Code legal policies, agreements, data processing terms, security resources and reporting.',
      imageAlt: 'E-Code Legal Center policies and agreements',
    },
    hero: {
      eyebrow: 'Legal Center',
      title: 'Legal resources',
      description: 'Review the policies, agreements, and trust resources that govern E-Code services.',
    },
    documents: [
      {
        id: 'terms',
        title: 'Terms of Service',
        description: 'The terms that govern access to and use of E-Code products, services, and websites.',
        badge: 'Terms',
      },
      {
        id: 'privacy',
        title: 'Privacy Policy',
        description: 'How E-Code collects, uses, protects, and shares personal data across the platform.',
        badge: 'Privacy',
      },
      {
        id: 'subprocessors',
        title: 'Subprocessors',
        description: 'Third-party providers that help E-Code process customer data and deliver the service.',
        badge: 'Data',
      },
      {
        id: 'dpa',
        title: 'Data Processing Addendum',
        description: 'Contractual terms for customers that need a data processing agreement with E-Code.',
        badge: 'DPA',
      },
      {
        id: 'studentDpa',
        title: 'US Student DPA',
        description: 'Student privacy and education-specific data processing protections for US schools.',
        badge: 'Education',
      },
      {
        id: 'security',
        title: 'Security',
        description: 'Security controls, infrastructure protections, compliance posture, and incident response.',
        badge: 'Trust',
      },
      {
        id: 'acceptableUse',
        title: 'Acceptable Use Policy',
        description: 'Prohibited activities and the resource limits that keep the platform fair and reliable.',
        badge: 'Safety',
      },
      {
        id: 'enforcement',
        title: 'Enforcement Policy',
        description: 'How E-Code responds to policy violations — warnings, restrictions, suspension, and appeals.',
        badge: 'Safety',
      },
      {
        id: 'licensing',
        title: 'Licensing',
        description: 'How licenses apply to the apps you build and publish on E-Code.',
        badge: 'Terms',
      },
      {
        id: 'inactivity',
        title: 'Account Inactivity',
        description: 'When inactive free accounts may be removed, the notice you receive, and how to stay active.',
        badge: 'Account',
      },
      {
        id: 'dataDeletion',
        title: 'Deleting Your Data',
        description: 'How to delete projects or your entire account, what gets removed, and how to request it.',
        badge: 'Data',
      },
      {
        id: 'reportAbuse',
        title: 'Report Abuse',
        description: 'Report malicious code, illegal content, harassment, spam, privacy issues, or other abuse.',
        badge: 'Safety',
      },
    ],
    documentAction: 'View document',
    contact: {
      title: 'Need legal help?',
      description:
        'Contact our legal team for contract questions, data processing requests, security reviews, or abuse escalation.',
      primary: 'Contact Legal',
      secondary: 'Report Abuse',
    },
  },
} as const satisfies MarketingExactPrivacyTermsCopy;

export const marketingExactPrivacyTermsFr = {
  shared: {
    legalEntity: 'E-Code.AI (Snatch Group Limited)',
    privacyEmail: 'privacy@e-code.ai',
    legalEmail: 'legal@e-code.ai',
    postalAddress: 'Abba Eban 8 Blvd, 46120 Herzliya Pituach, Israel',
  },
  exactPrivacy: {
    seo: {
      title: 'Politique de confidentialité — E-Code',
      description:
        'Découvrez comment E-Code collecte, utilise, partage et protège les informations personnelles, ainsi que les droits dont vous disposez.',
      imageAlt: 'Politique de confidentialité E-Code et protection des données personnelles',
    },
    title: 'Politique de confidentialité',
    lastUpdatedLabel: 'Dernière mise à jour :',
    sections: [
      {
        id: 'collection',
        title: 'Informations que nous collectons',
        paragraphs: [
          'Nous collectons les informations que vous nous fournissez directement, notamment lorsque vous créez un compte, utilisez nos services ou sollicitez notre assistance.',
        ],
        items: [
          'Informations du compte (nom, adresse e-mail, mot de passe)',
          'Informations du profil (avatar, biographie, localisation)',
          'Contenu que vous créez (code, commentaires, publications)',
          'Données de communication (demandes d’assistance, retours)',
        ],
      },
      {
        id: 'use',
        title: 'Utilisation de vos informations',
        paragraphs: ['Nous utilisons les informations collectées pour :'],
        items: [
          'Fournir, maintenir et améliorer nos services',
          'Traiter les transactions et communiquer les informations associées',
          'Envoyer des avis techniques et des messages d’assistance',
          'Répondre à vos commentaires et à vos questions',
          'Suivre et analyser les tendances et les usages',
        ],
      },
      {
        id: 'sharing',
        title: 'Partage des informations',
        paragraphs: [
          'Nous ne vendons, n’échangeons ni ne louons vos informations personnelles à des tiers. Nous pouvons les partager dans certaines situations :',
        ],
        items: [
          'Avec votre consentement',
          'Pour respecter nos obligations légales',
          'Pour protéger nos droits et notre sécurité',
          'Avec les prestataires qui contribuent à nos activités',
        ],
      },
      {
        id: 'security',
        title: 'Sécurité des données',
        paragraphs: [
          'Nous mettons en œuvre des mesures techniques et organisationnelles appropriées afin de protéger vos informations personnelles contre tout accès, toute modification, toute divulgation ou toute destruction non autorisés.',
        ],
      },
      {
        id: 'rights',
        title: 'Vos droits',
        paragraphs: ['Vous disposez des droits suivants :'],
        items: [
          'Accéder à vos informations personnelles',
          'Rectifier les données inexactes',
          'Demander la suppression de vos données',
          'Vous opposer au traitement de vos données',
          'Obtenir la portabilité de vos données',
        ],
      },
    ],
    contact: {
      title: 'Nous contacter',
      description: 'Pour toute question concernant la présente Politique de confidentialité, contactez-nous :',
      emailLabel: 'Adresse e-mail :',
      addressLabel: 'Adresse postale :',
    },
  },
  exactTerms: {
    seo: {
      title: 'Conditions d’utilisation — E-Code',
      description:
        'Consultez les conditions qui régissent l’accès aux services, aux comptes et aux contenus E-Code, ainsi que leur utilisation.',
      imageAlt: 'Conditions d’utilisation E-Code et règles applicables aux comptes',
    },
    title: 'Conditions d’utilisation',
    lastUpdatedLabel: 'Dernière mise à jour :',
    sections: [
      {
        id: 'acceptance',
        title: '1. Acceptation des conditions',
        paragraphs: [
          'En accédant à E-Code (« le Service ») et en l’utilisant, vous acceptez d’être lié par les modalités du présent accord. Si vous refusez de vous y conformer, veuillez ne pas utiliser le Service.',
        ],
      },
      {
        id: 'license',
        title: '2. Licence d’utilisation',
        paragraphs: [
          'Une autorisation vous est accordée d’utiliser temporairement E-Code à des fins personnelles, non commerciales et de consultation transitoire uniquement. Il s’agit de l’octroi d’une licence, et non d’un transfert de propriété. Dans le cadre de cette licence, il vous est interdit de :',
        ],
        items: [
          'Modifier ou copier les éléments',
          'Utiliser les éléments à des fins commerciales ou pour toute présentation publique',
          'Tenter de procéder à l’ingénierie inverse de tout logiciel présent sur E-Code',
          'Supprimer les mentions de droit d’auteur ou toute autre mention de propriété figurant sur les éléments',
        ],
      },
      {
        id: 'accounts',
        title: '3. Comptes utilisateurs',
        paragraphs: [
          'Lorsque vous créez un compte auprès de nous, vous devez fournir à tout moment des informations exactes, complètes et à jour. Vous êtes responsable de la protection de votre mot de passe et de toutes les activités réalisées depuis votre compte.',
        ],
      },
      {
        id: 'prohibited',
        title: '4. Utilisations interdites',
        paragraphs: ['Vous ne pouvez pas utiliser notre Service pour :'],
        items: [
          'Toute finalité illicite ou toute incitation d’un tiers à commettre un acte illicite',
          'Enfreindre toute réglementation, règle ou loi internationale, fédérale, provinciale ou étatique, ou toute ordonnance locale',
          'Porter atteinte à nos droits de propriété intellectuelle ou à ceux de tiers',
          'Harceler, maltraiter, insulter, nuire, diffamer, dénigrer, intimider ou discriminer',
          'Transmettre des informations fausses ou trompeuses',
        ],
      },
      {
        id: 'content',
        title: '5. Contenu',
        paragraphs: [
          'Notre Service vous permet de publier, lier, stocker, partager et rendre accessibles des informations, textes, éléments graphiques, vidéos ou autres éléments (« Contenu »). Vous êtes responsable du Contenu que vous publiez sur le Service ou par son intermédiaire, notamment de sa légalité, de sa fiabilité et de son caractère approprié.',
        ],
      },
      {
        id: 'privacy',
        title: '6. Politique de confidentialité',
        paragraphs: [
          'Votre utilisation de notre Service est également régie par notre Politique de confidentialité. Nous vous invitons à la consulter : elle s’applique aussi au Site et informe les utilisateurs de nos pratiques de collecte des données.',
        ],
      },
      {
        id: 'termination',
        title: '7. Résiliation',
        paragraphs: [
          'Nous pouvons résilier ou suspendre votre compte et vous interdire immédiatement l’accès au Service, sans préavis ni responsabilité, à notre seule discrétion, pour quelque motif que ce soit et sans limitation, notamment en cas de violation des présentes Conditions.',
        ],
      },
      {
        id: 'disclaimer',
        title: '8. Exclusion de garanties',
        paragraphs: [
          'Les informations présentes sur ce site Web sont fournies « en l’état ». Dans toute la mesure permise par la loi, E-Code :',
        ],
        items: [
          'Exclut toute déclaration et toute garantie relatives à ce site Web et à son contenu',
          'Exclut toute responsabilité au titre des dommages résultant de l’utilisation de ce site Web ou liés à celle-ci',
        ],
      },
    ],
    contact: {
      title: '9. Coordonnées',
      description: 'Pour toute question concernant les présentes Conditions, contactez-nous :',
      emailLabel: 'Adresse e-mail :',
      addressLabel: 'Adresse postale :',
    },
  },
  exactLegal: {
    seo: {
      title: 'Centre juridique — E-Code',
      description:
        'Consultez les politiques, accords, conditions de traitement des données, ressources de sécurité et procédures de signalement d’E-Code.',
      imageAlt: 'Politiques et accords du Centre juridique E-Code',
    },
    hero: {
      eyebrow: 'Centre juridique',
      title: 'Ressources juridiques',
      description:
        'Consultez les politiques, accords et ressources relatives à la confiance qui régissent les services E-Code.',
    },
    documents: [
      {
        id: 'terms',
        title: 'Conditions d’utilisation',
        description:
          'Les conditions qui régissent l’accès aux produits, services et sites Web E-Code et leur utilisation.',
        badge: 'Conditions',
      },
      {
        id: 'privacy',
        title: 'Politique de confidentialité',
        description:
          'La façon dont E-Code collecte, utilise, protège et partage les données personnelles sur la plateforme.',
        badge: 'Confidentialité',
      },
      {
        id: 'subprocessors',
        title: 'Sous-traitants ultérieurs',
        description:
          'Les prestataires tiers qui aident E-Code à traiter les données de ses clients et à fournir le service.',
        badge: 'Données',
      },
      {
        id: 'dpa',
        title: 'Accord de traitement des données',
        description:
          'Les conditions contractuelles destinées aux clients qui doivent conclure un accord de traitement des données avec E-Code.',
        badge: 'DPA',
      },
      {
        id: 'studentDpa',
        title: 'Accord de traitement des données des élèves',
        description:
          'Les protections propres à l’éducation et à la confidentialité des données des élèves pour les établissements américains.',
        badge: 'Éducation',
      },
      {
        id: 'security',
        title: 'Sécurité',
        description:
          'Les contrôles de sécurité, la protection de l’infrastructure, la conformité et la réponse aux incidents.',
        badge: 'Confiance',
      },
      {
        id: 'acceptableUse',
        title: 'Politique d’utilisation acceptable',
        description:
          'Les activités interdites et les limites de ressources qui garantissent une plateforme équitable et fiable.',
        badge: 'Sécurité',
      },
      {
        id: 'enforcement',
        title: 'Politique d’application des règles',
        description:
          'La manière dont E-Code répond aux infractions : avertissements, restrictions, suspension et voies de recours.',
        badge: 'Sécurité',
      },
      {
        id: 'licensing',
        title: 'Licences',
        description: 'Les règles de licence applicables aux applications que vous créez et publiez sur E-Code.',
        badge: 'Conditions',
      },
      {
        id: 'inactivity',
        title: 'Inactivité du compte',
        description:
          'Les conditions de suppression des comptes gratuits inactifs, le préavis envoyé et la manière de rester actif.',
        badge: 'Compte',
      },
      {
        id: 'dataDeletion',
        title: 'Suppression de vos données',
        description:
          'La procédure de suppression des projets ou du compte, les éléments concernés et les modalités de demande.',
        badge: 'Données',
      },
      {
        id: 'reportAbuse',
        title: 'Signaler un abus',
        description:
          'Signalez tout code malveillant, contenu illicite, harcèlement, spam, problème de confidentialité ou autre abus.',
        badge: 'Sécurité',
      },
    ],
    documentAction: 'Consulter le document',
    contact: {
      title: 'Besoin d’aide juridique ?',
      description:
        'Contactez notre service juridique pour toute question contractuelle, demande liée au traitement des données, évaluation de sécurité ou signalement d’un abus.',
      primary: 'Contacter le service juridique',
      secondary: 'Signaler un abus',
    },
  },
} as const satisfies MarketingExactPrivacyTermsCopy;

export function getMarketingExactPrivacyTermsCopy(language?: string | null): MarketingExactPrivacyTermsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactPrivacyTermsFr : marketingExactPrivacyTermsEn;
}
