import { resolveMarketingLanguage } from './marketing';

export type SupportPolicyHighlightId = 'tickets' | 'resources' | 'priority' | 'security';

export type SupportPolicySectionId = 'channels' | 'coverage' | 'targets' | 'security';

interface MarketingExactSupportPolicyCopy {
  exactSupportPolicy: {
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
        id: SupportPolicyHighlightId;
        label: string;
      }[];
    };
    policy: {
      title: string;
      sections: readonly {
        id: SupportPolicySectionId;
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

export const marketingExactSupportPolicyEn = {
  exactSupportPolicy: {
    seo: {
      title: 'Support Policy — E-Code',
      description:
        'Learn how E-Code support works, which channels to use, what our team covers and the response targets for each plan.',
      imageAlt: 'E-Code support channels, coverage and response-target policy',
    },
    hero: {
      eyebrow: 'Support',
      title: 'Support Policy',
      description:
        'Learn how to get help with E-Code, what our support team covers and the response targets you can expect on each plan.',
    },
    actions: {
      primary: 'Contact support',
      secondary: 'Browse documentation',
    },
    highlights: {
      title: 'Support at a glance',
      items: [
        { id: 'tickets', label: 'Ticket support' },
        { id: 'resources', label: 'Documentation and community' },
        { id: 'priority', label: 'Faster responses on higher plans' },
        { id: 'security', label: 'Security fast-track' },
      ],
    },
    policy: {
      title: 'How E-Code support works',
      sections: [
        {
          id: 'channels',
          title: 'How to get help',
          body: 'Start with our documentation and community for the fastest answers. For account-specific issues, open a support ticket from the in-app Support page so our team has the context needed to help.',
          items: [
            'Documentation and guides',
            'Community discussions',
            'In-app support tickets',
            'Status page for incidents',
          ],
        },
        {
          id: 'coverage',
          title: 'What support covers',
          body: 'We help with the E-Code platform: accounts and billing, workspace and runtime issues, deployments, and product questions. We can guide you on your own application code, but building or debugging your app remains the role of the AI agent and IDE.',
          items: [
            'Accounts and billing',
            'Workspace, runtime and deployment issues',
            'Product guidance',
            'Not a substitute for application development',
          ],
        },
        {
          id: 'targets',
          title: 'Response targets by plan',
          body: 'These are the targets we aim for during business days. Higher plans receive faster first-response targets and priority routing. Enterprise customers can agree committed service-level agreements (SLAs) in their contract.',
          items: [
            'Starter — documentation and community first; ticket response within a few business days',
            'Core / Pro — priority tickets with a faster first-response target',
            'Enterprise — priority routing and contractually agreed SLAs',
            'These are targets, not contractual SLAs unless stated in your agreement',
          ],
        },
        {
          id: 'security',
          title: 'Security and abuse fast-track',
          body: 'Security vulnerability reports and abuse reports are handled outside the normal queue. Use the dedicated channels so they reach the right team quickly.',
          items: [
            'Report vulnerabilities through the Security page',
            'Report abuse through Report Abuse',
            'Security and abuse reports receive priority handling',
          ],
        },
      ],
    },
    cta: {
      title: 'Get the right support',
      description:
        'Use the documentation and community for common questions, or open an in-app ticket when your issue requires account context.',
    },
  },
} as const satisfies MarketingExactSupportPolicyCopy;

export const marketingExactSupportPolicyFr = {
  exactSupportPolicy: {
    seo: {
      title: 'Politique d’assistance — E-Code',
      description:
        'Découvrez le fonctionnement de l’assistance E-Code, les canaux à utiliser, son périmètre et les objectifs de réponse associés à chaque offre.',
      imageAlt: 'Canaux, périmètre et objectifs de réponse de l’assistance E-Code',
    },
    hero: {
      eyebrow: 'Assistance',
      title: 'Politique d’assistance',
      description:
        'Découvrez comment obtenir de l’aide sur E-Code, ce que couvre notre équipe d’assistance et les objectifs de réponse associés à chaque offre.',
    },
    actions: {
      primary: 'Contacter l’assistance',
      secondary: 'Consulter la documentation',
    },
    highlights: {
      title: 'L’assistance en un coup d’œil',
      items: [
        { id: 'tickets', label: 'Assistance par ticket' },
        { id: 'resources', label: 'Documentation et communauté' },
        { id: 'priority', label: 'Réponse accélérée selon l’offre' },
        { id: 'security', label: 'Traitement prioritaire des alertes de sécurité' },
      ],
    },
    policy: {
      title: 'Fonctionnement de l’assistance E-Code',
      sections: [
        {
          id: 'channels',
          title: 'Comment obtenir de l’aide',
          body: 'Commencez par consulter notre documentation et la communauté pour obtenir rapidement une réponse. Pour toute question propre à votre compte, ouvrez un ticket depuis la page Assistance de l’application afin que notre équipe dispose du contexte nécessaire.',
          items: [
            'Documentation et guides',
            'Discussions de la communauté',
            'Tickets d’assistance dans l’application',
            'Page d’état pour suivre les incidents',
          ],
        },
        {
          id: 'coverage',
          title: 'Périmètre de l’assistance',
          body: 'Nous vous aidons à utiliser la plateforme E-Code : comptes et facturation, problèmes liés aux espaces de travail et aux environnements d’exécution, déploiements et questions sur le produit. Nous pouvons vous orienter concernant le code de votre propre application, mais sa création ou son débogage relève de l’agent IA et de l’IDE.',
          items: [
            'Comptes et facturation',
            'Espaces de travail, environnements d’exécution et déploiements',
            'Conseils d’utilisation du produit',
            'L’assistance ne remplace pas le développement de votre application',
          ],
        },
        {
          id: 'targets',
          title: 'Objectifs de réponse par offre',
          body: 'Ces délais correspondent aux objectifs que nous visons pendant les jours ouvrés. Les offres supérieures bénéficient d’un objectif de première réponse plus rapide et d’un acheminement prioritaire. Les clients Enterprise peuvent convenir d’accords de niveau de service (SLA) contractuels.',
          items: [
            'Starter — documentation et communauté en priorité ; réponse aux tickets sous quelques jours ouvrés',
            'Core / Pro — tickets prioritaires et objectif de première réponse plus rapide',
            'Enterprise — acheminement prioritaire et SLA convenus par contrat',
            'Ces délais sont des objectifs, et non des SLA contractuels, sauf mention contraire dans votre contrat',
          ],
        },
        {
          id: 'security',
          title: 'Traitement prioritaire des signalements de sécurité et d’abus',
          body: 'Les signalements de vulnérabilités de sécurité et les signalements d’abus sont traités en dehors de la file d’attente habituelle. Utilisez les canaux dédiés afin qu’ils parviennent rapidement à l’équipe compétente.',
          items: [
            'Signalez les vulnérabilités depuis la page Sécurité',
            'Signalez les abus depuis la page Signaler un abus',
            'Les signalements de sécurité et d’abus sont traités en priorité',
          ],
        },
      ],
    },
    cta: {
      title: 'Obtenez l’assistance adaptée',
      description:
        'Consultez la documentation et la communauté pour les questions courantes, ou ouvrez un ticket dans l’application lorsque votre demande nécessite le contexte de votre compte.',
    },
  },
} as const satisfies MarketingExactSupportPolicyCopy;

export function getMarketingExactSupportPolicyCopy(language?: string | null): MarketingExactSupportPolicyCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactSupportPolicyFr : marketingExactSupportPolicyEn;
}
