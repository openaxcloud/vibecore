import { resolveMarketingLanguage } from './marketing';

export type TrustSafetyHighlightId = 'rules' | 'review' | 'children' | 'reporting';

export type TrustSafetySectionId = 'prohibited' | 'children' | 'enforcement' | 'reporting' | 'appeals';

interface MarketingExactTrustSafetyCopy {
  exactTrustSafety: {
    seo: {
      title: string;
      description: string;
      imageAlt: string;
    };
    hero: {
      eyebrow: string;
      title: string;
      description: string;
    };
    actions: {
      primary: string;
      secondary: string;
    };
    highlights: {
      title: string;
      items: readonly {
        id: TrustSafetyHighlightId;
        label: string;
      }[];
    };
    policy: {
      title: string;
      sections: readonly {
        id: TrustSafetySectionId;
        title: string;
        body: string;
        items: readonly string[];
      }[];
    };
    cta: {
      title: string;
      description: string;
    };
  };
}

export const marketingExactTrustSafetyEn = {
  exactTrustSafety: {
    seo: {
      title: 'Trust & Safety — E-Code',
      description:
        'Review prohibited content and conduct on E-Code, how abuse is detected and enforced, child-safety protections and reporting options.',
      imageAlt: 'E-Code Trust and Safety rules, enforcement and reporting guidance',
    },
    hero: {
      eyebrow: 'Trust & Safety',
      title: 'Trust & Safety',
      description:
        'E-Code is a place to build and ship real software. These rules keep the platform safe for everyone, and explain how we detect abuse, enforce our policies and let you report problems.',
    },
    actions: {
      primary: 'Report a problem',
      secondary: 'Read acceptable use',
    },
    highlights: {
      title: 'Core safety commitments',
      items: [
        { id: 'rules', label: 'Clear rules' },
        { id: 'review', label: 'Automated and human review' },
        { id: 'children', label: 'Child safety' },
        { id: 'reporting', label: 'Accessible reporting' },
      ],
    },
    policy: {
      title: 'Trust and Safety policy',
      sections: [
        {
          id: 'prohibited',
          title: 'Prohibited content and conduct',
          body: 'You may not use E-Code to create, host or distribute content that is illegal or harms others. This includes attacking other systems and abusing our infrastructure.',
          items: [
            'No illegal content or activity',
            'No malware, phishing or credential theft',
            'No harassment, hate or threats',
            'No attacks, scanning or unauthorized access to other systems',
            'No crypto-mining or compute-only workloads',
          ],
        },
        {
          id: 'children',
          title: 'Child safety',
          body: 'Child sexual abuse material (CSAM) and any sexualization of minors are strictly prohibited and have zero tolerance. We remove such content, suspend accounts, preserve evidence and report to the appropriate authorities and NCMEC as required by law.',
          items: ['Zero tolerance for CSAM', 'Immediate removal and suspension', 'Reporting to authorities and NCMEC'],
        },
        {
          id: 'enforcement',
          title: 'How we detect and enforce',
          body: 'We combine automated abuse signals with human review. Runtime signals — such as crypto-mining, reverse shells, malware downloads, port scanning or credential-testing spikes — can throttle or stop a workspace and open a case for a person to review. Confirmed violations lead to progressively stronger enforcement.',
          items: [
            'Automated runtime abuse signals',
            'Workspace throttling or stopping on serious signals',
            'Human review before lasting action',
            'Escalation through the warning system',
          ],
        },
        {
          id: 'reporting',
          title: 'How to report',
          body: 'If you see content or behavior that breaks these rules, tell us. Reports enter a real intake that our team reviews. Urgent safety issues are prioritized.',
          items: [
            'Use Report Abuse for content or conduct',
            'Use the Security page for vulnerabilities',
            'Urgent safety issues are prioritized',
          ],
        },
        {
          id: 'appeals',
          title: 'Appeals',
          body: 'Enforcement can be appealed. If you think we got it wrong, email our appeals inbox with your account email and the details, and a person will review it.',
          items: ['Email appeals@e-code.ai', 'Include your account email and context', 'Every appeal is reviewed'],
        },
      ],
    },
    cta: {
      title: 'Help keep E-Code safe',
      description:
        'Report prohibited content or conduct when you encounter it, or review the acceptable-use rules before building.',
    },
  },
} as const satisfies MarketingExactTrustSafetyCopy;

export const marketingExactTrustSafetyFr = {
  exactTrustSafety: {
    seo: {
      title: 'Confiance et sécurité — E-Code',
      description:
        'Consultez les contenus et comportements interdits sur E-Code, les méthodes de détection et d’application des règles, la protection des mineurs et les moyens de signalement.',
      imageAlt: 'Règles de confiance et sécurité, mesures appliquées et signalements sur E-Code',
    },
    hero: {
      eyebrow: 'Confiance et sécurité',
      title: 'Confiance et sécurité',
      description:
        'E-Code est un espace conçu pour créer et mettre en production de vrais logiciels. Ces règles protègent l’ensemble de la communauté et expliquent comment nous détectons les abus, appliquons nos politiques et vous permettons de signaler un problème.',
    },
    actions: {
      primary: 'Signaler un problème',
      secondary: 'Lire la politique d’utilisation acceptable',
    },
    highlights: {
      title: 'Nos engagements fondamentaux en matière de sécurité',
      items: [
        { id: 'rules', label: 'Règles claires' },
        { id: 'review', label: 'Détection automatisée et revue humaine' },
        { id: 'children', label: 'Protection des mineurs' },
        { id: 'reporting', label: 'Signalement accessible à tous' },
      ],
    },
    policy: {
      title: 'Politique de confiance et de sécurité',
      sections: [
        {
          id: 'prohibited',
          title: 'Contenus et comportements interdits',
          body: 'Vous ne pouvez pas utiliser E-Code pour créer, héberger ou distribuer du contenu illégal ou préjudiciable. Cela inclut les attaques contre d’autres systèmes et l’usage abusif de notre infrastructure.',
          items: [
            'Aucun contenu ni aucune activité illégale',
            'Aucun logiciel malveillant, aucune tentative d’hameçonnage ni aucun vol d’identifiants',
            'Aucun harcèlement, aucun discours haineux ni aucune menace',
            'Aucune attaque, aucune analyse ni aucun accès non autorisé à d’autres systèmes',
            'Aucun minage de cryptomonnaies ni aucune charge dédiée uniquement au calcul',
          ],
        },
        {
          id: 'children',
          title: 'Protection des mineurs',
          body: 'Les contenus montrant des violences sexuelles sur mineurs (CSAM) et toute sexualisation de mineurs sont strictement interdits et font l’objet d’une tolérance zéro. Nous supprimons ces contenus, suspendons les comptes concernés, préservons les preuves et les signalons aux autorités compétentes ainsi qu’au NCMEC lorsque la loi l’exige.',
          items: [
            'Tolérance zéro pour les contenus CSAM',
            'Suppression et suspension immédiates',
            'Signalement aux autorités et au NCMEC',
          ],
        },
        {
          id: 'enforcement',
          title: 'Détection et application des règles',
          body: 'Nous associons des signaux automatisés de détection des abus à une revue humaine. Les signaux d’exécution — par exemple le minage de cryptomonnaies, les reverse shells, le téléchargement de logiciels malveillants, l’analyse de ports ou les pics de tests d’identifiants — peuvent entraîner la limitation ou l’arrêt d’un espace de travail et ouvrir un dossier examiné par une personne. Les infractions confirmées donnent lieu à des mesures progressivement renforcées.',
          items: [
            'Signaux automatisés d’abus à l’exécution',
            'Limitation ou arrêt de l’espace de travail en cas de signal grave',
            'Revue humaine avant toute mesure durable',
            'Renforcement progressif selon le système d’avertissements',
          ],
        },
        {
          id: 'reporting',
          title: 'Comment effectuer un signalement',
          body: 'Si vous constatez un contenu ou un comportement contraire à ces règles, signalez-le-nous. Chaque signalement rejoint un véritable circuit de traitement examiné par notre équipe. Les urgences de sécurité sont prioritaires.',
          items: [
            'Utilisez Signaler un abus pour un contenu ou un comportement',
            'Utilisez la page Sécurité pour les vulnérabilités',
            'Les urgences de sécurité sont prioritaires',
          ],
        },
        {
          id: 'appeals',
          title: 'Recours',
          body: 'Les mesures appliquées peuvent faire l’objet d’un recours. Si vous pensez qu’une décision est incorrecte, écrivez à notre adresse de recours en indiquant l’adresse e-mail de votre compte et les informations utiles ; une personne examinera votre demande.',
          items: [
            'Écrivez à appeals@e-code.ai',
            'Indiquez l’adresse e-mail du compte et le contexte',
            'Chaque recours fait l’objet d’une revue',
          ],
        },
      ],
    },
    cta: {
      title: 'Aidez-nous à protéger E-Code',
      description:
        'Signalez tout contenu ou comportement interdit que vous rencontrez, ou consultez les règles d’utilisation acceptable avant de commencer à créer.',
    },
  },
} as const satisfies MarketingExactTrustSafetyCopy;

export function getMarketingExactTrustSafetyCopy(language?: string | null): MarketingExactTrustSafetyCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactTrustSafetyFr : marketingExactTrustSafetyEn;
}
