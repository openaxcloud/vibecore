import { resolveMarketingLanguage } from './marketing';

interface HighlightCopy {
  title: string;
  description: string;
}

interface DeploymentModeCopy {
  label: string;
  description: string;
  metrics: readonly string[];
}

interface FaqCopy {
  question: string;
  answer: string;
}

export interface PublicDeploymentsCopy {
  page: {
    heroBadge: string;
    heroTitle: string;
    heroDescription: string;
    talkToExpert: string;
    exploreDocs: string;
    heroHighlights: readonly HighlightCopy[];
    demo: {
      deployment: string;
      live: string;
      requestsPerMinute: string;
      latencyP95: string;
      autoscale: string;
      enabled: string;
      tls: string;
      issued: string;
      backups: string;
      nightly: string;
      productionLive: string;
      productionDetail: string;
    };
    modesTitle: string;
    modesDescription: string;
    modes: readonly DeploymentModeCopy[];
    reliabilityTitle: string;
    reliabilityDescription: string;
    reliabilityHighlights: readonly { value: string; label: string }[];
  };
  sections: {
    observabilityTitle: string;
    observabilityDescription: string;
    observabilityHighlights: readonly HighlightCopy[];
    liveMetricsDescription: string;
    logs: string;
    realTimeStreaming: string;
    alerts: string;
    export: string;
    webhookAndApi: string;
    performanceTitle: string;
    performanceParagraphs: readonly string[];
    scalingTitle: string;
    scalingParagraphs: readonly string[];
    leadershipTitle: string;
    leadershipParagraphs: readonly string[];
    workflowTitle: string;
    workflowDescription: string;
    workflowSteps: readonly HighlightCopy[];
    deploymentTargets: string;
    autoscale: string;
    primary: string;
    status: string;
    connected: string;
    staging: string;
    pendingDns: string;
    preview: string;
    generating: string;
    assuranceTitle: string;
    assuranceDescription: string;
    assuranceHighlights: readonly HighlightCopy[];
    releaseTimeline: string;
    protected: string;
    rolledOut: string;
    approval: string;
    complete: string;
    canaryActive: string;
    rollback: string;
    available: string;
    audit: string;
    signedVia: string;
    event: string;
    logged: string;
    pipelineTitle: string;
    pipelineDescription: string;
    faqTitle: string;
    faqDescription: string;
    faqs: readonly FaqCopy[];
    ctaTitle: string;
    ctaDescription: string;
    bookConsultation: string;
    reviewApiIntegrations: string;
  };
}

export const publicDeploymentsEn: PublicDeploymentsCopy = {
  page: {
    heroBadge: 'Deploy from idea to internet in one click',
    heroTitle: 'Launch production-grade apps straight from your workspace',
    heroDescription:
      'E-Code Deployments pairs the simplicity of an in-browser IDE with the rigor of a global cloud platform. Ship instantly, observe everything, and meet enterprise requirements without bolting together tools.',
    talkToExpert: 'Talk to an expert',
    exploreDocs: 'Explore deployment docs',
    heroHighlights: [
      {
        title: 'Push once, deploy everywhere',
        description: 'Ship from the editor to production with a single click. No YAML, no guesswork.',
      },
      {
        title: 'AI-assisted workflows',
        description: 'Guardrails, previews, and automated rollbacks ensure every release is safe.',
      },
      {
        title: 'Enterprise ready',
        description: 'SSO, audit logs, and compliance controls built directly into the pipeline.',
      },
    ],
    demo: {
      deployment: 'Deployment',
      live: 'Live',
      requestsPerMinute: 'Requests / min',
      latencyP95: 'Latency p95',
      autoscale: 'Autoscale',
      enabled: 'Enabled',
      tls: 'TLS',
      issued: 'Issued',
      backups: 'Backups',
      nightly: 'Nightly',
      productionLive: 'Production is live',
      productionDetail: 'Autoscaling ready • SSL issued • Requests streaming in real time',
    },
    modesTitle: 'Built for teams that refuse to compromise on speed or reliability',
    modesDescription:
      'The exact workflows you saw inside the workspace deployment tab—now available to every project in your organization with a consistent, secure experience.',
    modes: [
      {
        label: 'Autoscale Apps',
        description: 'Elastic runtimes that scale from zero to planet-wide traffic in seconds.',
        metrics: ['0 to 100 replicas', 'Edge-cache acceleration', 'Pay per request'],
      },
      {
        label: 'Reserved VMs',
        description: 'Dedicated compute with persistent storage for long-running workers and APIs.',
        metrics: ['Persistent volumes', 'Private networking', 'Performance isolation'],
      },
      {
        label: 'Static Sites',
        description: 'Ultra-fast hosting for front-ends with automatic builds and global CDN.',
        metrics: ['Atomic deploys', 'Instant cache invalidation', 'Custom domains'],
      },
    ],
    reliabilityTitle: 'What you actually get when you press publish',
    reliabilityDescription:
      'Each deployment inherits the same automation and observability the E-Code team relies on for its own production services.',
    reliabilityHighlights: [
      { value: 'Seconds', label: 'Build to live URL' },
      { value: 'HTTPS', label: 'Managed TLS on every deploy' },
      { value: '1-click', label: 'Publish from the editor' },
      { value: 'Live', label: 'Build logs and status' },
    ],
  },
  sections: {
    observabilityTitle: 'Everything inside the deployment tab, elevated for production teams',
    observabilityDescription:
      'Move from build to live without switching context. Monitor usage, manage resources, configure domains, and audit every release from a single panel.',
    observabilityHighlights: [
      {
        title: 'Production control room',
        description: 'Unified view of CPU, memory, and request health paired with AI insights for anomalies.',
      },
      {
        title: 'Global audience intelligence',
        description: 'Know where requests originate and how traffic flows with real-time geography overlays.',
      },
      {
        title: 'Operational actions',
        description: 'Pause, scale, manage domains, and update SSL without leaving the workspace tab.',
      },
    ],
    liveMetricsDescription:
      'Live metrics stream into the deployment tab with anomaly detection and suggested remediations powered by E-Code AI.',
    logs: 'Logs',
    realTimeStreaming: 'Real-time streaming',
    alerts: 'Alerts',
    export: 'Export',
    webhookAndApi: 'Webhook and API',
    performanceTitle: 'Performance at a glance',
    performanceParagraphs: [
      'Track real-time CPU and memory utilization, understand peak hours, and drill into request latency without leaving the tab.',
      'Export metrics or stream them to your preferred observability stack using secure webhooks and API access.',
    ],
    scalingTitle: 'Intelligent scaling',
    scalingParagraphs: [
      'Autoscaling policies learn from historical traffic to pre-warm instances before major launches and product announcements.',
      'Reserved capacity ensures mission-critical APIs always have dedicated compute ready to serve.',
    ],
    leadershipTitle: 'Insights for leadership',
    leadershipParagraphs: [
      'Summaries translate infrastructure performance into business-ready reports for product managers, finance partners, and executives.',
      'Share live dashboards securely with stakeholders using granular link permissions.',
    ],
    workflowTitle: 'A workflow your engineers already know',
    workflowDescription:
      'From first commit to global rollout, deployments stay within the E-Code workspace they already use every day.',
    workflowSteps: [
      {
        title: 'Connect your repo or start in E-Code',
        description: 'Auto-detect frameworks, install dependencies, and prepare environments instantly.',
      },
      {
        title: 'Configure once',
        description: 'Define runtime, secrets, and regions directly in the workspace deployment tab.',
      },
      {
        title: 'Deploy with confidence',
        description: 'Preview builds, AI-generated diff summaries, and automated smoke checks guard every release.',
      },
      {
        title: 'Monitor and iterate',
        description: 'Real-time logs, analytics, and one-click rollbacks keep teams shipping without downtime.',
      },
    ],
    deploymentTargets: 'Deployment Targets',
    autoscale: 'Autoscale',
    primary: 'Primary',
    status: 'Status',
    connected: 'Connected',
    staging: 'Staging',
    pendingDns: 'Pending DNS',
    preview: 'Preview',
    generating: 'Generating',
    assuranceTitle: 'Security, compliance, and governance woven into every release',
    assuranceDescription:
      'Run mission-critical workloads with built-in safeguards. Per-deployment secrets, role-based access, protected branches, and audit logs give compliance teams the controls they expect.',
    assuranceHighlights: [
      {
        title: 'Secure by default',
        description: 'Automatic TLS, per-deployment secrets, and role-based access keep sensitive projects protected.',
      },
      {
        title: 'Governed releases',
        description:
          'Require approvals, enforce protected branches, and log every deployment event for compliance teams.',
      },
      {
        title: 'Resilient data',
        description: 'Backups, migration tooling, and data residency options match enterprise expectations.',
      },
      {
        title: 'Continuous observability',
        description: 'Streaming logs, structured metrics, and proactive alerts across every environment.',
      },
    ],
    releaseTimeline: 'Release timeline',
    protected: 'Protected',
    rolledOut: 'Rolled out to 100% traffic',
    approval: 'Approval',
    complete: 'Complete',
    canaryActive: 'Canary release active',
    rollback: 'Rollback',
    available: 'Available',
    audit: 'Audit',
    signedVia: 'Signed via',
    event: 'Event',
    logged: 'Logged',
    pipelineTitle: 'Built on the same pipeline as E-Code',
    pipelineDescription:
      'Every customer deployment runs through the identical build, smoke-test, and rollback path E-Code uses to ship its own platform—so the workflow you publish with is the one we trust in production.',
    faqTitle: 'Questions, answered',
    faqDescription:
      'Everything about E-Code Deployments is designed to eliminate guesswork. Here are the answers teams ask most before moving their workloads over.',
    faqs: [
      {
        question: 'How does one-click deployment work?',
        answer:
          'E-Code compiles your project, provisions infrastructure, runs automated smoke tests, and makes it live in one motion. No additional configuration files or manual steps are required.',
      },
      {
        question: 'Can I bring existing infrastructure?',
        answer:
          'Yes. Deploy to E-Code-managed autoscale runtimes or connect reserved VMs and private networking so deployments align with your architecture.',
      },
      {
        question: 'What safeguards exist for production?',
        answer:
          'Every deployment ships with instant rollbacks, traffic controls, protected secrets, and audit trails that integrate with your existing IAM policies.',
      },
    ],
    ctaTitle: 'See how E-Code Deployments can power your next release',
    ctaDescription:
      'Partner with our solutions engineers for a tailored walkthrough of deployment automation, observability, and governance.',
    bookConsultation: 'Book a consultation',
    reviewApiIntegrations: 'Review API integrations',
  },
};

export const publicDeploymentsFr: PublicDeploymentsCopy = {
  page: {
    heroBadge: 'De l’idée à Internet en un clic',
    heroTitle: 'Lancez des applications de production directement depuis votre espace de travail',
    heroDescription:
      'E-Code Deployments associe la simplicité d’un IDE dans le navigateur à la rigueur d’une plateforme cloud mondiale. Livrez instantanément, observez chaque événement et répondez aux exigences des entreprises sans multiplier les outils.',
    talkToExpert: 'Parler à un expert',
    exploreDocs: 'Consulter la documentation des déploiements',
    heroHighlights: [
      {
        title: 'Un push, un déploiement partout',
        description: 'Passez de l’éditeur à la production en un clic, sans YAML ni incertitude.',
      },
      {
        title: 'Workflows assistés par l’IA',
        description: 'Des garde-fous, aperçus et rollbacks automatiques sécurisent chaque version.',
      },
      {
        title: 'Prêt pour l’entreprise',
        description: 'SSO, journaux d’audit et contrôles de conformité sont intégrés au pipeline.',
      },
    ],
    demo: {
      deployment: 'Déploiement',
      live: 'En ligne',
      requestsPerMinute: 'Requêtes / min',
      latencyP95: 'Latence p95',
      autoscale: 'Mise à l’échelle automatique',
      enabled: 'Activée',
      tls: 'TLS',
      issued: 'Émis',
      backups: 'Sauvegardes',
      nightly: 'Chaque nuit',
      productionLive: 'La production est en ligne',
      productionDetail: 'Mise à l’échelle prête • SSL émis • Requêtes diffusées en temps réel',
    },
    modesTitle: 'Pour les équipes qui ne transigent ni sur la vitesse ni sur la fiabilité',
    modesDescription:
      'Les workflows du panneau de déploiement sont disponibles pour chaque projet de votre organisation, avec une expérience cohérente et sécurisée.',
    modes: [
      {
        label: 'Applications à mise à l’échelle automatique',
        description: 'Des runtimes élastiques qui passent de zéro à une audience mondiale en quelques secondes.',
        metrics: ['De 0 à 100 réplicas', 'Accélération du cache edge', 'Paiement à la requête'],
      },
      {
        label: 'VM réservées',
        description: 'Un calcul dédié et un stockage persistant pour les workers et API de longue durée.',
        metrics: ['Volumes persistants', 'Réseau privé', 'Isolation des performances'],
      },
      {
        label: 'Sites statiques',
        description: 'Un hébergement ultrarapide des interfaces, avec builds automatiques et CDN mondial.',
        metrics: ['Déploiements atomiques', 'Invalidation instantanée du cache', 'Domaines personnalisés'],
      },
    ],
    reliabilityTitle: 'Ce que vous obtenez réellement en publiant',
    reliabilityDescription:
      'Chaque déploiement bénéficie des mêmes automatismes et outils d’observabilité que ceux utilisés par E-Code pour ses propres services de production.',
    reliabilityHighlights: [
      { value: 'Secondes', label: 'Du build à l’URL en ligne' },
      { value: 'HTTPS', label: 'TLS géré sur chaque déploiement' },
      { value: '1 clic', label: 'Publication depuis l’éditeur' },
      { value: 'Direct', label: 'Journaux de build et état' },
    ],
  },
  sections: {
    observabilityTitle: 'Tout le panneau de déploiement, renforcé pour les équipes de production',
    observabilityDescription:
      'Passez du build à la mise en ligne sans changer de contexte. Surveillez l’usage, gérez les ressources et les domaines, puis auditez chaque version depuis un panneau unique.',
    observabilityHighlights: [
      {
        title: 'Poste de contrôle de la production',
        description: 'Une vue unifiée du CPU, de la mémoire et des requêtes, enrichie par la détection d’anomalies.',
      },
      {
        title: 'Intelligence de l’audience mondiale',
        description:
          'Identifiez l’origine des requêtes et les flux de trafic grâce à une carte géographique en temps réel.',
      },
      {
        title: 'Actions opérationnelles',
        description:
          'Mettez en pause, adaptez la capacité, gérez les domaines et actualisez le SSL sans quitter le panneau.',
      },
    ],
    liveMetricsDescription:
      'Les métriques en direct alimentent le panneau avec une détection des anomalies et des corrections suggérées par l’IA E-Code.',
    logs: 'Journaux',
    realTimeStreaming: 'Diffusion en temps réel',
    alerts: 'Alertes',
    export: 'Export',
    webhookAndApi: 'Webhook et API',
    performanceTitle: 'Les performances en un coup d’œil',
    performanceParagraphs: [
      'Suivez le CPU et la mémoire en temps réel, repérez les heures de pointe et analysez la latence des requêtes sans quitter le panneau.',
      'Exportez les métriques ou diffusez-les vers votre solution d’observabilité au moyen de webhooks sécurisés et de l’API.',
    ],
    scalingTitle: 'Mise à l’échelle intelligente',
    scalingParagraphs: [
      'Les politiques apprennent du trafic historique afin de préchauffer les instances avant les lancements importants.',
      'La capacité réservée garantit des ressources dédiées aux API critiques.',
    ],
    leadershipTitle: 'Des informations utiles à la direction',
    leadershipParagraphs: [
      'Les synthèses transforment les performances de l’infrastructure en rapports exploitables par les équipes produit, finance et direction.',
      'Partagez des tableaux de bord en direct avec des autorisations de lien précises.',
    ],
    workflowTitle: 'Un workflow déjà familier à vos ingénieurs',
    workflowDescription:
      'Du premier commit au déploiement mondial, tout reste dans l’espace de travail E-Code utilisé chaque jour.',
    workflowSteps: [
      {
        title: 'Connectez votre dépôt ou démarrez dans E-Code',
        description: 'Détectez le framework, installez les dépendances et préparez les environnements automatiquement.',
      },
      {
        title: 'Configurez une seule fois',
        description: 'Définissez le runtime, les secrets et les régions dans le panneau de déploiement.',
      },
      {
        title: 'Déployez en toute confiance',
        description: 'Les aperçus, résumés de diff par l’IA et smoke tests automatiques protègent chaque version.',
      },
      {
        title: 'Surveillez et améliorez',
        description: 'Journaux en temps réel, analyses et rollbacks en un clic maintiennent le rythme des équipes.',
      },
    ],
    deploymentTargets: 'Cibles de déploiement',
    autoscale: 'Mise à l’échelle automatique',
    primary: 'Principal',
    status: 'État',
    connected: 'Connecté',
    staging: 'Préproduction',
    pendingDns: 'DNS en attente',
    preview: 'Aperçu',
    generating: 'Génération en cours',
    assuranceTitle: 'Sécurité, conformité et gouvernance intégrées à chaque version',
    assuranceDescription:
      'Exécutez vos charges critiques avec des protections intégrées. Secrets par déploiement, accès par rôle, branches protégées et journaux d’audit offrent les contrôles attendus par la conformité.',
    assuranceHighlights: [
      {
        title: 'Sécurisé par défaut',
        description: 'TLS automatique, secrets par déploiement et accès par rôle protègent les projets sensibles.',
      },
      {
        title: 'Versions gouvernées',
        description: 'Exigez des approbations, protégez les branches et journalisez chaque événement de déploiement.',
      },
      {
        title: 'Données résilientes',
        description:
          'Sauvegardes, outils de migration et options de résidence répondent aux exigences des entreprises.',
      },
      {
        title: 'Observabilité continue',
        description: 'Journaux diffusés, métriques structurées et alertes proactives dans chaque environnement.',
      },
    ],
    releaseTimeline: 'Chronologie des versions',
    protected: 'Protégée',
    rolledOut: 'Déployée sur 100 % du trafic',
    approval: 'Approbation',
    complete: 'Terminée',
    canaryActive: 'Version canari active',
    rollback: 'Rollback',
    available: 'Disponible',
    audit: 'Audit',
    signedVia: 'Signé via',
    event: 'Événement',
    logged: 'Journalisé',
    pipelineTitle: 'Le même pipeline que celui d’E-Code',
    pipelineDescription:
      'Chaque déploiement client emprunte le même parcours de build, smoke test et rollback qu’E-Code pour sa propre plateforme : vous publiez avec le workflow auquel nous faisons confiance en production.',
    faqTitle: 'Vos questions, nos réponses',
    faqDescription:
      'E-Code Deployments élimine les incertitudes. Voici les réponses aux questions les plus fréquentes avant la migration d’une charge de travail.',
    faqs: [
      {
        question: 'Comment fonctionne le déploiement en un clic ?',
        answer:
          'E-Code compile votre projet, provisionne l’infrastructure, exécute les smoke tests et le met en ligne en une seule opération. Aucun fichier de configuration ni aucune étape manuelle supplémentaire ne sont nécessaires.',
      },
      {
        question: 'Puis-je conserver mon infrastructure actuelle ?',
        answer:
          'Oui. Utilisez les runtimes E-Code à mise à l’échelle automatique ou connectez des VM réservées et un réseau privé pour respecter votre architecture.',
      },
      {
        question: 'Quelles protections couvrent la production ?',
        answer:
          'Chaque déploiement dispose de rollbacks immédiats, de contrôles du trafic, de secrets protégés et de pistes d’audit compatibles avec vos politiques IAM.',
      },
    ],
    ctaTitle: 'Découvrez comment E-Code Deployments peut soutenir votre prochaine version',
    ctaDescription:
      'Échangez avec nos ingénieurs solutions pour une démonstration adaptée de l’automatisation, de l’observabilité et de la gouvernance des déploiements.',
    bookConsultation: 'Réserver une consultation',
    reviewApiIntegrations: 'Consulter les intégrations API',
  },
};

export function getPublicDeploymentsCopy(language?: string | null): PublicDeploymentsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? publicDeploymentsFr : publicDeploymentsEn;
}
