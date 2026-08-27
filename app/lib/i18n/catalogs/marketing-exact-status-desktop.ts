import { resolveMarketingLanguage } from './marketing';

export type StatusServiceId = 'api' | 'workspaces' | 'deployments' | 'agent' | 'dashboard' | 'database';
export type StatusPrincipleId = 'monitoring' | 'transparency' | 'resilience';
export type DesktopOperatingSystemId = 'macos' | 'windows' | 'linux';
export type DesktopCapabilityId =
  | 'nativeIde'
  | 'performance'
  | 'offline'
  | 'workspaces'
  | 'integration'
  | 'multiWindow';
export type DesktopGitPointId = 'staging' | 'branches' | 'sync';

type PluralCopy = Readonly<{ one: string; other: string }>;

interface MarketingExactStatusDesktopCopy {
  exactStatus: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; operational: string };
    subscription: {
      trigger: string;
      title: string;
      success: string;
      emailPlaceholder: string;
      emailAria: string;
      submitting: string;
      submit: string;
      errors: { invalidEmail: string; rateLimit: string; fallback: string };
      channelNote: string;
    };
    services: {
      title: string;
      description: string;
      operational: string;
      items: readonly { id: StatusServiceId; name: string; description: string }[];
    };
    history: {
      title: PluralCopy;
      description: string;
      empty: string;
      details: string;
      severity: { warning: string; error: string };
      duration: { hours: PluralCopy; minutes: PluralCopy };
    };
    reliability: {
      badge: string;
      title: string;
      imageAlt: string;
      items: readonly { id: StatusPrincipleId; title: string; description: string }[];
    };
    providers: { title: string; description: string; body: string };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
  exactDesktop: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { badge: string; title: string; description: string; downloadTemplate: string };
    showcase: { windowTitle: string; imageAlt: string; caption: string };
    downloads: {
      title: string;
      description: string;
      cardTitleTemplate: string;
      items: readonly { id: DesktopOperatingSystemId; hint: string }[];
    };
    capabilities: {
      title: string;
      description: string;
      items: readonly { id: DesktopCapabilityId; title: string; description: string }[];
    };
    git: {
      badge: string;
      title: string;
      description: string;
      points: readonly { id: DesktopGitPointId; text: string }[];
      windowTitle: string;
      imageAlt: string;
    };
    requirements: {
      title: string;
      description: string;
      minimum: string;
      footer: string;
      items: readonly { id: DesktopOperatingSystemId; specs: readonly string[] }[];
    };
    cta: { title: string; description: string; button: string };
  };
}

export const marketingExactStatusDesktopEn = {
  exactStatus: {
    seo: {
      title: 'System Status — E-Code',
      description: 'Check the live status, uptime and recent incidents for E-Code services.',
      imageAlt: 'E-Code system status and service availability',
    },
    hero: {
      title: 'Platform status',
      description:
        'A live look at the services behind E-Code and how we keep you informed when something needs attention.',
      operational: 'All systems operational',
    },
    subscription: {
      trigger: 'Subscribe to updates',
      title: 'Get incident updates by email',
      success: "You're subscribed — incident updates will land in your inbox.",
      emailPlaceholder: 'you@company.com',
      emailAria: 'Email address',
      submitting: 'Subscribing…',
      submit: 'Subscribe',
      errors: {
        invalidEmail: 'Enter a valid email address.',
        rateLimit: 'Too many attempts — try again in a minute.',
        fallback: 'Subscription failed. Please try again.',
      },
      channelNote: "Email is the only update channel for now — RSS and webhooks aren't available yet.",
    },
    services: {
      title: 'Core services',
      description: 'The building blocks that run every project on E-Code.',
      operational: 'Operational',
      items: [
        {
          id: 'api',
          name: 'API',
          description: 'REST endpoints powering projects, builds and account operations.',
        },
        {
          id: 'workspaces',
          name: 'Workspaces',
          description: 'Cloud development environments, runtimes and live previews.',
        },
        {
          id: 'deployments',
          name: 'Deployments',
          description: 'Build pipelines and hosting for shipped applications.',
        },
        {
          id: 'agent',
          name: 'AI Agent',
          description: 'Code generation and autonomous assistance across providers.',
        },
        {
          id: 'dashboard',
          name: 'Dashboard',
          description: 'The web console for projects, settings and team management.',
        },
        {
          id: 'database',
          name: 'Database',
          description: 'Managed Postgres and persistent storage for your apps.',
        },
      ],
    },
    history: {
      title: {
        one: 'Incident history (last {count} day)',
        other: 'Incident history (last {count} days)',
      },
      description: 'A day-by-day record of platform incidents, most recent first.',
      empty: 'No incidents reported',
      details: 'Details',
      severity: { warning: 'Degraded', error: 'Outage' },
      duration: {
        hours: { one: '{count} hour', other: '{count} hours' },
        minutes: { one: '{count} minute', other: '{count} minutes' },
      },
    },
    reliability: {
      badge: 'Reliability',
      title: 'How we keep E-Code running',
      imageAlt: 'The E-Code dashboard used to manage projects and monitor running workspaces',
      items: [
        {
          id: 'monitoring',
          title: 'Continuous monitoring',
          description:
            'Every core service — API, workspaces, deployments and the AI agent — is monitored around the clock so issues surface fast.',
        },
        {
          id: 'transparency',
          title: 'Transparent incident updates',
          description:
            'When something goes wrong, we post what happened, what we are doing, and when it is resolved — no vague status pages.',
        },
        {
          id: 'resilience',
          title: 'Built for resilience',
          description:
            'Workspaces, builds and storage run on managed Kubernetes with automatic recovery, so a single failure does not take you down.',
        },
      ],
    },
    providers: {
      title: 'AI model providers',
      description: 'The agent routes across multiple model providers.',
      body: 'Code generation depends on upstream AI providers such as OpenAI and Anthropic. When a provider degrades, the agent can fall back to an available model so you can keep working — and we report any provider-side disruption here.',
    },
    cta: {
      title: 'Build on a platform that stays up',
      description:
        'Spin up a workspace, ship a deployment, and let the agent do the heavy lifting. Your next app is one prompt away.',
      primary: 'Get started for free',
      secondary: 'Open dashboard',
    },
  },
  exactDesktop: {
    seo: {
      title: 'Desktop App — E-Code',
      description: 'Download the E-Code desktop app for macOS, Windows and Linux.',
      imageAlt: 'The E-Code desktop application for macOS, Windows and Linux',
    },
    hero: {
      badge: 'Public beta · macOS, Windows & Linux',
      title: 'E-Code on your desktop',
      description:
        'The full E-Code AI development platform as a native app — the same Agent, editor, terminal, and previews you know from the web, now faster, offline-ready, and built into your operating system.',
      downloadTemplate: 'Download for {os}',
    },
    showcase: {
      windowTitle: 'E-Code — todo-app',
      imageAlt: 'The full E-Code desktop IDE: AI Agent panel, code editor, file tree, terminal, and Run/Publish bar',
      caption: 'The real E-Code desktop IDE — Agent panel, editor, files, terminal, and the Run / Publish bar.',
    },
    downloads: {
      title: 'Download the desktop app',
      description:
        'Code-signed and notarized builds for every major platform. Auto-updates keep you on the latest release.',
      cardTitleTemplate: 'Download for {os}',
      items: [
        { id: 'macos', hint: 'Universal · Apple Silicon & Intel' },
        { id: 'windows', hint: '64-bit · Windows 10 and later' },
        { id: 'linux', hint: 'AppImage · Debian & RPM' },
      ],
    },
    capabilities: {
      title: 'Why go native',
      description:
        'Everything the web app does, plus the speed, reach, and OS integration only a desktop app can offer.',
      items: [
        {
          id: 'nativeIde',
          title: 'The full IDE, natively',
          description:
            'The same Agent panel, editor, file tree, terminal, and Run/Publish bar from the web — running in a dedicated desktop window.',
        },
        {
          id: 'performance',
          title: 'Native performance',
          description:
            'A purpose-built desktop runtime keeps the editor, terminal, and previews instant — no browser tab tax.',
        },
        {
          id: 'offline',
          title: 'Offline-capable PWA',
          description:
            'Keep coding on the plane or off the grid. Your workspace syncs back automatically once you reconnect.',
        },
        {
          id: 'workspaces',
          title: 'Local + cloud workspaces',
          description:
            'Open a project on your own machine or attach to a managed cloud workspace — switch between them without leaving the app.',
        },
        {
          id: 'integration',
          title: 'Deep OS integration',
          description:
            'Native file dialogs, system notifications, the menu bar, and global shortcuts feel right at home.',
        },
        {
          id: 'multiWindow',
          title: 'Multi-window',
          description:
            'Pop projects, terminals, and previews into their own windows and spread work across every display.',
        },
      ],
    },
    git: {
      badge: 'Built-in version control',
      title: 'Full Git, right in the window',
      description:
        'Stage, commit, branch, and review your history without leaving the editor. The native app surfaces the same first-class Git panel as the web — backed by your local file system.',
      points: [
        { id: 'staging', text: 'Working-tree diff with one-click staging' },
        { id: 'branches', text: 'Branch switching and a live commit graph' },
        { id: 'sync', text: 'Push, pull, and sync to your connected remotes' },
      ],
      windowTitle: 'E-Code — Source Control',
      imageAlt: "E-Code's real Git panel: current branch, working tree changes, orange Commit button, and commit graph",
    },
    requirements: {
      title: 'System requirements',
      description: 'Lightweight by design — E-Code runs comfortably on the machine you already have.',
      minimum: 'Minimum supported configuration',
      footer: 'All builds are code-signed and notarized · automatic background updates',
      items: [
        {
          id: 'macos',
          specs: [
            'macOS 12 Monterey or later',
            'Apple Silicon or Intel',
            '4 GB RAM (8 GB recommended)',
            '600 MB free disk space',
          ],
        },
        {
          id: 'windows',
          specs: [
            'Windows 10 / 11 (64-bit)',
            'x64 or ARM64 processor',
            '4 GB RAM (8 GB recommended)',
            '600 MB free disk space',
          ],
        },
        {
          id: 'linux',
          specs: [
            'Ubuntu 20.04+ / Fedora 36+',
            'glibc 2.31 or newer',
            '4 GB RAM (8 GB recommended)',
            '600 MB free disk space',
          ],
        },
      ],
    },
    cta: {
      title: 'Bring E-Code everywhere you build',
      description:
        'The same projects, agents, and previews you know from the web — now with the speed and reach of a native desktop app.',
      button: 'Get the desktop app',
    },
  },
} as const satisfies MarketingExactStatusDesktopCopy;

export const marketingExactStatusDesktopFr = {
  exactStatus: {
    seo: {
      title: 'État du système — E-Code',
      description: 'Consultez en direct l’état, la disponibilité et les incidents récents des services E-Code.',
      imageAlt: 'État du système E-Code et disponibilité des services',
    },
    hero: {
      title: 'État de la plateforme',
      description:
        'Consultez en direct les services qui font fonctionner E-Code et la façon dont nous vous informons lorsqu’un élément nécessite votre attention.',
      operational: 'Tous les systèmes sont opérationnels',
    },
    subscription: {
      trigger: 'S’abonner aux mises à jour',
      title: 'Recevez les mises à jour d’incident par e-mail',
      success: 'Votre abonnement est confirmé — les mises à jour d’incident arriveront dans votre boîte de réception.',
      emailPlaceholder: 'vous@entreprise.fr',
      emailAria: 'Adresse e-mail',
      submitting: 'Abonnement en cours…',
      submit: 'S’abonner',
      errors: {
        invalidEmail: 'Saisissez une adresse e-mail valide.',
        rateLimit: 'Trop de tentatives — réessayez dans une minute.',
        fallback: 'Échec de l’abonnement. Veuillez réessayer.',
      },
      channelNote:
        'L’e-mail est pour l’instant le seul canal de mise à jour — les flux RSS et les webhooks ne sont pas encore disponibles.',
    },
    services: {
      title: 'Services essentiels',
      description: 'Les composants qui font fonctionner chaque projet sur E-Code.',
      operational: 'Opérationnel',
      items: [
        {
          id: 'api',
          name: 'API',
          description: 'Points de terminaison REST pour les projets, les compilations et la gestion des comptes.',
        },
        {
          id: 'workspaces',
          name: 'Espaces de travail',
          description:
            'Environnements de développement dans le cloud, environnements d’exécution et aperçus en direct.',
        },
        {
          id: 'deployments',
          name: 'Déploiements',
          description: 'Chaînes de compilation et hébergement des applications livrées.',
        },
        {
          id: 'agent',
          name: 'Agent IA',
          description: 'Génération de code et assistance autonome auprès de plusieurs fournisseurs.',
        },
        {
          id: 'dashboard',
          name: 'Tableau de bord',
          description: 'Console web pour gérer les projets, les paramètres et les équipes.',
        },
        {
          id: 'database',
          name: 'Base de données',
          description: 'Postgres géré et stockage persistant pour vos applications.',
        },
      ],
    },
    history: {
      title: {
        one: 'Historique des incidents ({count} dernier jour)',
        other: 'Historique des incidents ({count} derniers jours)',
      },
      description: 'Le relevé quotidien des incidents de la plateforme, du plus récent au plus ancien.',
      empty: 'Aucun incident signalé',
      details: 'Détails',
      severity: { warning: 'Service dégradé', error: 'Interruption' },
      duration: {
        hours: { one: '{count} heure', other: '{count} heures' },
        minutes: { one: '{count} minute', other: '{count} minutes' },
      },
    },
    reliability: {
      badge: 'Fiabilité',
      title: 'Comment nous assurons la disponibilité d’E-Code',
      imageAlt: 'Le tableau de bord E-Code utilisé pour gérer les projets et surveiller les espaces de travail actifs',
      items: [
        {
          id: 'monitoring',
          title: 'Surveillance continue',
          description:
            'Chaque service essentiel — API, espaces de travail, déploiements et agent IA — est surveillé en continu afin de détecter rapidement les problèmes.',
        },
        {
          id: 'transparency',
          title: 'Communication transparente lors des incidents',
          description:
            'Lorsqu’un problème survient, nous indiquons ce qui s’est passé, les mesures prises et le moment de sa résolution, sans message imprécis.',
        },
        {
          id: 'resilience',
          title: 'Conçu pour la résilience',
          description:
            'Les espaces de travail, les compilations et le stockage fonctionnent sur une infrastructure Kubernetes gérée avec récupération automatique, afin qu’une défaillance isolée ne vous interrompe pas.',
        },
      ],
    },
    providers: {
      title: 'Fournisseurs de modèles d’IA',
      description: 'L’agent distribue les requêtes entre plusieurs fournisseurs de modèles.',
      body: 'La génération de code dépend de fournisseurs d’IA externes tels qu’OpenAI et Anthropic. Si l’un d’eux subit une dégradation, l’agent peut se rabattre sur un modèle disponible pour que vous puissiez continuer à travailler ; nous signalons ici toute perturbation provenant d’un fournisseur.',
    },
    cta: {
      title: 'Développez sur une plateforme qui reste disponible',
      description:
        'Créez un espace de travail, livrez un déploiement et laissez l’agent prendre en charge le travail complexe. Votre prochaine application n’est plus qu’à un prompt.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
  exactDesktop: {
    seo: {
      title: 'Application de bureau — E-Code',
      description: 'Téléchargez l’application de bureau E-Code pour macOS, Windows et Linux.',
      imageAlt: 'L’application de bureau E-Code pour macOS, Windows et Linux',
    },
    hero: {
      badge: 'Bêta publique · macOS, Windows et Linux',
      title: 'E-Code sur votre ordinateur',
      description:
        'Retrouvez toute la plateforme de développement E-Code avec IA dans une application native : le même agent, le même éditeur, le même terminal et les mêmes aperçus que sur le web, avec davantage de rapidité, un mode hors ligne et une intégration à votre système.',
      downloadTemplate: 'Télécharger pour {os}',
    },
    showcase: {
      windowTitle: 'E-Code — todo-app',
      imageAlt:
        'L’IDE de bureau E-Code complet : panneau de l’agent IA, éditeur de code, arborescence des fichiers, terminal et barre Exécuter/Publier',
      caption:
        'Le véritable IDE de bureau E-Code : panneau de l’agent, éditeur, fichiers, terminal et barre Exécuter / Publier.',
    },
    downloads: {
      title: 'Télécharger l’application de bureau',
      description:
        'Des versions signées et notariées pour toutes les principales plateformes. Les mises à jour automatiques vous font bénéficier de la dernière version.',
      cardTitleTemplate: 'Télécharger pour {os}',
      items: [
        { id: 'macos', hint: 'Universelle · Apple Silicon et Intel' },
        { id: 'windows', hint: '64 bits · Windows 10 ou version ultérieure' },
        { id: 'linux', hint: 'AppImage · Debian et RPM' },
      ],
    },
    capabilities: {
      title: 'Pourquoi choisir l’application native',
      description:
        'Toutes les possibilités de l’application web, avec la rapidité, la portée et l’intégration au système que seule une application de bureau peut offrir.',
      items: [
        {
          id: 'nativeIde',
          title: 'L’IDE complet, en natif',
          description:
            'Le même panneau Agent, le même éditeur, la même arborescence des fichiers, le même terminal et la même barre Exécuter/Publier que sur le web, dans une fenêtre dédiée.',
        },
        {
          id: 'performance',
          title: 'Performances natives',
          description:
            'Un environnement d’exécution conçu pour le bureau maintient l’éditeur, le terminal et les aperçus parfaitement réactifs, sans la surcharge d’un onglet de navigateur.',
        },
        {
          id: 'offline',
          title: 'PWA utilisable hors ligne',
          description:
            'Continuez à programmer dans l’avion ou sans réseau. Votre espace de travail se synchronise automatiquement dès votre reconnexion.',
        },
        {
          id: 'workspaces',
          title: 'Espaces de travail locaux et cloud',
          description:
            'Ouvrez un projet sur votre machine ou connectez-vous à un espace de travail cloud géré, puis passez de l’un à l’autre sans quitter l’application.',
        },
        {
          id: 'integration',
          title: 'Intégration poussée au système',
          description:
            'Les boîtes de dialogue de fichiers natives, les notifications système, la barre de menus et les raccourcis globaux s’intègrent naturellement.',
        },
        {
          id: 'multiWindow',
          title: 'Multifenêtre',
          description:
            'Ouvrez les projets, terminaux et aperçus dans leurs propres fenêtres et répartissez votre travail sur tous vos écrans.',
        },
      ],
    },
    git: {
      badge: 'Gestion de versions intégrée',
      title: 'Git au complet, directement dans la fenêtre',
      description:
        'Indexez, effectuez vos commit, créez des branches et consultez votre historique sans quitter l’éditeur. L’application native offre le même panneau Git complet que le web, connecté à votre système de fichiers local.',
      points: [
        { id: 'staging', text: 'Diff de l’arbre de travail avec indexation en un clic' },
        { id: 'branches', text: 'Changement de branche et graphe des commit en direct' },
        { id: 'sync', text: 'Push, pull et synchronisation avec vos dépôts distants connectés' },
      ],
      windowTitle: 'E-Code — Gestion de versions',
      imageAlt:
        'Le véritable panneau Git d’E-Code : branche actuelle, modifications de l’arbre de travail, bouton Commit orange et graphe des commit',
    },
    requirements: {
      title: 'Configuration requise',
      description: 'Conçu pour être léger, E-Code fonctionne confortablement sur la machine que vous utilisez déjà.',
      minimum: 'Configuration minimale prise en charge',
      footer: 'Toutes les versions sont signées et notariées · mises à jour automatiques en arrière-plan',
      items: [
        {
          id: 'macos',
          specs: [
            'macOS 12 Monterey ou version ultérieure',
            'Apple Silicon ou Intel',
            '4 Go de RAM (8 Go recommandés)',
            '600 Mo d’espace disque disponible',
          ],
        },
        {
          id: 'windows',
          specs: [
            'Windows 10 / 11 (64 bits)',
            'Processeur x64 ou ARM64',
            '4 Go de RAM (8 Go recommandés)',
            '600 Mo d’espace disque disponible',
          ],
        },
        {
          id: 'linux',
          specs: [
            'Ubuntu 20.04+ / Fedora 36+',
            'glibc 2.31 ou version ultérieure',
            '4 Go de RAM (8 Go recommandés)',
            '600 Mo d’espace disque disponible',
          ],
        },
      ],
    },
    cta: {
      title: 'Emportez E-Code partout où vous créez',
      description:
        'Retrouvez les mêmes projets, agents et aperçus que sur le web, avec la rapidité et la portée d’une application de bureau native.',
      button: 'Télécharger l’application de bureau',
    },
  },
} as const satisfies MarketingExactStatusDesktopCopy;

export type StatusDesktopInterpolationValue = string | number;

const STATUS_DESKTOP_INTERPOLATION_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;

export function interpolateMarketingExactStatusDesktopCopy(
  template: string,
  values: Readonly<Record<string, StatusDesktopInterpolationValue>>,
): string {
  const tokens = [...template.matchAll(STATUS_DESKTOP_INTERPOLATION_TOKEN)].map((match) => match[1]);
  const uniqueTokens = [...new Set(tokens)];
  const remainder = template.replace(STATUS_DESKTOP_INTERPOLATION_TOKEN, '');

  if (remainder.includes('{') || remainder.includes('}')) {
    throw new Error('Malformed status/desktop interpolation template.');
  }

  for (const token of uniqueTokens) {
    if (!Object.prototype.hasOwnProperty.call(values, token)) {
      throw new Error(`Missing status/desktop interpolation value: ${token}.`);
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (!uniqueTokens.includes(key)) {
      throw new Error(`Unused status/desktop interpolation value: ${key}.`);
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`Invalid status/desktop interpolation value: ${key}.`);
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      throw new Error(`Empty status/desktop interpolation value: ${key}.`);
    }
  }

  return template.replace(STATUS_DESKTOP_INTERPOLATION_TOKEN, (_token, key: string) => String(values[key]));
}

export function getMarketingExactStatusDesktopCopy(language?: string | null): MarketingExactStatusDesktopCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactStatusDesktopFr : marketingExactStatusDesktopEn;
}

function statusLocale(language?: string | null): 'en-US' | 'fr-FR' {
  return resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatStatusDay(date: Date, language?: string | null): string {
  return new Intl.DateTimeFormat(statusLocale(language), {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function formatStatusUnit(value: number, forms: PluralCopy, language?: string | null): string {
  const locale = statusLocale(language);
  const form = new Intl.PluralRules(locale).select(value) === 'one' ? forms.one : forms.other;

  return interpolateMarketingExactStatusDesktopCopy(form, {
    count: new Intl.NumberFormat(locale).format(value),
  });
}

export function formatStatusIncidentDuration(totalMinutes: number, language?: string | null): string {
  const copy = getMarketingExactStatusDesktopCopy(language).exactStatus.history.duration;
  const normalizedMinutes = Math.max(0, Math.floor(Number.isFinite(totalMinutes) ? totalMinutes : 0));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  if (hours === 0) {
    return formatStatusUnit(minutes, copy.minutes, language);
  }

  const formattedHours = formatStatusUnit(hours, copy.hours, language);

  return minutes === 0 ? formattedHours : `${formattedHours} ${formatStatusUnit(minutes, copy.minutes, language)}`;
}

export function formatStatusHistoryTitle(days: number, language?: string | null): string {
  const locale = statusLocale(language);
  const normalizedDays = Math.max(1, Math.floor(Number.isFinite(days) ? days : 1));
  const forms = getMarketingExactStatusDesktopCopy(language).exactStatus.history.title;
  const template = new Intl.PluralRules(locale).select(normalizedDays) === 'one' ? forms.one : forms.other;

  return interpolateMarketingExactStatusDesktopCopy(template, {
    count: new Intl.NumberFormat(locale).format(normalizedDays),
  });
}

const NEWSLETTER_ERROR_KEYS = new Map<
  string,
  keyof MarketingExactStatusDesktopCopy['exactStatus']['subscription']['errors']
>([
  ['Enter a valid email address.', 'invalidEmail'],
  ['Too many attempts — try again in a minute.', 'rateLimit'],
  ['Subscription failed. Please try again.', 'fallback'],
]);

export function localizeStatusSubscriptionError(error: string | undefined, language?: string | null): string {
  const errors = getMarketingExactStatusDesktopCopy(language).exactStatus.subscription.errors;
  const key = error ? NEWSLETTER_ERROR_KEYS.get(error) : undefined;

  if (key) {
    return errors[key];
  }

  return resolveMarketingLanguage(language) === 'en' && error ? error : errors.fallback;
}
