import { resolveMarketingLanguage } from './marketing';

export type AccountInactivityRichTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'email'; address: string };

export type AccountInactivityRichText = readonly AccountInactivityRichTextSegment[];

export type ProgrammingLanguageId =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'cplusplus';

export type FrameworkId = 'react' | 'nextjs' | 'django' | 'fastapi' | 'express' | 'rails' | 'spring' | 'flutter';

export type LanguageBenefitId = 'ai' | 'environments' | 'mix';

interface MarketingExactAccountLanguagesCopy {
  exactAccountInactivity: {
    seo: { title: string; description: string; imageAlt: string };
    title: string;
    lastUpdatedLabel: string;
    intro: string;
    sections: readonly {
      id: string;
      title: string;
      paragraphs: readonly AccountInactivityRichText[];
    }[];
  };
  exactLanguages: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    languages: {
      title: string;
      action: string;
      actionAria: string;
      items: readonly { id: ProgrammingLanguageId; name: string; note: string }[];
    };
    frameworks: {
      title: string;
      description: string;
      items: readonly { id: FrameworkId; name: string; note: string }[];
    };
    benefits: {
      title: string;
      items: readonly { id: LanguageBenefitId; title: string; description: string }[];
    };
    cta: { title: string; description: string; action: string };
  };
}

export const marketingExactAccountLanguagesEn = {
  exactAccountInactivity: {
    seo: {
      title: 'Account Inactivity Policy — E-Code',
      description: 'Learn when inactive free E-Code accounts may be removed and how to keep your account active.',
      imageAlt: 'E-Code account inactivity and advance-notice policy',
    },
    title: 'Account Inactivity Policy',
    lastUpdatedLabel: 'Last updated:',
    intro:
      'To keep the platform secure and to free unused resources, E-Code may remove free accounts that have been inactive for an extended period. This policy explains what counts as inactivity, the notice you receive, and how to keep your account active.',
    sections: [
      {
        id: 'period',
        title: '1. Inactivity period',
        paragraphs: [
          [
            { kind: 'text', text: 'A ' },
            { kind: 'strong', text: 'free' },
            { kind: 'text', text: ' account with no sign-in activity for ' },
            { kind: 'strong', text: 'one (1) year' },
            {
              kind: 'text',
              text: ' is considered inactive and may be terminated. When an account is terminated for inactivity, its content — including E-Code Apps, deployments, and stored data — may be permanently deleted.',
            },
          ],
        ],
      },
      {
        id: 'paid',
        title: '2. Paid accounts are exempt',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Accounts with an active paid subscription (Core, Pro, or Enterprise) are ',
            },
            { kind: 'strong', text: 'not' },
            {
              kind: 'text',
              text: ' subject to the inactivity policy and will not be removed for inactivity while the subscription remains active.',
            },
          ],
        ],
      },
      {
        id: 'activity',
        title: '3. What counts as activity',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Signing in to E-Code resets the inactivity clock. Simply having published apps or stored data does not, on its own, count as activity.',
            },
          ],
        ],
      },
      {
        id: 'notice',
        title: '4. Notice and keeping your account',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Before any deletion for inactivity, we send advance notice to the email address on the account. To keep your account active, simply sign in. If you want to preserve a project you no longer use, export it or download your data before the inactivity period elapses. Deletion for inactivity is irreversible.',
            },
          ],
          [
            { kind: 'text', text: 'For questions, contact ' },
            { kind: 'email', address: 'support@e-code.ai' },
            { kind: 'text', text: '.' },
          ],
        ],
      },
    ],
  },
  exactLanguages: {
    seo: {
      title: 'Languages — E-Code',
      description:
        'Build with Python, JavaScript, TypeScript, Go, Rust and other major programming languages on E-Code.',
      imageAlt: 'Programming languages, frameworks and runtimes supported by E-Code',
    },
    hero: {
      title: 'Build in any language',
      description:
        'E-Code supports every major programming language with instant environments, package managers and live previews — no local setup required.',
      badge: '{count}+ languages, zero config',
    },
    languages: {
      title: 'Supported languages',
      action: 'Start building',
      actionAria: 'Start building with {language}',
      items: [
        { id: 'python', name: 'Python', note: 'Data, AI and backends with instant package installs.' },
        { id: 'javascript', name: 'JavaScript', note: 'Run Node and browser code with zero setup.' },
        { id: 'typescript', name: 'TypeScript', note: 'Type-safe apps with first-class tooling built in.' },
        { id: 'go', name: 'Go', note: 'Fast, compiled services that ship in seconds.' },
        { id: 'rust', name: 'Rust', note: 'Memory-safe systems code with Cargo ready to go.' },
        { id: 'java', name: 'Java', note: 'Enterprise apps and APIs on a managed JVM.' },
        { id: 'csharp', name: 'C#', note: 'Build .NET services and tools in the cloud.' },
        { id: 'ruby', name: 'Ruby', note: 'Rails and scripts with gems pre-wired.' },
        { id: 'php', name: 'PHP', note: 'Classic web stacks and modern Laravel apps.' },
        { id: 'swift', name: 'Swift', note: 'Server-side Swift and quick prototyping.' },
        { id: 'kotlin', name: 'Kotlin', note: 'Concise JVM apps and backends.' },
        { id: 'cplusplus', name: 'C++', note: 'High-performance code with a full compiler toolchain.' },
      ],
    },
    frameworks: {
      title: 'Frameworks and runtimes',
      description:
        'Spin up the stack you already know. E-Code detects your project and installs dependencies automatically.',
      items: [
        { id: 'react', name: 'React', note: 'Modern front-ends with hot reload previews.' },
        { id: 'nextjs', name: 'Next.js', note: 'Full-stack React with server rendering.' },
        { id: 'django', name: 'Django', note: 'Batteries-included Python web framework.' },
        { id: 'fastapi', name: 'FastAPI', note: 'Async Python APIs with auto docs.' },
        { id: 'express', name: 'Express', note: 'Minimal, flexible Node.js servers.' },
        { id: 'rails', name: 'Rails', note: 'Convention-first Ruby web apps.' },
        { id: 'spring', name: 'Spring Boot', note: 'Production-ready Java services.' },
        { id: 'flutter', name: 'Flutter', note: 'Cross-platform UIs from one codebase.' },
      ],
    },
    benefits: {
      title: 'One workspace, every stack',
      items: [
        {
          id: 'ai',
          title: 'AI-native',
          description: 'Describe what you want and generate working code in any supported language.',
        },
        {
          id: 'environments',
          title: 'Instant environments',
          description: 'Compilers, package managers and a full terminal are ready the moment you open a project.',
        },
        {
          id: 'mix',
          title: 'Mix and match',
          description: 'Combine a Python backend with a TypeScript front-end in a single workspace.',
        },
      ],
    },
    cta: {
      title: 'Pick a language and start building',
      description:
        'Open a workspace, write a prompt and watch E-Code scaffold your project in the stack of your choice.',
      action: 'Start building',
    },
  },
} as const satisfies MarketingExactAccountLanguagesCopy;

export const marketingExactAccountLanguagesFr = {
  exactAccountInactivity: {
    seo: {
      title: 'Politique d’inactivité du compte — E-Code',
      description:
        'Découvrez dans quels cas un compte E-Code gratuit inactif peut être supprimé et comment maintenir votre compte actif.',
      imageAlt: 'Politique E-Code relative à l’inactivité des comptes et au préavis de suppression',
    },
    title: 'Politique d’inactivité du compte',
    lastUpdatedLabel: 'Dernière mise à jour :',
    intro:
      'Afin de sécuriser la plateforme et de libérer les ressources inutilisées, E-Code peut supprimer les comptes gratuits restés inactifs pendant une période prolongée. Cette politique précise ce qui constitue une inactivité, le préavis que vous recevez et la manière de maintenir votre compte actif.',
    sections: [
      {
        id: 'period',
        title: '1. Période d’inactivité',
        paragraphs: [
          [
            { kind: 'text', text: 'Un compte ' },
            { kind: 'strong', text: 'gratuit' },
            { kind: 'text', text: ' sans aucune connexion pendant ' },
            { kind: 'strong', text: 'un (1) an' },
            {
              kind: 'text',
              text: ' est considéré comme inactif et peut être clôturé. Lorsqu’un compte est clôturé pour inactivité, son contenu — notamment les applications E-Code, les déploiements et les données stockées — peut être définitivement supprimé.',
            },
          ],
        ],
      },
      {
        id: 'paid',
        title: '2. Les comptes payants ne sont pas concernés',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Les comptes disposant d’un abonnement payant actif (Core, Pro ou Enterprise) ',
            },
            { kind: 'strong', text: 'ne sont pas' },
            {
              kind: 'text',
              text: ' soumis à la politique d’inactivité et ne seront pas supprimés pour inactivité tant que leur abonnement reste actif.',
            },
          ],
        ],
      },
      {
        id: 'activity',
        title: '3. Ce qui est considéré comme une activité',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Toute connexion à E-Code réinitialise le délai d’inactivité. Le seul fait de conserver des applications publiées ou des données stockées n’est pas considéré comme une activité.',
            },
          ],
        ],
      },
      {
        id: 'notice',
        title: '4. Préavis et conservation de votre compte',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Avant toute suppression pour inactivité, nous envoyons un préavis à l’adresse e-mail associée au compte. Pour maintenir votre compte actif, il vous suffit de vous connecter. Si vous souhaitez conserver un projet que vous n’utilisez plus, exportez-le ou téléchargez vos données avant l’expiration du délai d’inactivité. Toute suppression pour inactivité est irréversible.',
            },
          ],
          [
            { kind: 'text', text: 'Pour toute question, écrivez à ' },
            { kind: 'email', address: 'support@e-code.ai' },
            { kind: 'text', text: '.' },
          ],
        ],
      },
    ],
  },
  exactLanguages: {
    seo: {
      title: 'Langages — E-Code',
      description:
        'Créez avec Python, JavaScript, TypeScript, Go, Rust et les principaux langages de programmation sur E-Code.',
      imageAlt: 'Langages de programmation, frameworks et environnements d’exécution pris en charge par E-Code',
    },
    hero: {
      title: 'Créez dans le langage de votre choix',
      description:
        'E-Code prend en charge tous les principaux langages de programmation avec des environnements instantanés, des gestionnaires de paquets et des aperçus en direct, sans configuration locale.',
      badge: 'Plus de {count} langages, zéro configuration',
    },
    languages: {
      title: 'Langages pris en charge',
      action: 'Commencer à créer',
      actionAria: 'Commencer à créer avec {language}',
      items: [
        {
          id: 'python',
          name: 'Python',
          note: 'Données, IA et services applicatifs avec installation instantanée des paquets.',
        },
        {
          id: 'javascript',
          name: 'JavaScript',
          note: 'Exécutez du code Node.js et navigateur sans aucune configuration.',
        },
        {
          id: 'typescript',
          name: 'TypeScript',
          note: 'Applications typées avec des outils de premier ordre déjà intégrés.',
        },
        { id: 'go', name: 'Go', note: 'Services compilés et rapides, prêts à être livrés en quelques secondes.' },
        { id: 'rust', name: 'Rust', note: 'Code système sûr en mémoire, avec Cargo prêt à l’emploi.' },
        { id: 'java', name: 'Java', note: 'Applications d’entreprise et API sur une JVM administrée.' },
        { id: 'csharp', name: 'C#', note: 'Créez des services et des outils .NET dans le cloud.' },
        { id: 'ruby', name: 'Ruby', note: 'Rails et scripts, avec les gems déjà configurées.' },
        { id: 'php', name: 'PHP', note: 'Technologies web classiques et applications Laravel modernes.' },
        { id: 'swift', name: 'Swift', note: 'Swift côté serveur et prototypage rapide.' },
        { id: 'kotlin', name: 'Kotlin', note: 'Applications JVM concises et services applicatifs.' },
        {
          id: 'cplusplus',
          name: 'C++',
          note: 'Code haute performance avec une chaîne d’outils de compilation complète.',
        },
      ],
    },
    frameworks: {
      title: 'Frameworks et environnements d’exécution',
      description:
        'Lancez les technologies que vous maîtrisez déjà. E-Code détecte votre projet et installe automatiquement ses dépendances.',
      items: [
        { id: 'react', name: 'React', note: 'Interfaces web modernes avec aperçu et rechargement à chaud.' },
        { id: 'nextjs', name: 'Next.js', note: 'Applications React complètes avec rendu côté serveur.' },
        { id: 'django', name: 'Django', note: 'Framework web Python complet, prêt à l’emploi.' },
        { id: 'fastapi', name: 'FastAPI', note: 'API Python asynchrones avec documentation automatique.' },
        { id: 'express', name: 'Express', note: 'Serveurs Node.js minimalistes et flexibles.' },
        { id: 'rails', name: 'Rails', note: 'Applications web Ruby guidées par les conventions.' },
        { id: 'spring', name: 'Spring Boot', note: 'Services Java prêts pour la production.' },
        { id: 'flutter', name: 'Flutter', note: 'Interfaces multiplateformes à partir d’une base de code unique.' },
      ],
    },
    benefits: {
      title: 'Un espace de travail, toutes vos technologies',
      items: [
        {
          id: 'ai',
          title: 'Natif avec l’IA',
          description: 'Décrivez votre besoin et générez du code fonctionnel dans chaque langage pris en charge.',
        },
        {
          id: 'environments',
          title: 'Environnements instantanés',
          description:
            'Compilateurs, gestionnaires de paquets et terminal complet sont prêts dès l’ouverture d’un projet.',
        },
        {
          id: 'mix',
          title: 'Combinez les technologies',
          description:
            'Associez un service applicatif Python à une interface utilisateur TypeScript dans un même espace de travail.',
        },
      ],
    },
    cta: {
      title: 'Choisissez un langage et commencez à créer',
      description:
        'Ouvrez un espace de travail, rédigez un prompt et regardez E-Code générer la structure de votre projet avec les technologies de votre choix.',
      action: 'Commencer à créer',
    },
  },
} as const satisfies MarketingExactAccountLanguagesCopy;

export function getMarketingExactAccountLanguagesCopy(language?: string | null): MarketingExactAccountLanguagesCopy {
  return resolveMarketingLanguage(language) === 'fr'
    ? marketingExactAccountLanguagesFr
    : marketingExactAccountLanguagesEn;
}

export function interpolateMarketingExactAccountLanguagesCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatMarketingExactAccountLanguagesInteger(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}
