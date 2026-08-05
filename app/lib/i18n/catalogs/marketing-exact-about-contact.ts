import { resolveMarketingLanguage } from './marketing';

export type AboutValueId = 'creation' | 'speed' | 'open' | 'trust' | 'curiosity' | 'world';
export type AboutPlatformId = 'agent' | 'workspace' | 'preview' | 'git' | 'deploy' | 'security';
export type ContactChannelId = 'sales' | 'support' | 'press' | 'security';
export type ContactTopic = 'General' | 'Sales' | 'Support' | 'Press' | 'Security';

interface MarketingExactAboutContactCopy {
  exactAbout: {
    seo: { title: string; description: string };
    hero: { badge: string; title: string; description: string };
    mission: {
      eyebrow: string;
      title: string;
      paragraphs: readonly string[];
      windowLabel: string;
      imageAlt: string;
      imageCaption: string;
    };
    platform: {
      title: string;
      description: string;
      items: readonly { id: AboutPlatformId; title: string; description: string }[];
    };
    values: {
      title: string;
      description: string;
      items: readonly { id: AboutValueId; title: string; description: string }[];
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
  exactContact: {
    seo: { title: string; description: string };
    validation: { nameRequired: string; emailRequired: string; emailInvalid: string; messageRequired: string };
    mailto: {
      subjectFrom: string;
      subjectDefault: string;
      name: string;
      email: string;
      topic: string;
      topicLabels: Readonly<Record<ContactTopic, string>>;
    };
    errors: { submit: string };
    toasts: { title: string; prepared: string; fallback: string };
    hero: { title: string; description: string; responseTime: string };
    channels: {
      title: string;
      items: readonly { id: ContactChannelId; title: string; description: string }[];
    };
    formSection: { title: string; description: string };
    success: { title: string; description: string; referencePrefix: string; referenceSuffix: string };
    form: {
      title: string;
      description: string;
      name: string;
      namePlaceholder: string;
      email: string;
      emailPlaceholder: string;
      topic: string;
      topicLabels: Readonly<Record<ContactTopic, string>>;
      message: string;
      messagePlaceholder: string;
      submitting: string;
      submit: string;
    };
    remote: {
      title: string;
      firstBeforeEmail: string;
      firstAfterEmail: string;
      second: string;
      imageAlt: string;
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
}

export type ContactValidationCopy = MarketingExactAboutContactCopy['exactContact']['validation'];
export type ContactMailtoCopy = MarketingExactAboutContactCopy['exactContact']['mailto'];

export const marketingExactAboutContactEn = {
  exactAbout: {
    seo: {
      title: 'About — E-Code',
      description:
        'Discover E-Code, the AI-native development platform making production software creation accessible.',
    },
    hero: {
      badge: 'Our story',
      title: 'Building the future of software creation',
      description:
        'E-Code is an AI-native development platform that turns plain language into real, deployable applications. We are on a mission to make software creation accessible to everyone.',
    },
    mission: {
      eyebrow: 'Our mission',
      title: 'Everyone should be able to build',
      paragraphs: [
        'For decades, building software meant years of training, expensive teams, and slow feedback loops. We believe the next generation of creators should be limited only by their imagination — not by syntax, setup, or scale.',
        'E-Code pairs an autonomous coding agent with a complete cloud workspace, so describing what you want is enough to get a working app you can edit, run, and ship.',
      ],
      windowLabel: 'E-Code Workspace',
      imageAlt:
        'The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace',
      imageCaption: 'The E-Code IDE: agent, editor, files and live preview in one workspace.',
    },
    platform: {
      title: 'What powers E-Code',
      description:
        'An autonomous agent and a full cloud workspace, working together so you can go from prompt to production without leaving the browser.',
      items: [
        {
          id: 'agent',
          title: 'Autonomous AI agent',
          description:
            'Describe what you want in plain language. The agent plans the work, writes and edits files across your project, and explains every change.',
        },
        {
          id: 'workspace',
          title: 'Full cloud workspace',
          description:
            'A real editor, terminal, and package manager run in the cloud — so there is nothing to install and your environment is ready in seconds.',
        },
        {
          id: 'preview',
          title: 'Live preview',
          description:
            'See your app running as the agent builds it. Every edit updates the preview instantly, side by side with the code.',
        },
        {
          id: 'git',
          title: 'Git built in',
          description:
            'Connect GitHub or GitLab, branch, commit, and push from inside the workspace. Your history stays yours.',
        },
        {
          id: 'deploy',
          title: 'One-click deploy',
          description:
            'Ship to a live URL straight from the editor. Static sites and full-stack apps go to production without leaving E-Code.',
        },
        {
          id: 'security',
          title: 'Secure by design',
          description:
            'Each project runs in its own isolated sandbox. Credentials are encrypted and access is scoped to the people you invite.',
        },
      ],
    },
    values: {
      title: 'What we value',
      description: 'The principles that guide every product decision we make.',
      items: [
        {
          id: 'creation',
          title: 'Creation for everyone',
          description:
            'Software should be as easy to make as it is to imagine. We remove the friction between an idea and a working app.',
        },
        {
          id: 'speed',
          title: 'Speed without shortcuts',
          description:
            'We obsess over the fast path, but never at the cost of real, production-quality code you actually own.',
        },
        {
          id: 'open',
          title: 'Build in the open',
          description:
            'Collaboration is a first-class feature. Teammates, agents, and tools work side by side in one shared workspace.',
        },
        {
          id: 'trust',
          title: 'Trust by default',
          description:
            'Your code and data belong to you. Security, privacy, and transparency are baked into every layer of the platform.',
        },
        {
          id: 'curiosity',
          title: 'Stay curious',
          description:
            'AI-native development is a frontier. We ship, learn, and iterate alongside the builders who use E-Code every day.',
        },
        {
          id: 'world',
          title: 'Open to the world',
          description:
            'From a first prototype to a global product, E-Code scales with you across every stage of growth.',
        },
      ],
    },
    cta: {
      title: 'Start building with E-Code',
      description: 'Join the creators turning ideas into software every day. Your next app is one prompt away.',
      primary: 'Get started for free',
      secondary: 'Open dashboard',
    },
  },
  exactContact: {
    seo: {
      title: 'Contact — E-Code',
      description: 'Contact E-Code for sales, support, press, security, partnerships, or general questions.',
    },
    validation: {
      nameRequired: 'Enter your name.',
      emailRequired: 'Enter your email.',
      emailInvalid: 'Enter a valid email address.',
      messageRequired: 'Tell us briefly how we can help.',
    },
    mailto: {
      subjectFrom: 'Message from',
      subjectDefault: 'Message via E-Code contact form',
      name: 'Name',
      email: 'Email',
      topic: 'Topic',
      topicLabels: {
        General: 'General',
        Sales: 'Sales',
        Support: 'Support',
        Press: 'Press',
        Security: 'Security',
      },
    },
    errors: { submit: 'Failed to send your message.' },
    toasts: {
      title: 'Opening your email client',
      prepared: "We've prepared your message for hello@e-code.ai so nothing gets lost.",
      fallback: "We couldn't reach the server, so we've prepared your message for hello@e-code.ai instead.",
    },
    hero: {
      title: 'Get in Touch',
      description:
        'Whether you have a question about features, pricing, security, or anything else, our team is ready to help.',
      responseTime: 'We typically reply within one business day',
    },
    channels: {
      title: 'How Can We Help?',
      items: [
        {
          id: 'sales',
          title: 'Sales',
          description: 'Talk to our team about plans, pricing, and enterprise rollouts.',
        },
        { id: 'support', title: 'Support', description: 'Get help with your projects, workspaces, and account.' },
        { id: 'press', title: 'Press', description: 'Media inquiries, brand assets, and company information.' },
        {
          id: 'security',
          title: 'Security',
          description: 'Report a vulnerability or ask about our security practices.',
        },
      ],
    },
    formSection: {
      title: 'Send Us a Message',
      description: 'Fill out the form below and the right team will get back to you.',
    },
    success: {
      title: 'Message received',
      description: 'Thanks for reaching out — the right team will get back within 1 business day.',
      referencePrefix: 'Your reference number is',
      referenceSuffix: '— quote it in any follow-up.',
    },
    form: {
      title: 'Contact Form',
      description: 'Tell us a little about what you need.',
      name: 'Name',
      namePlaceholder: 'Ada Lovelace',
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      topic: 'Topic',
      topicLabels: {
        General: 'General',
        Sales: 'Sales',
        Support: 'Support',
        Press: 'Press',
        Security: 'Security',
      },
      message: 'Message',
      messagePlaceholder: 'How can we help you?',
      submitting: 'Sending...',
      submit: 'Send Message',
    },
    remote: {
      title: 'Remote-first, built in the open',
      firstBeforeEmail:
        'E-Code is a remote-first company with team members around the world. There is no front desk to visit, but there is always someone online. For partnership or general inquiries, reach out to',
      firstAfterEmail: 'and we will point you to the right person.',
      second: 'Prefer to just start building? Spin up a project in your browser and talk to the AI agent directly.',
      imageAlt: 'The E-Code dashboard where you create projects, open workspaces and manage your account',
    },
    cta: {
      title: 'Start building with E-Code today',
      description:
        'Describe what you want to build and the AI agent writes, runs, and deploys it — no setup required. No credit card to get started.',
      primary: 'Get started free',
      secondary: 'Open dashboard',
    },
  },
} as const satisfies MarketingExactAboutContactCopy;

export const marketingExactAboutContactFr = {
  exactAbout: {
    seo: {
      title: 'À propos — E-Code',
      description:
        'Découvrez E-Code, la plateforme de développement pensée pour l’IA qui rend la création de logiciels de production accessible à tous.',
    },
    hero: {
      badge: 'Notre histoire',
      title: 'Construire l’avenir de la création logicielle',
      description:
        'E-Code est une plateforme de développement pensée pour l’IA qui transforme le langage naturel en applications réelles et déployables. Notre mission : rendre la création logicielle accessible à tous.',
    },
    mission: {
      eyebrow: 'Notre mission',
      title: 'Chacun doit pouvoir créer',
      paragraphs: [
        'Pendant des décennies, créer un logiciel exigeait des années de formation, des équipes coûteuses et de longues boucles de retour. Nous pensons que la prochaine génération de créateurs ne devrait être limitée que par son imagination, jamais par la syntaxe, la configuration ou l’échelle.',
        'E-Code associe un agent de programmation autonome à un espace de travail cloud complet : il suffit de décrire ce que vous voulez pour obtenir une application fonctionnelle que vous pouvez modifier, exécuter et livrer.',
      ],
      windowLabel: 'Espace de travail E-Code',
      imageAlt:
        'IDE E-Code réunissant le panneau Agent IA, l’éditeur de code, l’arborescence et l’aperçu en direct dans un même espace de travail',
      imageCaption: 'L’IDE E-Code réunit l’agent, l’éditeur, les fichiers et l’aperçu en direct.',
    },
    platform: {
      title: 'Ce qui fait la force d’E-Code',
      description:
        'Un agent autonome et un espace de travail cloud complet qui vous font passer du prompt à la production sans quitter le navigateur.',
      items: [
        {
          id: 'agent',
          title: 'Agent IA autonome',
          description:
            'Décrivez votre besoin en langage naturel. L’agent planifie le travail, crée et modifie les fichiers de votre projet, puis explique chaque changement.',
        },
        {
          id: 'workspace',
          title: 'Espace de travail cloud complet',
          description:
            'Un véritable éditeur, un terminal et un gestionnaire de paquets fonctionnent dans le cloud : rien à installer, votre environnement est prêt en quelques secondes.',
        },
        {
          id: 'preview',
          title: 'Aperçu en direct',
          description:
            'Voyez votre application fonctionner pendant que l’agent la construit. Chaque modification actualise instantanément l’aperçu à côté du code.',
        },
        {
          id: 'git',
          title: 'Git intégré',
          description:
            'Connectez GitHub ou GitLab, créez des branches, effectuez vos commits et poussez le code depuis l’espace de travail. Votre historique reste le vôtre.',
        },
        {
          id: 'deploy',
          title: 'Déploiement en un clic',
          description:
            'Publiez une URL en direct depuis l’éditeur. Sites statiques et applications complètes passent en production sans quitter E-Code.',
        },
        {
          id: 'security',
          title: 'Sécurisé dès la conception',
          description:
            'Chaque projet s’exécute dans son propre environnement isolé. Les identifiants sont chiffrés et l’accès limité aux personnes invitées.',
        },
      ],
    },
    values: {
      title: 'Nos valeurs',
      description: 'Les principes qui guident chacune de nos décisions produit.',
      items: [
        {
          id: 'creation',
          title: 'La création pour tous',
          description:
            'Créer un logiciel devrait être aussi simple que l’imaginer. Nous supprimons les obstacles entre une idée et une application fonctionnelle.',
        },
        {
          id: 'speed',
          title: 'La vitesse sans compromis',
          description:
            'Nous recherchons le chemin le plus rapide, sans jamais sacrifier un code réel, de qualité production et qui vous appartient.',
        },
        {
          id: 'open',
          title: 'Construire ouvertement',
          description:
            'La collaboration est une fonctionnalité essentielle. Équipe, agents et outils travaillent côte à côte dans un espace partagé.',
        },
        {
          id: 'trust',
          title: 'La confiance par défaut',
          description:
            'Votre code et vos données vous appartiennent. Sécurité, confidentialité et transparence sont intégrées à chaque couche de la plateforme.',
        },
        {
          id: 'curiosity',
          title: 'Rester curieux',
          description:
            'Le développement pensé pour l’IA ouvre une nouvelle frontière. Nous livrons, apprenons et progressons avec les créateurs qui utilisent E-Code chaque jour.',
        },
        {
          id: 'world',
          title: 'Ouvert sur le monde',
          description:
            'Du premier prototype au produit mondial, E-Code vous accompagne à chaque étape de votre croissance.',
        },
      ],
    },
    cta: {
      title: 'Commencez à créer avec E-Code',
      description:
        'Rejoignez celles et ceux qui transforment chaque jour leurs idées en logiciels. Votre prochaine application est à un prompt.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
  exactContact: {
    seo: {
      title: 'Contact — E-Code',
      description:
        'Contactez E-Code pour toute question commerciale, technique, presse, sécurité, partenariat ou demande générale.',
    },
    validation: {
      nameRequired: 'Saisissez votre nom.',
      emailRequired: 'Saisissez votre adresse e-mail.',
      emailInvalid: 'Saisissez une adresse e-mail valide.',
      messageRequired: 'Indiquez brièvement comment nous pouvons vous aider.',
    },
    mailto: {
      subjectFrom: 'Message de',
      subjectDefault: 'Message envoyé depuis le formulaire de contact E-Code',
      name: 'Nom',
      email: 'E-mail',
      topic: 'Objet',
      topicLabels: {
        General: 'Général',
        Sales: 'Commercial',
        Support: 'Assistance',
        Press: 'Presse',
        Security: 'Sécurité',
      },
    },
    errors: { submit: 'Impossible d’envoyer votre message.' },
    toasts: {
      title: 'Ouverture de votre messagerie',
      prepared: 'Votre message a été préparé pour hello@e-code.ai afin qu’aucune information ne soit perdue.',
      fallback:
        'Le serveur est momentanément indisponible. Votre message a été préparé pour hello@e-code.ai afin que vous puissiez l’envoyer par e-mail.',
    },
    hero: {
      title: 'Contactez-nous',
      description: 'Fonctionnalités, tarification, sécurité ou toute autre question : notre équipe est à votre écoute.',
      responseTime: 'Nous répondons généralement sous un jour ouvré',
    },
    channels: {
      title: 'Comment pouvons-nous vous aider ?',
      items: [
        {
          id: 'sales',
          title: 'Commercial',
          description: 'Échangez avec notre équipe sur les offres, la tarification et les déploiements en entreprise.',
        },
        {
          id: 'support',
          title: 'Assistance',
          description: 'Obtenez de l’aide pour vos projets, espaces de travail et votre compte.',
        },
        {
          id: 'press',
          title: 'Presse',
          description: 'Demandes des médias, ressources de marque et informations sur l’entreprise.',
        },
        {
          id: 'security',
          title: 'Sécurité',
          description: 'Signalez une vulnérabilité ou renseignez-vous sur nos pratiques de sécurité.',
        },
      ],
    },
    formSection: {
      title: 'Envoyez-nous un message',
      description: 'Remplissez le formulaire ci-dessous ; l’équipe concernée vous répondra.',
    },
    success: {
      title: 'Message reçu',
      description: 'Merci de nous avoir contactés. L’équipe concernée vous répondra sous un jour ouvré.',
      referencePrefix: 'Votre numéro de référence est',
      referenceSuffix: '— mentionnez-le dans tout échange ultérieur.',
    },
    form: {
      title: 'Formulaire de contact',
      description: 'Présentez-nous brièvement votre besoin.',
      name: 'Nom',
      namePlaceholder: 'Camille Martin',
      email: 'E-mail',
      emailPlaceholder: 'vous@exemple.fr',
      topic: 'Objet',
      topicLabels: {
        General: 'Général',
        Sales: 'Commercial',
        Support: 'Assistance',
        Press: 'Presse',
        Security: 'Sécurité',
      },
      message: 'Message',
      messagePlaceholder: 'Comment pouvons-nous vous aider ?',
      submitting: 'Envoi en cours…',
      submit: 'Envoyer le message',
    },
    remote: {
      title: 'Une équipe distribuée qui construit ouvertement',
      firstBeforeEmail:
        'E-Code est une entreprise organisée en télétravail, avec des membres partout dans le monde. Nous n’avons pas d’accueil physique, mais quelqu’un est toujours disponible en ligne. Pour toute question générale ou de partenariat, écrivez à',
      firstAfterEmail: 'et nous vous orienterons vers la bonne personne.',
      second:
        'Vous préférez commencer directement ? Créez un projet dans votre navigateur et échangez avec l’agent IA.',
      imageAlt:
        'Tableau de bord E-Code où vous pouvez créer des projets, ouvrir des espaces de travail et gérer votre compte',
    },
    cta: {
      title: 'Commencez à créer avec E-Code dès aujourd’hui',
      description:
        'Décrivez ce que vous voulez construire : l’agent IA écrit, exécute et déploie votre application, sans configuration préalable. Aucune carte bancaire n’est nécessaire pour commencer.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
} as const satisfies MarketingExactAboutContactCopy;

export function getMarketingExactAboutContactCopy(language?: string | null): MarketingExactAboutContactCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactAboutContactFr : marketingExactAboutContactEn;
}
