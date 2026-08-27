import { resolveMarketingLanguage } from './marketing';
import type { ChangelogReleaseId, ReleaseType } from '~/lib/marketing/changelog-releases';

interface ChangelogReleaseCopy {
  title: string;
  changes: readonly string[];
}

interface MarketingExactChangelogCopy {
  exactChangelog: {
    seo: {
      title: string;
      description: string;
      imageAlt: string;
    };
    hero: {
      title: string;
      description: string;
      badge: string;
    };
    product: {
      windowTitle: string;
      imageAlt: string;
      caption: string;
    };
    timeline: {
      title: string;
      changedLabel: string;
      dateUnavailable: string;
      types: Readonly<Record<ReleaseType, string>>;
    };
    releases: Readonly<Record<ChangelogReleaseId, ChangelogReleaseCopy>>;
    cta: {
      title: string;
      description: string;
      signup: string;
      dashboard: string;
    };
    feed: {
      title: string;
      description: string;
    };
  };
}

export const marketingExactChangelogEn = {
  exactChangelog: {
    seo: {
      title: 'Changelog — E-Code',
      description: 'Discover the latest features, improvements, and fixes shipped in E-Code.',
      imageAlt: 'The latest E-Code features, improvements, and fixes',
    },
    hero: {
      title: 'Changelog',
      description:
        'Every feature, improvement, and fix shipping to E-Code — the AI software studio that turns a prompt into a deployed app.',
      badge: 'Updated continuously',
    },
    product: {
      windowTitle: 'E-Code · Agent panel, editor, terminal, and live preview',
      imageAlt: 'The E-Code IDE showing the AI agent panel, code editor, terminal, and a live app preview',
      caption: 'The workspace where each release below lands.',
    },
    timeline: {
      title: 'E-Code releases',
      changedLabel: 'What changed in this release',
      dateUnavailable: 'Date unavailable',
      types: {
        New: 'New',
        Improved: 'Improved',
        Fixed: 'Fixed',
      },
    },
    releases: {
      'multi-agent-consensus': {
        title: 'Multi-agent consensus mode',
        changes: [
          'Run several AI agents in parallel lanes and merge their best work with live consensus voting',
          'Per-lane streaming so you can watch each agent reason and edit in real time',
          'New agent panel timeline with accept, reject, and rewind controls for every proposed patch',
        ],
      },
      'faster-deployments': {
        title: 'Faster, smarter deployments',
        changes: [
          'Static and full-stack builds now snapshot incrementally to shorten redeploy times',
          'Deployment logs stream live with searchable, color-coded output',
          'One-click rollback to any previous successful release from the deployments tab',
        ],
      },
      'usage-billing': {
        title: 'Usage-based credits and billing portal',
        changes: [
          'Transparent per-run credit metering for AI agents, builds, and workspace hours',
          'Self-serve billing portal to upgrade, downgrade, or manage your team plan',
          'Spend alerts and soft caps to keep surprise charges off your invoice',
        ],
      },
      'workspace-stability': {
        title: 'Workspace and preview stability',
        changes: [
          'Resolved an issue where reopening a project could leave the live preview stuck on “Starting”',
          'Fixed dependency sync occasionally being skipped after a cold start, breaking the editor',
          'Hardened terminal reconnection so remote shells survive idle timeouts without flapping',
        ],
      },
      'realtime-collaboration': {
        title: 'Real-time collaboration',
        changes: [
          'Live multiplayer editing with shared cursors, presence avatars, and per-file activity',
          'Shareable read-only and edit links for projects, with granular access controls',
          'Inline comments and patch proposals that persist across reloads',
        ],
      },
      'smarter-code-generation': {
        title: 'Smarter AI code generation',
        changes: [
          'Expanded context window so the agent reasons over larger codebases before editing',
          'Automatic provider fallback keeps chat working when a model is unavailable',
          'Generated diffs now render with clearer before-and-after views in the IDE',
        ],
      },
    },
    cta: {
      title: 'Start building with the latest E-Code',
      description:
        'Every release above is live in your workspace the moment you sign in. Describe what you want to build and let the agents ship it.',
      signup: 'Get started free',
      dashboard: 'Open dashboard',
    },
    feed: {
      title: 'E-Code Changelog',
      description: 'The latest features, improvements, and fixes shipped in E-Code.',
    },
  },
} as const satisfies MarketingExactChangelogCopy;

export const marketingExactChangelogFr = {
  exactChangelog: {
    seo: {
      title: 'Journal des modifications — E-Code',
      description: 'Découvrez les dernières fonctionnalités, améliorations et corrections livrées dans E-Code.',
      imageAlt: 'Les dernières fonctionnalités, améliorations et corrections d’E-Code',
    },
    hero: {
      title: 'Journal des modifications',
      description:
        'Découvrez chaque fonctionnalité, amélioration et correction livrée dans E-Code — le studio logiciel propulsé par l’IA qui transforme une demande en application déployée.',
      badge: 'Mis à jour en continu',
    },
    product: {
      windowTitle: 'E-Code · Panneau Agent, éditeur, terminal et aperçu en direct',
      imageAlt:
        'L’IDE E-Code affichant le panneau de l’agent IA, l’éditeur de code, le terminal et l’aperçu en direct d’une application',
      caption: 'L’espace de travail dans lequel chaque version ci-dessous est déployée.',
    },
    timeline: {
      title: 'Versions d’E-Code',
      changedLabel: 'Modifications apportées dans cette version',
      dateUnavailable: 'Date indisponible',
      types: {
        New: 'Nouveau',
        Improved: 'Amélioré',
        Fixed: 'Corrigé',
      },
    },
    releases: {
      'multi-agent-consensus': {
        title: 'Mode de consensus multi-agents',
        changes: [
          'Exécutez plusieurs agents IA en parallèle, puis fusionnez leurs meilleures contributions grâce à un vote de consensus en direct',
          'Suivez le flux de chaque agent pour observer son raisonnement et ses modifications en temps réel',
          'Nouveau fil d’activité dans le panneau Agent, avec des commandes pour accepter, refuser ou rétablir chaque modification proposée',
        ],
      },
      'faster-deployments': {
        title: 'Déploiements plus rapides et plus intelligents',
        changes: [
          'Les compilations de sites statiques et d’applications complètes utilisent désormais des instantanés incrémentiels pour accélérer les redéploiements',
          'Les journaux de déploiement sont diffusés en direct dans une sortie interrogeable avec code couleur',
          'Revenez en un clic à toute version précédemment déployée avec succès depuis l’onglet Déploiements',
        ],
      },
      'usage-billing': {
        title: 'Crédits à l’usage et portail de facturation',
        changes: [
          'Mesure transparente des crédits par exécution pour les agents IA, les compilations et les heures d’utilisation de l’espace de travail',
          'Portail de facturation en libre-service pour changer d’offre ou gérer l’offre de votre équipe',
          'Alertes de dépenses et plafonds souples pour éviter toute mauvaise surprise sur votre facture',
        ],
      },
      'workspace-stability': {
        title: 'Stabilité de l’espace de travail et de l’aperçu',
        changes: [
          'Correction d’un problème qui pouvait bloquer l’aperçu en direct sur « Démarrage » lors de la réouverture d’un projet',
          'Correction de la synchronisation des dépendances, parfois ignorée après un démarrage à froid et susceptible de perturber l’éditeur',
          'Renforcement de la reconnexion du terminal afin que les shells distants survivent aux délais d’inactivité sans reconnexions en boucle',
        ],
      },
      'realtime-collaboration': {
        title: 'Collaboration en temps réel',
        changes: [
          'Édition collaborative en direct avec curseurs partagés, avatars de présence et activité par fichier',
          'Liens partageables en lecture seule ou en modification pour les projets, avec des contrôles d’accès granulaires',
          'Commentaires intégrés et propositions de modification conservés après le rechargement',
        ],
      },
      'smarter-code-generation': {
        title: 'Génération de code par IA plus intelligente',
        changes: [
          'Fenêtre de contexte étendue pour permettre à l’agent d’analyser de plus grandes bases de code avant toute modification',
          'Le repli automatique vers un autre fournisseur maintient la conversation disponible lorsqu’un modèle ne l’est pas',
          'Les diffs générés s’affichent désormais dans des vues avant/après plus lisibles dans l’IDE',
        ],
      },
    },
    cta: {
      title: 'Créez avec la dernière version d’E-Code',
      description:
        'Chaque version ci-dessus est disponible dans votre espace de travail dès votre connexion. Décrivez ce que vous souhaitez créer et laissez les agents le mettre en production.',
      signup: 'Commencer gratuitement',
      dashboard: 'Ouvrir le tableau de bord',
    },
    feed: {
      title: 'Journal des modifications E-Code',
      description: 'Les dernières fonctionnalités, améliorations et corrections livrées dans E-Code.',
    },
  },
} as const satisfies MarketingExactChangelogCopy;

export function getMarketingExactChangelogCopy(language?: string | null): MarketingExactChangelogCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactChangelogFr : marketingExactChangelogEn;
}

export function formatMarketingExactChangelogDate(value: string, language?: string | null): string {
  const locale = resolveMarketingLanguage(language);
  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return getMarketingExactChangelogCopy(locale).exactChangelog.timeline.dateUnavailable;
  }

  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}
