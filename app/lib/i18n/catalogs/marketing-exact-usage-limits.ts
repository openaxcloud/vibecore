import { resolveMarketingLanguage } from './marketing';

export type UsageLimitsSectionId = 'metering' | 'plans' | 'credits' | 'limits' | 'fair-use';

interface MarketingExactUsageLimitsCopy {
  exactUsageLimits: {
    seo: { title: string; description: string; imageAlt: string };
    page: {
      title: string;
      eyebrow: string;
      description: string;
      primaryAction: string;
      secondaryAction: string;
      highlights: readonly string[];
      sections: readonly {
        id: UsageLimitsSectionId;
        title: string;
        body: string;
        items: readonly string[];
      }[];
    };
  };
}

export const marketingExactUsageLimitsEn = {
  exactUsageLimits: {
    seo: {
      title: 'Usage quotas and limits — E-Code',
      description:
        'Learn what E-Code meters, how plan limits differ, and what happens when an organization reaches a usage limit.',
      imageAlt: 'E-Code usage quotas, metering, and spending controls',
    },
    page: {
      title: 'Usage quotas and limits',
      eyebrow: 'Legal',
      description:
        'E-Code meters the resources your projects consume so limits remain fair and predictable. Learn what is measured, how plans differ, and what happens at a limit.',
      primaryAction: 'Compare plans',
      secondaryAction: 'View your usage',
      highlights: ['AI credits', 'Compute and storage', 'Workspaces', 'Fair use'],
      sections: [
        {
          id: 'metering',
          title: 'What we meter',
          body: 'Usage is tracked per organization against quota keys so you always know where you stand. Your live numbers are available on the in-app Usage dashboard.',
          items: [
            'AI usage — input and output tokens, plus agent checkpoints',
            'Compute — active workspace runtime',
            'Storage — project files and object storage (GiB-months)',
            'Deployments and public previews',
            'Projects and collaborators',
          ],
        },
        {
          id: 'plans',
          title: 'Plans and limits',
          body: 'Each plan (Starter, Core, Pro, Enterprise) includes a monthly credit allowance and progressively higher limits for workspaces, storage, collaborators, and parallel agents. Enterprise also supports custom quotas and overrides.',
          items: [
            'Starter — entry limits for trying E-Code',
            'Core and Pro — higher included credits and limits',
            'Enterprise — custom quotas and administrative overrides',
            'Administrators can request an override for a genuine need',
          ],
        },
        {
          id: 'credits',
          title: 'Credits, pay-as-you-go, and budget caps',
          body: 'AI and billable services draw from your monthly credit wallet. When those credits run out, you can enable pay-as-you-go up to a budget cap you control. Spending alerts are sent at 50%, 80%, and 100% of that cap.',
          items: [
            'Monthly credit wallet',
            'Optional pay-as-you-go',
            'A budget cap you control',
            'Alerts at 50%, 80%, and 100%',
          ],
        },
        {
          id: 'limits',
          title: 'What happens at a limit',
          body: 'When a quota is reached, the affected action is paused before any additional cost is incurred. E-Code then guides you to upgrade or adjust your cap. Existing projects and data are never deleted merely because you reached a usage limit.',
          items: [
            'The affected action pauses before incurring cost',
            'A clear upgrade or adjustment path',
            'Existing data remains intact',
            'No silent overage',
          ],
        },
        {
          id: 'fair-use',
          title: 'Fair use',
          body: 'Limits prevent one workload from degrading the platform for everyone. We may decline workloads designed primarily to consume compute—such as crypto-mining, distributed brute-forcing, or traffic generation—rather than to build or run a genuine application. See the Acceptable Use Policy.',
          items: ['No compute-only or mining workloads', 'No traffic or load generation', 'Genuine applications only'],
        },
      ],
    },
  },
} as const satisfies MarketingExactUsageLimitsCopy;

export const marketingExactUsageLimitsFr = {
  exactUsageLimits: {
    seo: {
      title: 'Quotas et limites d’utilisation — E-Code',
      description:
        'Découvrez ce qu’E-Code mesure, les différences de limites entre les offres et ce qui se passe lorsqu’une organisation atteint un quota.',
      imageAlt: 'Quotas d’utilisation, mesures et contrôle des dépenses sur E-Code',
    },
    page: {
      title: 'Quotas et limites d’utilisation',
      eyebrow: 'Centre juridique',
      description:
        'E-Code mesure les ressources consommées par vos projets afin de garantir des limites équitables et prévisibles. Découvrez ce qui est mesuré, les différences entre les offres et ce qui se passe lorsqu’un quota est atteint.',
      primaryAction: 'Comparer les offres',
      secondaryAction: 'Consulter votre utilisation',
      highlights: ['Crédits IA', 'Calcul et stockage', 'Espaces de travail', 'Usage équitable'],
      sections: [
        {
          id: 'metering',
          title: 'Ce que nous mesurons',
          body: 'L’utilisation est suivie par organisation et par type de quota, afin que vous sachiez toujours où vous en êtes. Vos données actualisées sont disponibles dans le tableau de bord Utilisation de l’application.',
          items: [
            'Utilisation de l’IA — jetons en entrée et en sortie, ainsi que points de contrôle de l’agent',
            'Calcul — durée d’exécution active des espaces de travail',
            'Stockage — fichiers de projet et stockage objet (Gio-mois)',
            'Déploiements et aperçus publics',
            'Projets et collaborateurs',
          ],
        },
        {
          id: 'plans',
          title: 'Offres et limites',
          body: 'Chaque offre (Starter, Core, Pro, Enterprise) comprend une allocation mensuelle de crédits et des limites progressivement supérieures pour les espaces de travail, le stockage, les collaborateurs et les agents parallèles. Enterprise permet également des quotas et dérogations personnalisés.',
          items: [
            'Starter — limites initiales pour découvrir E-Code',
            'Core et Pro — davantage de crédits inclus et des limites supérieures',
            'Enterprise — quotas personnalisés et dérogations administratives',
            'Les administrateurs peuvent demander une dérogation pour un besoin réel',
          ],
        },
        {
          id: 'credits',
          title: 'Crédits, paiement à l’usage et plafonds budgétaires',
          body: 'L’IA et les services facturables puisent dans votre portefeuille mensuel de crédits. Lorsque ces crédits sont épuisés, vous pouvez activer le paiement à l’usage jusqu’au plafond budgétaire que vous définissez. Des alertes sont envoyées à 50 %, 80 % et 100 % de ce plafond.',
          items: [
            'Portefeuille mensuel de crédits',
            'Paiement à l’usage facultatif',
            'Plafond budgétaire sous votre contrôle',
            'Alertes à 50 %, 80 % et 100 %',
          ],
        },
        {
          id: 'limits',
          title: 'Lorsqu’un quota est atteint',
          body: 'Lorsqu’un quota est atteint, l’action concernée est suspendue avant d’engendrer un coût supplémentaire. E-Code vous guide ensuite pour changer d’offre ou ajuster votre plafond. Vos projets et données existants ne sont jamais supprimés au seul motif qu’une limite d’utilisation a été atteinte.',
          items: [
            'Action concernée suspendue avant tout coût supplémentaire',
            'Parcours clair pour changer d’offre ou ajuster le plafond',
            'Données existantes préservées',
            'Aucun dépassement silencieux',
          ],
        },
        {
          id: 'fair-use',
          title: 'Usage équitable',
          body: 'Les limites empêchent qu’une seule charge de travail dégrade la plateforme pour tous. Nous pouvons refuser les charges conçues principalement pour consommer des ressources de calcul — minage de cryptomonnaies, attaque par force brute distribuée ou génération de trafic, par exemple — plutôt que pour créer ou exécuter une véritable application. Consultez la Politique d’utilisation acceptable.',
          items: [
            'Aucune charge dédiée exclusivement au calcul ou au minage',
            'Aucune génération de trafic ou de charge',
            'Uniquement des applications réelles',
          ],
        },
      ],
    },
  },
} as const satisfies MarketingExactUsageLimitsCopy;

export function getMarketingExactUsageLimitsCopy(language?: string | null): MarketingExactUsageLimitsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactUsageLimitsFr : marketingExactUsageLimitsEn;
}
