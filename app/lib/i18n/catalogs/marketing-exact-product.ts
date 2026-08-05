import { resolveMarketingLanguage } from './marketing';
import type { ProductFeatureId } from './marketing-product-remaining';

export type ExactFeatureCategory =
  | 'All'
  | 'AI-Powered'
  | 'Creating'
  | 'Learning Together'
  | 'Infrastructure'
  | 'Security'
  | 'Analytics';
export type ExactMobileHighlightId = 'anywhere' | 'agent' | 'preview' | 'deploy';
export type ExactMobileCapabilityId = 'touch' | 'git' | 'cloud' | 'projects' | 'security' | 'resume';

interface MarketingExactProductCopy {
  exactProduct: {
    features: {
      tabs: readonly { id: ExactFeatureCategory; label: string }[];
      items: readonly {
        id: ProductFeatureId;
        category: Exclude<ExactFeatureCategory, 'All'>;
        details: readonly string[];
      }[];
      showcase: {
        workspaceTitle: string;
        workspaceAlt: string;
        workspaceCaption: string;
        deploymentsTitle: string;
        deploymentsAlt: string;
        deploymentsCaption: string;
      };
      empty: string;
      overview: {
        badge: string;
        title: string;
        description: string;
        points: readonly { id: 'environments' | 'ecosystem' | 'configuration'; title: string; description: string }[];
        workflow: readonly { id: 'code' | 'collaborate' | 'deploy'; title: string; description: string }[];
      };
      cta: { title: string; description: string; primary: string; secondary: string };
    };
    mobile: {
      highlights: readonly { id: ExactMobileHighlightId; title: string; description: string }[];
      capabilities: readonly { id: ExactMobileCapabilityId; title: string; description: string }[];
      flow: readonly { step: string; title: string; description: string }[];
      hero: {
        badge: string;
        title: string;
        accent: string;
        description: string;
        primary: string;
        secondary: string;
        imageAlt: string;
      };
      tour: { title: string; accent: string; description: string; showPrefix: string; imageAltPrefix: string };
      stacks: { title: string; description: string };
      capabilitiesIntro: { title: string; accent: string; description: string };
      flowIntro: { title: string; accent: string };
      comparison: {
        title: string;
        accent: string;
        suffix: string;
        typicalTitle: string;
        typicalItems: readonly string[];
        ecodeTitle: string;
        ecodeItems: readonly string[];
      };
      cta: { title: string; description: string; primary: string; secondary: string };
    };
  };
}

export const marketingExactProductEn = {
  exactProduct: {
    features: {
      tabs: [
        { id: 'All', label: 'All' },
        { id: 'AI-Powered', label: 'AI-Powered' },
        { id: 'Creating', label: 'Creating' },
        { id: 'Learning Together', label: 'Learning Together' },
        { id: 'Infrastructure', label: 'Infrastructure' },
        { id: 'Security', label: 'Security' },
        { id: 'Analytics', label: 'Analytics' },
      ],
      items: [
        {
          id: 'ai-agent',
          category: 'AI-Powered',
          details: [
            'Build entire apps from scratch automatically',
            'No coding knowledge required at all',
            'Creates all files and folders for you',
            'Installs needed tools automatically',
            'Works like having an expert helper',
            'Updates code based on your feedback',
          ],
        },
        {
          id: 'ide',
          category: 'Creating',
          details: [
            'Colors that make code easy to read',
            'Helpful suggestions as you type',
            'Multiple ways to edit faster',
            'Easy navigation through your code',
            'Automatic error detection',
            'Choose colors that feel comfortable',
          ],
        },
        {
          id: 'command-center',
          category: 'Creating',
          details: [
            'Run your programs with one click',
            'See results immediately',
            'Try multiple things at once',
            'Install tools you need easily',
            'Everything stays running',
            'Share your screen with helpers',
          ],
        },
        {
          id: 'files',
          category: 'Creating',
          details: [
            'See all your files clearly',
            'Move files by dragging them',
            'Find any file quickly',
            'Track your changes easily',
            'Preview without opening',
            'Work with many files at once',
          ],
        },
        {
          id: 'features',
          category: 'Creating',
          details: [
            'We find what you need automatically',
            'Browse thousands of helpful tools',
            'Always use the right version',
            'Everything stays organized',
            'Access special tools',
            'Stay safe from bad code',
          ],
        },
        {
          id: 'multiplayer',
          category: 'Learning Together',
          details: [
            'See where others are working',
            'Fix problems together',
            'Talk while you code',
            'Leave helpful notes',
            'Know who is online',
            'Share your screen easily',
          ],
        },
        {
          id: 'save-progress',
          category: 'Learning Together',
          details: [
            'See what changed visually',
            'Try different ideas safely',
            'Fix mistakes easily',
            'Connect to GitHub simply',
            'Share your work',
            'See your journey over time',
          ],
        },
        {
          id: 'always-available',
          category: 'Infrastructure',
          details: [
            'Grows with your needs',
            'Fast loading everywhere',
            'Protected from attacks',
            'Almost never goes down',
            'Works worldwide',
            'Load balancing',
          ],
        },
        {
          id: 'database',
          category: 'Infrastructure',
          details: [
            'PostgreSQL with full SQL support',
            'Key-value store for caching',
            'Automatic backups',
            'Database migrations',
            'Query performance insights',
            'Connection pooling',
          ],
        },
        {
          id: 'deployment',
          category: 'Infrastructure',
          details: [
            'Zero-config deployments',
            'Automatic SSL certificates',
            'Custom domain support',
            'Rolling updates',
            'Deployment previews',
            'Rollback capabilities',
          ],
        },
        {
          id: 'security',
          category: 'Security',
          details: [
            'End-to-end encryption',
            'SOC 2 Type II certified',
            'GDPR compliant',
            'Two-factor authentication',
            'SSO integration',
            'Audit logs',
          ],
        },
        {
          id: 'secrets',
          category: 'Security',
          details: [
            'Encrypted secret storage',
            'Environment variables',
            'Secret sharing with the team',
            'Automatic rotation',
            'Access control',
            'Audit trail',
          ],
        },
        {
          id: 'monitoring',
          category: 'Analytics',
          details: [
            'CPU and memory usage',
            'Request analytics',
            'Error tracking',
            'Custom metrics',
            'Performance alerts',
            'Historical data',
          ],
        },
      ],
      showcase: {
        workspaceTitle: 'E-Code Workspace',
        workspaceAlt:
          'The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace',
        workspaceCaption: 'The E-Code IDE: agent, editor, files and preview in one workspace.',
        deploymentsTitle: 'Deployments',
        deploymentsAlt: 'The in-IDE Deployments panel where E-Code ships your project to production',
        deploymentsCaption: 'Ship to production without leaving the editor.',
      },
      empty: 'No features in this category yet. Check back soon.',
      overview: {
        badge: 'Complete Platform',
        title: 'Everything works together seamlessly',
        description:
          'Our integrated platform means you spend less time configuring and more time building. Everything from development to deployment is designed to work together perfectly.',
        points: [
          {
            id: 'environments',
            title: 'Instant Environments',
            description: 'Spin up development environments in seconds, not hours.',
          },
          {
            id: 'ecosystem',
            title: 'Connected Ecosystem',
            description: 'All tools and services work together out of the box.',
          },
          {
            id: 'configuration',
            title: 'Zero Configuration',
            description: 'Focus on coding; we handle the infrastructure.',
          },
        ],
        workflow: [
          { id: 'code', title: 'Write Code', description: 'In any language' },
          { id: 'collaborate', title: 'Collaborate', description: 'In real time' },
          { id: 'deploy', title: 'Deploy', description: 'With one click' },
        ],
      },
      cta: {
        title: 'Experience the future of development',
        description: 'Join developers worldwide who are building faster with E-Code.',
        primary: 'Get started free',
        secondary: 'Contact sales',
      },
    },
    mobile: {
      highlights: [
        {
          id: 'anywhere',
          title: 'Code from anywhere',
          description:
            'Open any project in the mobile browser and pick up exactly where you left off. The full workspace—files, editor, and terminal—runs in the cloud, so nothing depends on the device in your hand.',
        },
        {
          id: 'agent',
          title: 'The agent on mobile',
          description:
            'Describe a change in plain language and the E-Code agent edits your code, runs commands, and proposes diffs you can review and accept—the same agent panel you use on desktop, sized for a phone.',
        },
        {
          id: 'preview',
          title: 'Live preview on your phone',
          description:
            'Every workspace serves a live preview URL. Watch your app hot-reload as the agent works, and test real touch interactions on the device your users hold.',
        },
        {
          id: 'deploy',
          title: 'Push to deploy',
          description:
            'Commit from the built-in Git panel and publish from the Deployments tab. Ship a fix from the train and share the live link before you reach your stop.',
        },
      ],
      capabilities: [
        {
          id: 'touch',
          title: 'Touch-first preview',
          description: 'Interact with your running app exactly as your users will, on the device they actually use.',
        },
        {
          id: 'git',
          title: 'Git in your pocket',
          description: 'Branch, stage, commit, and view the working tree from the same Git panel as the desktop IDE.',
        },
        {
          id: 'cloud',
          title: 'Cloud workspaces',
          description: 'Your environment lives in the cloud, so a phone, tablet, and laptop all open the same session.',
        },
        {
          id: 'projects',
          title: 'Real multi-file projects',
          description: 'Navigate full codebases—not a single scratch file—with the file tree and editor side by side.',
        },
        {
          id: 'security',
          title: 'Secure by default',
          description: 'Workspaces are isolated and your code stays in your account on every signed-in device.',
        },
        {
          id: 'resume',
          title: 'Instant resume',
          description: 'Reopen a project and restore the agent, files, and preview in seconds—no local setup.',
        },
      ],
      flow: [
        { step: '01', title: 'Open your workspace', description: 'Sign in and resume any project from the dashboard.' },
        { step: '02', title: 'Prompt the agent', description: 'Ask for a feature or fix; review the proposed diff.' },
        { step: '03', title: 'Preview live', description: 'Watch the change hot-reload in the on-device preview.' },
        { step: '04', title: 'Commit & publish', description: 'Commit from the Git panel, then deploy in a tap.' },
      ],
      hero: {
        badge: 'Runs in your mobile browser',
        title: 'Your whole IDE,',
        accent: 'in your pocket',
        description:
          'E-Code is a cloud development platform, so the editor, agent, terminal, live preview, and deployment tools you use on desktop all open on your phone. No app to install, nothing to set up.',
        primary: 'Get started free',
        secondary: 'Open dashboard',
        imageAlt: 'E-Code workspace dashboard on a phone',
      },
      tour: {
        title: 'Everything you build with,',
        accent: 'on the go',
        description:
          'The same platform—not a stripped-down companion app. Here is what carries straight over to mobile.',
        showPrefix: 'Show',
        imageAltPrefix: 'E-Code on mobile',
      },
      stacks: {
        title: 'Bring any stack',
        description:
          'Mobile workspaces run the same cloud runtime as desktop—the frameworks and languages you already ship.',
      },
      capabilitiesIntro: {
        title: 'Professional development,',
        accent: 'pocket-sized',
        description: 'No compromises—the capabilities you rely on are present on every screen size.',
      },
      flowIntro: { title: 'From idea to live,', accent: 'without a laptop' },
      comparison: {
        title: 'Why coding on',
        accent: 'E-Code mobile',
        suffix: 'is different',
        typicalTitle: 'A typical mobile code editor',
        typicalItems: [
          'A single file, no real project structure',
          'No terminal or package installs',
          'No live preview of a running app',
          'No way to deploy what you wrote',
        ],
        ecodeTitle: 'E-Code mobile',
        ecodeItems: [
          'Full multi-file workspaces in the cloud',
          'Real terminal and the coding agent',
          'Live preview you can touch and test',
          'Commit with Git and deploy in a tap',
        ],
      },
      cta: {
        title: 'Ready to build from anywhere?',
        description:
          'Open E-Code in your mobile browser and start a workspace in seconds—the same projects, agent, and previews follow you across every device.',
        primary: 'Get started',
        secondary: 'Open dashboard',
      },
    },
  },
} as const satisfies MarketingExactProductCopy;

export const marketingExactProductFr = {
  exactProduct: {
    features: {
      tabs: [
        { id: 'All', label: 'Tout' },
        { id: 'AI-Powered', label: 'Avec l’IA' },
        { id: 'Creating', label: 'Création' },
        { id: 'Learning Together', label: 'Collaboration' },
        { id: 'Infrastructure', label: 'Infrastructure' },
        { id: 'Security', label: 'Sécurité' },
        { id: 'Analytics', label: 'Analyses' },
      ],
      items: [
        {
          id: 'ai-agent',
          category: 'AI-Powered',
          details: [
            'Crée automatiquement des applications complètes de A à Z',
            'Ne requiert aucune connaissance en programmation',
            'Crée tous les fichiers et dossiers pour vous',
            'Installe automatiquement les outils nécessaires',
            'Vous accompagne comme un expert',
            'Met le code à jour selon vos retours',
          ],
        },
        {
          id: 'ide',
          category: 'Creating',
          details: [
            'Une coloration qui facilite la lecture du code',
            'Des suggestions utiles pendant la saisie',
            'Plusieurs moyens de modifier plus vite',
            'Une navigation simple dans votre code',
            'Une détection automatique des erreurs',
            'Des thèmes adaptés à votre confort',
          ],
        },
        {
          id: 'command-center',
          category: 'Creating',
          details: [
            'Exécutez vos programmes en un clic',
            'Consultez immédiatement les résultats',
            'Lancez plusieurs tâches à la fois',
            'Installez facilement les outils nécessaires',
            'Conservez vos processus actifs',
            'Partagez facilement votre écran',
          ],
        },
        {
          id: 'files',
          category: 'Creating',
          details: [
            'Visualisez clairement tous vos fichiers',
            'Déplacez les fichiers par glisser-déposer',
            'Retrouvez rapidement n’importe quel fichier',
            'Suivez facilement vos modifications',
            'Prévisualisez sans ouvrir',
            'Travaillez sur plusieurs fichiers à la fois',
          ],
        },
        {
          id: 'features',
          category: 'Creating',
          details: [
            'Nous trouvons automatiquement ce dont vous avez besoin',
            'Parcourez des milliers d’outils utiles',
            'Utilisez toujours la version appropriée',
            'Gardez l’ensemble bien organisé',
            'Accédez à des outils spécialisés',
            'Protégez-vous contre le code malveillant',
          ],
        },
        {
          id: 'multiplayer',
          category: 'Learning Together',
          details: [
            'Voyez où travaillent les autres membres',
            'Résolvez les problèmes ensemble',
            'Échangez pendant que vous codez',
            'Laissez des notes utiles',
            'Voyez qui est en ligne',
            'Partagez facilement votre écran',
          ],
        },
        {
          id: 'save-progress',
          category: 'Learning Together',
          details: [
            'Visualisez les changements',
            'Testez différentes idées en toute sécurité',
            'Corrigez facilement vos erreurs',
            'Connectez simplement GitHub',
            'Partagez votre travail',
            'Retracez l’évolution de votre projet',
          ],
        },
        {
          id: 'always-available',
          category: 'Infrastructure',
          details: [
            'Évolue avec vos besoins',
            'Se charge rapidement partout',
            'Protège contre les attaques',
            'Offre une très haute disponibilité',
            'Fonctionne dans le monde entier',
            'Répartit automatiquement la charge',
          ],
        },
        {
          id: 'database',
          category: 'Infrastructure',
          details: [
            'PostgreSQL avec prise en charge complète de SQL',
            'Stockage clé-valeur pour la mise en cache',
            'Sauvegardes automatiques',
            'Migrations de base de données',
            'Analyse des performances des requêtes',
            'Pool de connexions',
          ],
        },
        {
          id: 'deployment',
          category: 'Infrastructure',
          details: [
            'Déploiements sans configuration',
            'Certificats SSL automatiques',
            'Prise en charge des domaines personnalisés',
            'Mises à jour progressives',
            'Aperçus de déploiement',
            'Possibilité de retour arrière',
          ],
        },
        {
          id: 'security',
          category: 'Security',
          details: [
            'Chiffrement de bout en bout',
            'Certification SOC 2 Type II',
            'Conformité au RGPD',
            'Authentification à deux facteurs',
            'Intégration SSO',
            'Journaux d’audit',
          ],
        },
        {
          id: 'secrets',
          category: 'Security',
          details: [
            'Stockage chiffré des secrets',
            'Variables d’environnement',
            'Partage des secrets avec l’équipe',
            'Rotation automatique',
            'Contrôle des accès',
            'Piste d’audit',
          ],
        },
        {
          id: 'monitoring',
          category: 'Analytics',
          details: [
            'Utilisation du processeur et de la mémoire',
            'Analyse des requêtes',
            'Suivi des erreurs',
            'Métriques personnalisées',
            'Alertes de performance',
            'Données historiques',
          ],
        },
      ],
      showcase: {
        workspaceTitle: 'Espace de travail E-Code',
        workspaceAlt:
          'L’IDE E-Code réunit le panneau de l’agent IA, l’éditeur de code, l’arborescence et l’aperçu en direct dans un même espace de travail',
        workspaceCaption: 'L’IDE E-Code réunit l’agent, l’éditeur, les fichiers et l’aperçu dans un même espace.',
        deploymentsTitle: 'Déploiements',
        deploymentsAlt: 'Le panneau Déploiements de l’IDE E-Code publie votre projet en production',
        deploymentsCaption: 'Publiez en production sans quitter l’éditeur.',
      },
      empty: 'Aucune fonctionnalité dans cette catégorie pour le moment. Revenez bientôt.',
      overview: {
        badge: 'Plateforme complète',
        title: 'Tous les outils fonctionnent parfaitement ensemble',
        description:
          'Notre plateforme intégrée réduit le temps consacré à la configuration pour vous laisser créer. Du développement au déploiement, tout est conçu pour fonctionner ensemble.',
        points: [
          {
            id: 'environments',
            title: 'Environnements instantanés',
            description:
              'Lancez des environnements de développement en quelques secondes plutôt qu’en plusieurs heures.',
          },
          {
            id: 'ecosystem',
            title: 'Écosystème connecté',
            description: 'Tous les outils et services fonctionnent ensemble dès le départ.',
          },
          {
            id: 'configuration',
            title: 'Zéro configuration',
            description: 'Concentrez-vous sur le code, nous gérons l’infrastructure.',
          },
        ],
        workflow: [
          { id: 'code', title: 'Écrivez le code', description: 'Dans n’importe quel langage' },
          { id: 'collaborate', title: 'Collaborez', description: 'En temps réel' },
          { id: 'deploy', title: 'Déployez', description: 'En un clic' },
        ],
      },
      cta: {
        title: 'Découvrez le futur du développement',
        description: 'Rejoignez les développeurs du monde entier qui créent plus vite avec E-Code.',
        primary: 'Commencer gratuitement',
        secondary: 'Contacter le service commercial',
      },
    },
    mobile: {
      highlights: [
        {
          id: 'anywhere',
          title: 'Codez où que vous soyez',
          description:
            'Ouvrez n’importe quel projet dans votre navigateur mobile et reprenez exactement où vous vous étiez arrêté. L’espace complet — fichiers, éditeur et terminal — s’exécute dans le cloud, indépendamment de l’appareil utilisé.',
        },
        {
          id: 'agent',
          title: 'L’agent sur mobile',
          description:
            'Décrivez un changement en langage courant : l’agent E-Code modifie le code, exécute les commandes et propose des diffs que vous pouvez examiner et accepter, depuis le même panneau que sur ordinateur, adapté au téléphone.',
        },
        {
          id: 'preview',
          title: 'Aperçu en direct sur votre téléphone',
          description:
            'Chaque espace fournit une URL d’aperçu en direct. Suivez le rechargement de l’application pendant le travail de l’agent et testez les interactions tactiles sur l’appareil réellement utilisé.',
        },
        {
          id: 'deploy',
          title: 'Poussez puis déployez',
          description:
            'Créez un commit depuis le panneau Git intégré et publiez depuis l’onglet Déploiements. Livrez un correctif en déplacement et partagez le lien en direct immédiatement.',
        },
      ],
      capabilities: [
        {
          id: 'touch',
          title: 'Aperçu pensé pour le tactile',
          description:
            'Interagissez avec votre application exactement comme vos utilisateurs, sur leur propre type d’appareil.',
        },
        {
          id: 'git',
          title: 'Git dans votre poche',
          description:
            'Gérez les branches, l’index, les commits et les changements depuis le même panneau Git que sur ordinateur.',
        },
        {
          id: 'cloud',
          title: 'Espaces de travail cloud',
          description:
            'Votre environnement vit dans le cloud : téléphone, tablette et ordinateur ouvrent la même session.',
        },
        {
          id: 'projects',
          title: 'De véritables projets multifichiers',
          description: 'Parcourez des bases de code complètes grâce à l’arborescence et à l’éditeur côte à côte.',
        },
        {
          id: 'security',
          title: 'Sécurisé par défaut',
          description:
            'Les espaces sont isolés et votre code reste dans votre compte sur tous vos appareils connectés.',
        },
        {
          id: 'resume',
          title: 'Reprise instantanée',
          description:
            'Rouvrez un projet et retrouvez l’agent, les fichiers et l’aperçu en quelques secondes, sans configuration locale.',
        },
      ],
      flow: [
        {
          step: '01',
          title: 'Ouvrez votre espace',
          description: 'Connectez-vous et reprenez un projet depuis le tableau de bord.',
        },
        {
          step: '02',
          title: 'Donnez un prompt à l’agent',
          description: 'Demandez une fonctionnalité ou un correctif, puis examinez le diff proposé.',
        },
        {
          step: '03',
          title: 'Prévisualisez en direct',
          description: 'Suivez le rechargement à chaud du changement dans l’aperçu mobile.',
        },
        {
          step: '04',
          title: 'Créez un commit et publiez',
          description: 'Créez un commit depuis Git, puis déployez en un geste.',
        },
      ],
      hero: {
        badge: 'Fonctionne dans votre navigateur mobile',
        title: 'Tout votre IDE,',
        accent: 'dans votre poche',
        description:
          'E-Code est une plateforme de développement cloud : l’éditeur, l’agent, le terminal, l’aperçu en direct et le déploiement utilisés sur ordinateur s’ouvrent aussi sur votre téléphone. Aucune application à installer, aucune configuration.',
        primary: 'Commencer gratuitement',
        secondary: 'Ouvrir le tableau de bord',
        imageAlt: 'Tableau de bord de l’espace E-Code affiché sur un téléphone',
      },
      tour: {
        title: 'Tous vos outils de création,',
        accent: 'où que vous soyez',
        description: 'La même plateforme, et non une application allégée. Retrouvez toutes ces capacités sur mobile.',
        showPrefix: 'Afficher',
        imageAltPrefix: 'E-Code sur mobile',
      },
      stacks: {
        title: 'Utilisez la stack de votre choix',
        description:
          'Les espaces mobiles utilisent le même environnement cloud que sur ordinateur, avec les frameworks et langages que vous déployez déjà.',
      },
      capabilitiesIntro: {
        title: 'Un développement professionnel,',
        accent: 'au format poche',
        description: 'Aucun compromis : les capacités dont vous dépendez sont présentes sur chaque taille d’écran.',
      },
      flowIntro: { title: 'De l’idée à la mise en ligne,', accent: 'sans ordinateur portable' },
      comparison: {
        title: 'Pourquoi coder sur',
        accent: 'E-Code mobile',
        suffix: 'change tout',
        typicalTitle: 'Un éditeur de code mobile classique',
        typicalItems: [
          'Un seul fichier, sans véritable structure de projet',
          'Aucun terminal ni installation de package',
          'Aucun aperçu en direct de l’application',
          'Aucun moyen de déployer le code écrit',
        ],
        ecodeTitle: 'E-Code mobile',
        ecodeItems: [
          'Des espaces cloud complets et multifichiers',
          'Un véritable terminal et l’agent de code',
          'Un aperçu en direct à toucher et tester',
          'Des commits Git et un déploiement en un geste',
        ],
      },
      cta: {
        title: 'Prêt à créer où que vous soyez ?',
        description:
          'Ouvrez E-Code dans votre navigateur mobile et lancez un espace en quelques secondes : vos projets, l’agent et les aperçus vous suivent sur chaque appareil.',
        primary: 'Commencer',
        secondary: 'Ouvrir le tableau de bord',
      },
    },
  },
} as const satisfies MarketingExactProductCopy;

export function getMarketingExactProductCopy(language?: string | null): MarketingExactProductCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactProductFr : marketingExactProductEn;
}
