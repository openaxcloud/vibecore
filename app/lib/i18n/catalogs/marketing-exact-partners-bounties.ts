import { resolveMarketingLanguage } from './marketing';

export type PartnerProgramId = 'technology' | 'solutions' | 'agency';
export type PartnerBenefitId = 'revenue' | 'market' | 'training' | 'support';
export type PartnerStepId = 'apply' | 'onboard' | 'launch' | 'grow';
export type BountyHighlightId = 'scope' | 'builders' | 'review';
export type BountyPipelineId = 'templates' | 'sandboxes' | 'acceptance';
export type BountyWorkflowId = 'create' | 'recruit' | 'ship';
export type BountyStackId = 'react' | 'typescript' | 'node' | 'python' | 'agents' | 'supabase';

interface MarketingExactPartnersBountiesCopy {
  exactPartners: {
    seo: { title: string; description: string };
    hero: {
      badge: string;
      title: string;
      description: string;
      apply: string;
      signup: string;
      accepting: string;
      imageAlt: string;
      imageCaption: string;
    };
    programs: {
      title: string;
      description: string;
      items: readonly {
        id: PartnerProgramId;
        name: string;
        description: string;
        points: readonly string[];
      }[];
    };
    integrations: { title: string; description: string };
    benefits: {
      title: string;
      items: readonly { id: PartnerBenefitId; title: string; description: string }[];
    };
    steps: {
      title: string;
      items: readonly { id: PartnerStepId; title: string; description: string }[];
    };
    cta: { title: string; description: string; apply: string; signup: string };
  };
  exactBounties: {
    seo: { title: string; description: string };
    hero: {
      badge: string;
      titleBefore: string;
      titleAccent: string;
      description: string;
      primary: string;
      secondary: string;
      points: readonly string[];
      windowLabel: string;
      imageAlt: string;
      imageCaption: string;
    };
    highlights: {
      title: string;
      description: string;
      items: readonly { id: BountyHighlightId; title: string; description: string }[];
    };
    managed: {
      badge: string;
      title: string;
      description: string;
      pipeline: readonly { id: BountyPipelineId; title: string; description: string }[];
      workflow: readonly { id: BountyWorkflowId; title: string; description: string }[];
    };
    categories: {
      badge: string;
      title: string;
      description: string;
      items: readonly string[];
      stacks: readonly { id: BountyStackId; label: string }[];
      windowLabel: string;
      imageAlt: string;
      imageCaption: string;
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
}

export const marketingExactPartnersBountiesEn = {
  exactPartners: {
    seo: {
      title: 'Partners — E-Code',
      description: 'Partner with E-Code through technology, solutions, and agency programs built for shared growth.',
    },
    hero: {
      badge: 'Partner Program',
      title: 'Partner with E-Code',
      description:
        'Build, sell, and deliver alongside the AI development platform teams use to ship production apps. Join a program designed to grow your business.',
      apply: 'Become a Partner',
      signup: 'Get started free',
      accepting: 'Now accepting partner applications',
      imageAlt: 'The E-Code workspace dashboard partners use to manage projects, seats, and deployments',
      imageCaption: 'Real product, captured live',
    },
    programs: {
      title: 'Partner Programs',
      description: 'Whatever you build or whoever you serve, there is an E-Code program built for you.',
      items: [
        {
          id: 'technology',
          name: 'Technology Partners',
          description:
            'Integrate your platform, API, or developer tool with E-Code and reach teams building production apps with AI.',
          points: [
            'Co-built integrations & MCP connectors',
            'Listing in the E-Code connector catalog',
            'Joint launch & technical support',
          ],
        },
        {
          id: 'solutions',
          name: 'Solutions Partners',
          description:
            'Consultancies and SIs delivering E-Code to enterprise customers, from migration to managed delivery.',
          points: [
            'Implementation enablement & certification',
            'Deal registration & revenue share',
            'Dedicated partner success manager',
          ],
        },
        {
          id: 'agency',
          name: 'Agency Partners',
          description:
            'Digital agencies and studios shipping client apps faster by building on E-Code as your delivery platform.',
          points: [
            'Agency dashboard & pooled seats',
            'Co-marketing & referral rewards',
            'Priority access to new features',
          ],
        },
      ],
    },
    integrations: {
      title: 'Build on a Connected Platform',
      description:
        'E-Code already connects to the tools your customers rely on — through OAuth integrations and MCP connectors. Technology partners plug straight into these surfaces.',
    },
    benefits: {
      title: 'Why Partner With Us',
      items: [
        {
          id: 'revenue',
          title: 'Grow Revenue',
          description: 'Earn referral commissions and revenue share on every customer you bring to E-Code.',
        },
        {
          id: 'market',
          title: 'Go To Market Together',
          description: 'Co-marketing, case studies, and joint launches that put your brand in front of our audience.',
        },
        {
          id: 'training',
          title: 'Enablement & Training',
          description: 'Partner certification, technical workshops, and early access to product roadmaps.',
        },
        {
          id: 'support',
          title: 'Dedicated Support',
          description: 'A named partner manager and a private support channel for your team and customers.',
        },
      ],
    },
    steps: {
      title: 'How It Works',
      items: [
        { id: 'apply', title: 'Apply', description: 'Tell us about your business and the customers you serve.' },
        {
          id: 'onboard',
          title: 'Onboard',
          description: 'Complete enablement and get certified on the E-Code platform.',
        },
        {
          id: 'launch',
          title: 'Launch',
          description: 'Go to market together with co-branded campaigns and joint sales.',
        },
        {
          id: 'grow',
          title: 'Grow',
          description: 'Scale your practice with revenue share, referrals, and roadmap access.',
        },
      ],
    },
    cta: {
      title: 'Ready to build together?',
      description:
        'Tell us about your business and our partnerships team will help you find the right program and get started.',
      apply: 'Become a Partner',
      signup: 'Get started free',
    },
  },
  exactBounties: {
    seo: {
      title: 'Bounties — E-Code',
      description: 'Publish outcome-based bounties, review live E-Code projects, and reward builders on delivery.',
    },
    hero: {
      badge: 'Developer marketplace',
      titleBefore: 'Ship features faster with',
      titleAccent: 'outcome-based bounties',
      description:
        'Publish a challenge, collaborate with builders inside live E-Code workspaces, and release the reward on delivery. Briefs, review sandboxes, and sign-off all live in one platform.',
      primary: 'Launch your first bounty',
      secondary: 'Talk to our team',
      points: ['Live review sandboxes', 'Reward on delivery', 'Open or invite-only'],
      windowLabel: 'E-Code Workspace',
      imageAlt:
        'The E-Code IDE where bounty submissions are built and reviewed: AI Agent panel, code editor, file tree and live preview',
      imageCaption: 'Every bounty submission is a real, runnable E-Code project — not a screenshot or a PDF.',
    },
    highlights: {
      title: 'Built for product and platform teams',
      description: 'Bring in external builders without giving up governance, review, or predictable delivery.',
      items: [
        {
          id: 'scope',
          title: 'Scope a bounty in minutes',
          description:
            'Write the brief, attach acceptance criteria, and set the reward. The whole spec lives in one place so builders know exactly what "done" means.',
        },
        {
          id: 'builders',
          title: 'Open it to real builders',
          description:
            'Keep it inside your team or open it to the wider E-Code community. Filter by stack and experience so the right people see your work.',
        },
        {
          id: 'review',
          title: 'Review the actual build',
          description:
            'Every submission ships as a live E-Code project — open it, run the preview, read the diff, and request changes before you accept.',
        },
      ],
    },
    managed: {
      badge: 'Managed workflow',
      title: 'A managed pipeline from brief to reward',
      description:
        'Every bounty runs through secure workspaces, live review, and clear sign-off. Keep stakeholders aligned with one source of truth.',
      pipeline: [
        {
          id: 'templates',
          title: 'Ready-to-fork templates',
          description:
            'Start every bounty from a working E-Code project — AI features, integrations, and growth experiments set up and ready.',
        },
        {
          id: 'sandboxes',
          title: 'Secure review sandboxes',
          description:
            'Submissions run in isolated workspaces. Reviewers get a live preview and the full diff without touching their own environment.',
        },
        {
          id: 'acceptance',
          title: 'Acceptance criteria & sign-off',
          description:
            'Pair preview deployments with teammate sign-off gates so a bounty only closes when the checklist is green.',
        },
      ],
      workflow: [
        {
          id: 'create',
          title: 'Create a bounty',
          description:
            'Define the scope, attach requirements, and set the reward. Choose manual approval or let acceptance criteria gate the payout.',
        },
        {
          id: 'recruit',
          title: 'Recruit the right talent',
          description:
            'Invite your community or open it to the global E-Code marketplace with stack and experience filters.',
        },
        {
          id: 'ship',
          title: 'Review & ship',
          description:
            'Collaborate inside live E-Code sandboxes, request revisions, and release the reward when the work meets the bar.',
        },
      ],
    },
    categories: {
      badge: 'Every product surface',
      title: 'Post bounties across the whole stack',
      description:
        'Whatever you need built, scope it as a bounty and filter by stack, experience, and reputation so the right builders find it.',
      items: [
        'AI & agentic apps',
        'Full-stack products',
        'Dev-tool integrations',
        'Platform migrations',
        'Internal tooling',
        'Design systems',
      ],
      stacks: [
        { id: 'react', label: 'React' },
        { id: 'typescript', label: 'TypeScript' },
        { id: 'node', label: 'Node.js' },
        { id: 'python', label: 'Python' },
        { id: 'agents', label: 'AI agents' },
        { id: 'supabase', label: 'Supabase' },
      ],
      windowLabel: 'Project dashboard',
      imageAlt: 'The E-Code dashboard where teams track their projects, submissions and rewards in one view',
      imageCaption: 'Track every bounty, submission, and reward from one dashboard.',
    },
    cta: {
      title: 'Ready to put a bounty on your roadmap?',
      description: 'Spin up a bounty, invite builders, and start reviewing real, runnable submissions in minutes.',
      primary: 'Get started free',
      secondary: 'Open dashboard',
    },
  },
} as const satisfies MarketingExactPartnersBountiesCopy;

export const marketingExactPartnersBountiesFr = {
  exactPartners: {
    seo: {
      title: 'Partenaires — E-Code',
      description:
        'Développez votre activité avec E-Code grâce à nos programmes pour partenaires technologiques, cabinets de conseil et agences.',
    },
    hero: {
      badge: 'Programme partenaires',
      title: 'Devenez partenaire E-Code',
      description:
        'Concevez, commercialisez et livrez vos solutions aux côtés de la plateforme de développement IA utilisée par les équipes pour mettre en production leurs applications. Rejoignez un programme pensé pour développer votre activité.',
      apply: 'Devenir partenaire',
      signup: 'Commencer gratuitement',
      accepting: 'Les candidatures partenaires sont ouvertes',
      imageAlt:
        'Tableau de bord de l’espace de travail E-Code utilisé par les partenaires pour gérer projets, licences et déploiements',
      imageCaption: 'Produit réel, capturé en direct',
    },
    programs: {
      title: 'Programmes partenaires',
      description: 'Quels que soient votre offre et vos clients, un programme E-Code est conçu pour vous.',
      items: [
        {
          id: 'technology',
          name: 'Partenaires technologiques',
          description:
            'Intégrez votre plateforme, votre API ou votre outil de développement à E-Code et touchez les équipes qui créent des applications de production avec l’IA.',
          points: [
            'Intégrations et connecteurs MCP développés ensemble',
            'Référencement dans le catalogue de connecteurs E-Code',
            'Lancement conjoint et assistance technique',
          ],
        },
        {
          id: 'solutions',
          name: 'Partenaires conseil et intégration',
          description:
            'Cabinets de conseil et intégrateurs accompagnant les entreprises clientes d’E-Code, de la migration à la livraison gérée.',
          points: [
            'Accompagnement à la mise en œuvre et certification',
            'Enregistrement des opportunités et partage des revenus',
            'Responsable de la réussite partenaires attitré',
          ],
        },
        {
          id: 'agency',
          name: 'Agences partenaires',
          description:
            'Agences numériques et studios qui livrent plus rapidement les applications de leurs clients en utilisant E-Code comme plateforme de production.',
          points: [
            'Tableau de bord agence et licences mutualisées',
            'Marketing conjoint et primes de recommandation',
            'Accès prioritaire aux nouvelles fonctionnalités',
          ],
        },
      ],
    },
    integrations: {
      title: 'Développez sur une plateforme connectée',
      description:
        'E-Code se connecte déjà aux outils utilisés par vos clients grâce aux intégrations OAuth et aux connecteurs MCP. Les partenaires technologiques s’intègrent directement à ces surfaces.',
    },
    benefits: {
      title: 'Pourquoi devenir partenaire',
      items: [
        {
          id: 'revenue',
          title: 'Développez vos revenus',
          description:
            'Recevez des commissions de recommandation et une part des revenus pour chaque client apporté à E-Code.',
        },
        {
          id: 'market',
          title: 'Accédez ensemble au marché',
          description:
            'Marketing conjoint, études de cas et lancements coordonnés présentent votre marque directement à notre audience.',
        },
        {
          id: 'training',
          title: 'Accompagnement et formation',
          description: 'Certification partenaire, ateliers techniques et accès anticipé aux feuilles de route produit.',
        },
        {
          id: 'support',
          title: 'Assistance dédiée',
          description:
            'Un responsable partenaires attitré et un canal d’assistance privé pour votre équipe et vos clients.',
        },
      ],
    },
    steps: {
      title: 'Fonctionnement',
      items: [
        {
          id: 'apply',
          title: 'Candidatez',
          description: 'Présentez-nous votre activité et les clients que vous accompagnez.',
        },
        {
          id: 'onboard',
          title: 'Formez-vous',
          description: 'Suivez le parcours d’accompagnement et obtenez votre certification sur la plateforme E-Code.',
        },
        {
          id: 'launch',
          title: 'Lancez-vous',
          description: 'Accédez ensemble au marché grâce à des campagnes co-marquées et des ventes conjointes.',
        },
        {
          id: 'grow',
          title: 'Développez-vous',
          description:
            'Faites grandir votre activité grâce au partage des revenus, aux recommandations et à l’accès aux feuilles de route.',
        },
      ],
    },
    cta: {
      title: 'Prêts à construire ensemble ?',
      description:
        'Présentez-nous votre activité : notre équipe Partenariats vous aidera à choisir le programme adapté et à démarrer.',
      apply: 'Devenir partenaire',
      signup: 'Commencer gratuitement',
    },
  },
  exactBounties: {
    seo: {
      title: 'Missions rémunérées — E-Code',
      description:
        'Publiez des missions rémunérées au résultat, évaluez de vrais projets E-Code et payez les créateurs à la livraison.',
    },
    hero: {
      badge: 'Place de marché des développeurs',
      titleBefore: 'Livrez plus vite grâce à des',
      titleAccent: 'missions rémunérées au résultat',
      description:
        'Publiez un défi, collaborez avec des créateurs dans des espaces de travail E-Code en direct, puis versez la prime à la livraison. Brief, environnements de revue et validation sont réunis sur une seule plateforme.',
      primary: 'Publier votre première mission',
      secondary: 'Parler à notre équipe',
      points: ['Environnements de revue en direct', 'Paiement à la livraison', 'Ouverte ou sur invitation'],
      windowLabel: 'Espace de travail E-Code',
      imageAlt:
        'IDE E-Code où les livrables des missions sont créés et évalués : panneau Agent IA, éditeur de code, arborescence et aperçu en direct',
      imageCaption: 'Chaque livrable est un véritable projet E-Code exécutable, et non une capture d’écran ou un PDF.',
    },
    highlights: {
      title: 'Pensé pour les équipes produit et plateforme',
      description:
        'Faites appel à des créateurs externes sans renoncer à la gouvernance, à la revue ni à une livraison prévisible.',
      items: [
        {
          id: 'scope',
          title: 'Cadrez une mission en quelques minutes',
          description:
            'Rédigez le cahier des charges, joignez les critères d’acceptation et fixez la prime. Toute la spécification reste au même endroit afin que les créateurs sachent précisément ce que signifie « terminé ».',
        },
        {
          id: 'builders',
          title: 'Ouvrez-la à de vrais créateurs',
          description:
            'Réservez-la à votre équipe ou ouvrez-la à toute la communauté E-Code. Filtrez par technologies et expérience pour toucher les bonnes personnes.',
        },
        {
          id: 'review',
          title: 'Évaluez le produit réel',
          description:
            'Chaque livrable est fourni comme projet E-Code en direct : ouvrez-le, lancez l’aperçu, lisez le diff et demandez des modifications avant de l’accepter.',
        },
      ],
    },
    managed: {
      badge: 'Processus encadré',
      title: 'Un parcours maîtrisé, du cahier des charges à la prime',
      description:
        'Chaque mission passe par des espaces sécurisés, une revue en direct et une validation claire. Gardez toutes les parties prenantes alignées autour d’une source unique de vérité.',
      pipeline: [
        {
          id: 'templates',
          title: 'Modèles prêts à dupliquer',
          description:
            'Démarrez chaque mission à partir d’un projet E-Code fonctionnel, avec fonctionnalités IA, intégrations et expérimentations de croissance déjà configurées.',
        },
        {
          id: 'sandboxes',
          title: 'Environnements de revue sécurisés',
          description:
            'Les livrables s’exécutent dans des espaces isolés. Les évaluateurs disposent de l’aperçu en direct et du diff complet sans toucher à leur propre environnement.',
        },
        {
          id: 'acceptance',
          title: 'Critères d’acceptation et validation',
          description:
            'Associez les déploiements d’aperçu à des étapes de validation par l’équipe : la mission ne se termine que lorsque toute la liste de contrôle est validée.',
        },
      ],
      workflow: [
        {
          id: 'create',
          title: 'Créez une mission',
          description:
            'Définissez le périmètre, joignez les exigences et fixez la prime. Choisissez une approbation manuelle ou conditionnez le paiement aux critères d’acceptation.',
        },
        {
          id: 'recruit',
          title: 'Mobilisez les bons talents',
          description:
            'Invitez votre communauté ou publiez sur la place de marché mondiale E-Code avec des filtres par technologies et expérience.',
        },
        {
          id: 'ship',
          title: 'Évaluez et livrez',
          description:
            'Collaborez dans des environnements E-Code en direct, demandez des révisions et versez la prime lorsque le résultat atteint le niveau attendu.',
        },
      ],
    },
    categories: {
      badge: 'Tous les domaines du produit',
      title: 'Publiez des missions sur l’ensemble de vos technologies',
      description:
        'Quel que soit votre besoin, cadrez-le comme une mission et filtrez par technologies, expérience et réputation afin que les bons créateurs le trouvent.',
      items: [
        'Applications IA et agentiques',
        'Applications complètes',
        'Intégrations d’outils de développement',
        'Migrations de plateformes',
        'Outils internes',
        'Systèmes de design',
      ],
      stacks: [
        { id: 'react', label: 'React' },
        { id: 'typescript', label: 'TypeScript' },
        { id: 'node', label: 'Node.js' },
        { id: 'python', label: 'Python' },
        { id: 'agents', label: 'Agents IA' },
        { id: 'supabase', label: 'Supabase' },
      ],
      windowLabel: 'Tableau de bord des projets',
      imageAlt: 'Tableau de bord E-Code où les équipes suivent leurs projets, livrables et primes dans une vue unique',
      imageCaption: 'Suivez chaque mission, livrable et prime depuis un tableau de bord unique.',
    },
    cta: {
      title: 'Prêts à ajouter une mission à votre feuille de route ?',
      description:
        'Créez une mission, invitez des développeurs et commencez à évaluer de vrais livrables exécutables en quelques minutes.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
} as const satisfies MarketingExactPartnersBountiesCopy;

export function getMarketingExactPartnersBountiesCopy(language?: string | null): MarketingExactPartnersBountiesCopy {
  return resolveMarketingLanguage(language) === 'fr'
    ? marketingExactPartnersBountiesFr
    : marketingExactPartnersBountiesEn;
}
