import { resolveMarketingLanguage } from './marketing';

export type AcceptableUseSectionId = 'workspace' | 'ai' | 'limits' | 'response';

interface MarketingExactAcceptableUseCopy {
  exactAcceptableUse: {
    seo: { title: string; description: string; imageAlt: string };
    page: {
      title: string;
      eyebrow: string;
      description: string;
      primaryAction: string;
      secondaryAction: string;
      highlights: readonly string[];
      sections: readonly {
        id: AcceptableUseSectionId;
        title: string;
        body: string;
        items: readonly string[];
      }[];
    };
  };
}

export const marketingExactAcceptableUseEn = {
  exactAcceptableUse: {
    seo: {
      title: 'Acceptable use policy — E-Code',
      description:
        'Read the E-Code acceptable use policy for safe project generation, runtime usage, AI workflows, and abuse response.',
      imageAlt: 'E-Code acceptable use and workspace safety policy',
    },
    page: {
      title: 'Acceptable use policy',
      eyebrow: 'Legal',
      description:
        'The public E-Code acceptable use policy for safe project generation, runtime usage, AI workflows, and abuse response.',
      primaryAction: 'Report abuse',
      secondaryAction: 'Review security',
      highlights: ['No attacks', 'No credential abuse', 'No hidden miners', 'No unauthorized background services'],
      sections: [
        {
          id: 'workspace',
          title: 'Workspace safety',
          body: 'Do not use workspaces to attack systems, evade rate limits, mine cryptocurrency, exfiltrate secrets, or run unapproved background services.',
          items: ['No scanning or exploitation', 'No rate-limit evasion', 'No crypto mining', 'No secret exfiltration'],
        },
        {
          id: 'ai',
          title: 'AI usage boundaries',
          body: 'AI tools must stay within authorized projects and may not be used to bypass access controls or leak provider credentials.',
          items: [
            'Authorized projects only',
            'Respect access controls',
            'Protect provider credentials',
            'Preserve auditability',
          ],
        },
        {
          id: 'limits',
          title: 'Usage limits',
          body: 'Each account may keep up to 20 apps published at once. We may decline to run workloads whose primary purpose is to consume compute—for example, crypto-mining, distributed brute-forcing, or traffic generation—rather than to build or operate a genuine application.',
          items: [
            'Up to 20 concurrently published apps',
            'No compute-only or mining workloads',
            'No traffic or load generation',
            'Fair-use compute',
          ],
        },
        {
          id: 'response',
          title: 'Abuse response',
          body: 'Abuse events can result in workspace suspension, organization restrictions, and audit escalation.',
          items: ['Workspace suspension', 'Organization restrictions', 'Audit escalation', 'Support review'],
        },
      ],
    },
  },
} as const satisfies MarketingExactAcceptableUseCopy;

export const marketingExactAcceptableUseFr = {
  exactAcceptableUse: {
    seo: {
      title: 'Politique d’utilisation acceptable — E-Code',
      description:
        'Consultez la politique d’utilisation acceptable d’E-Code concernant la création sécurisée de projets, les environnements d’exécution, les usages de l’IA et le traitement des abus.',
      imageAlt: 'Politique E-Code d’utilisation acceptable et de sécurité des espaces de travail',
    },
    page: {
      title: 'Politique d’utilisation acceptable',
      eyebrow: 'Centre juridique',
      description:
        'La politique publique d’E-Code encadre la création sécurisée de projets, l’utilisation des environnements d’exécution, les flux de travail avec l’IA et le traitement des abus.',
      primaryAction: 'Signaler un abus',
      secondaryAction: 'Consulter la sécurité',
      highlights: [
        'Aucune attaque',
        'Aucun détournement d’identifiants',
        'Aucun mineur dissimulé',
        'Aucun service en arrière-plan non autorisé',
      ],
      sections: [
        {
          id: 'workspace',
          title: 'Sécurité des espaces de travail',
          body: 'N’utilisez pas les espaces de travail pour attaquer des systèmes, contourner les limites de débit, miner des cryptomonnaies, exfiltrer des secrets ou exécuter des services en arrière-plan non approuvés.',
          items: [
            'Aucune analyse ni exploitation de vulnérabilités',
            'Aucun contournement des limites de débit',
            'Aucun minage de cryptomonnaies',
            'Aucune exfiltration de secrets',
          ],
        },
        {
          id: 'ai',
          title: 'Limites d’utilisation de l’IA',
          body: 'Les outils d’IA doivent rester dans le périmètre de projets autorisés et ne peuvent pas servir à contourner les contrôles d’accès ni à divulguer les identifiants d’un fournisseur.',
          items: [
            'Uniquement dans les projets autorisés',
            'Respect des contrôles d’accès',
            'Protection des identifiants des fournisseurs',
            'Préservation de la traçabilité',
          ],
        },
        {
          id: 'limits',
          title: 'Limites d’utilisation',
          body: 'Chaque compte peut conserver jusqu’à 20 applications publiées simultanément. Nous pouvons refuser les charges dont l’objectif principal est de consommer des ressources de calcul — par exemple le minage de cryptomonnaies, les attaques par force brute distribuées ou la génération de trafic — plutôt que de créer ou d’exploiter une véritable application.',
          items: [
            'Jusqu’à 20 applications publiées simultanément',
            'Aucune charge dédiée exclusivement au calcul ou au minage',
            'Aucune génération de trafic ou de charge',
            'Utilisation équitable des ressources de calcul',
          ],
        },
        {
          id: 'response',
          title: 'Traitement des abus',
          body: 'Un abus peut entraîner la suspension de l’espace de travail, des restrictions au niveau de l’organisation et une remontée vers l’équipe d’audit.',
          items: [
            'Suspension de l’espace de travail',
            'Restrictions de l’organisation',
            'Remontée vers l’équipe d’audit',
            'Examen par l’assistance',
          ],
        },
      ],
    },
  },
} as const satisfies MarketingExactAcceptableUseCopy;

export function getMarketingExactAcceptableUseCopy(language?: string | null): MarketingExactAcceptableUseCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactAcceptableUseFr : marketingExactAcceptableUseEn;
}
