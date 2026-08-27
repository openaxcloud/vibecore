import { resolveMarketingLanguage } from './marketing';

export type StrikeSystemHighlightId = 'warning' | 'escalation' | 'expiry' | 'appeals';

export type StrikeSystemSectionId = 'escalation' | 'expiry' | 'triggers' | 'appeals';

interface MarketingExactStrikeSystemCopy {
  exactStrikeSystem: {
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
        id: StrikeSystemHighlightId;
        label: string;
      }[];
    };
    policy: {
      title: string;
      sections: readonly {
        id: StrikeSystemSectionId;
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

export const marketingExactStrikeSystemEn = {
  exactStrikeSystem: {
    seo: {
      title: 'Strike System — E-Code',
      description:
        'Learn how E-Code moderation strikes escalate from warning to suspension, expire after {days} days and can be appealed.',
      imageAlt: 'E-Code moderation strike escalation, expiry and appeals process',
    },
    hero: {
      eyebrow: 'Legal',
      title: 'Strike System',
      description:
        'When an E-Code project or account breaks our Acceptable Use Policy or Terms of Service, we apply moderation strikes on a clear, escalating ladder. This page explains each step and how to appeal.',
    },
    actions: {
      primary: 'Report abuse',
      secondary: 'Read acceptable use',
    },
    highlights: {
      title: 'Strike-system safeguards',
      items: [
        { id: 'warning', label: 'Warning first' },
        { id: 'escalation', label: 'Escalation for repeat violations' },
        { id: 'expiry', label: 'Expiry after {days} days' },
        { id: 'appeals', label: 'Every action can be appealed' },
      ],
    },
    policy: {
      title: 'How the strike system works',
      sections: [
        {
          id: 'escalation',
          title: 'How strikes escalate',
          body: 'Most issues start with a warning. Repeated or more serious violations move up the ladder. A single severe violation — such as illegal content or using the platform to attack others — can lead directly to account suspension.',
          items: [
            '{warningCount} strike — Warning: a notice that content or conduct broke our rules',
            '{communityCount} strikes — Community restriction: your workspace and IDE keep working, but public posting and app sharing are paused',
            '{suspensionCount} strikes — Account suspension: sign-in is blocked and associated apps may be removed',
            'Severe violations can escalate immediately and skip earlier steps',
          ],
        },
        {
          id: 'expiry',
          title: 'Strikes expire',
          body: 'Strikes are not permanent. An individual strike stops counting toward escalation after {days} days, so a first mistake does not follow you forever once you return to good standing.',
          items: [
            '{days}-day expiry for each strike',
            'Good standing is restored automatically',
            'History is retained for audit only',
          ],
        },
        {
          id: 'triggers',
          title: 'What triggers a strike',
          body: 'Strikes follow actual violations of our Acceptable Use Policy, Terms of Service or Trust & Safety rules — not normal building activity. Automated abuse signals, such as crypto-mining, reverse shells or mass credential testing, can also open a case for human review.',
          items: [
            'Acceptable Use Policy or Terms of Service violations',
            'Trust & Safety violations',
            'Confirmed automated-abuse signals',
          ],
        },
        {
          id: 'appeals',
          title: 'How to appeal',
          body: 'If you believe an action was a mistake, you can appeal it. Email our appeals inbox with your account email, the action you are contesting and why you believe it was wrong. We review every appeal.',
          items: [
            'Email appeals@e-code.ai',
            'Include your account email',
            'Describe the contested action',
            'Every case is reviewed',
          ],
        },
      ],
    },
    cta: {
      title: 'Understand the rules and keep building',
      description:
        'Review the Acceptable Use Policy before publishing, and report content or conduct that puts the community at risk.',
    },
  },
} as const satisfies MarketingExactStrikeSystemCopy;

export const marketingExactStrikeSystemFr = {
  exactStrikeSystem: {
    seo: {
      title: 'Système d’avertissements — E-Code',
      description:
        'Découvrez comment les avertissements disciplinaires E-Code progressent de la notification à la suspension, expirent après {days} jours et peuvent être contestés.',
      imageAlt: 'Progression, expiration et procédure de recours des avertissements disciplinaires E-Code',
    },
    hero: {
      eyebrow: 'Centre juridique',
      title: 'Système d’avertissements',
      description:
        'Lorsqu’un projet ou un compte E-Code enfreint notre Politique d’utilisation acceptable ou nos Conditions d’utilisation, nous appliquons des avertissements disciplinaires selon une progression claire. Cette page explique chaque étape et la procédure de recours.',
    },
    actions: {
      primary: 'Signaler un abus',
      secondary: 'Lire la politique d’utilisation acceptable',
    },
    highlights: {
      title: 'Garanties du système d’avertissements',
      items: [
        { id: 'warning', label: 'Notification avant toute restriction' },
        { id: 'escalation', label: 'Progression en cas d’infractions répétées' },
        { id: 'expiry', label: 'Expiration après {days} jours' },
        { id: 'appeals', label: 'Recours possible contre chaque mesure' },
      ],
    },
    policy: {
      title: 'Fonctionnement du système d’avertissements',
      sections: [
        {
          id: 'escalation',
          title: 'Progression des mesures disciplinaires',
          body: 'La plupart des problèmes donnent d’abord lieu à une notification. Les infractions répétées ou plus graves font progresser la mesure disciplinaire. Une seule infraction grave — par exemple un contenu illégal ou l’utilisation de la plateforme pour attaquer des tiers — peut entraîner directement la suspension du compte.',
          items: [
            '{warningCount} avertissement disciplinaire — Notification : vous êtes informé qu’un contenu ou un comportement enfreint nos règles',
            '{communityCount} avertissements disciplinaires — Restriction de la communauté : votre espace de travail et l’IDE restent accessibles, mais les publications publiques et le partage d’applications sont suspendus',
            '{suspensionCount} avertissements disciplinaires — Suspension du compte : la connexion est bloquée et les applications associées peuvent être supprimées',
            'Une infraction grave peut entraîner une suspension immédiate sans passer par les étapes précédentes',
          ],
        },
        {
          id: 'expiry',
          title: 'Expiration des avertissements',
          body: 'Les avertissements disciplinaires ne sont pas permanents. Chaque avertissement cesse d’être pris en compte dans la progression après {days} jours. Une première erreur ne vous suit donc pas indéfiniment une fois votre compte revenu en règle.',
          items: [
            'Expiration de chaque avertissement après {days} jours',
            'Retour en règle automatique',
            'Historique conservé uniquement à des fins d’audit',
          ],
        },
        {
          id: 'triggers',
          title: 'Motifs d’un avertissement',
          body: 'Les avertissements sanctionnent des infractions avérées à notre Politique d’utilisation acceptable, à nos Conditions d’utilisation ou à nos règles de confiance et sécurité — et non une activité de création normale. Des signaux automatisés d’abus, comme le minage de cryptomonnaies, les reverse shells ou les tests massifs d’identifiants, peuvent également ouvrir un dossier soumis à une revue humaine.',
          items: [
            'Infractions à la Politique d’utilisation acceptable ou aux Conditions d’utilisation',
            'Infractions aux règles de confiance et sécurité',
            'Signaux automatisés d’abus confirmés',
          ],
        },
        {
          id: 'appeals',
          title: 'Comment exercer un recours',
          body: 'Si vous estimez qu’une mesure résulte d’une erreur, vous pouvez la contester. Écrivez à notre adresse de recours en indiquant l’adresse e-mail de votre compte, la mesure contestée et les raisons pour lesquelles vous l’estimez injustifiée. Chaque recours est examiné.',
          items: [
            'Écrivez à appeals@e-code.ai',
            'Indiquez l’adresse e-mail de votre compte',
            'Décrivez la mesure contestée',
            'Chaque dossier est examiné',
          ],
        },
      ],
    },
    cta: {
      title: 'Comprenez les règles et poursuivez vos créations',
      description:
        'Consultez la Politique d’utilisation acceptable avant toute publication et signalez les contenus ou comportements qui mettent la communauté en danger.',
    },
  },
} as const satisfies MarketingExactStrikeSystemCopy;

export function getMarketingExactStrikeSystemCopy(language?: string | null): MarketingExactStrikeSystemCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactStrikeSystemFr : marketingExactStrikeSystemEn;
}

export function interpolateMarketingExactStrikeSystemCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatMarketingExactStrikeSystemInteger(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}
