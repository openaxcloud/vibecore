import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Enterprise. Dedicated release-governance story in EN and FR. All
 * releases, environments, approvals, and audit entries are fictional and labeled;
 * proof claims stop at the captured Agent exchange, generated files, Webview,
 * and local approval interaction.
 */
export const ENTERPRISE_COPY = {
  en: {
    seo: {
      title: 'Enterprise Rollout with Governance | E-Code',
      description:
        'Plan an E-Code rollout and inspect a local release-governance workspace. SSO, RBAC, audit export, approvals, and deployments require tenant validation.',
    },
    hero: {
      eyebrow: 'Enterprise rollout for governed engineering teams',
      title: 'Roll out E-Code across your org with identity, governance, and control',
      subtitle:
        'Bring E-Code to a whole engineering organization through a controlled rollout. Scope SSO and SCIM integration, role boundaries, audit export, deployment approvals, and runtime topology against your environment, then validate each production control before enablement.',
      primaryCta: { label: 'Plan your rollout', ariaLabel: 'Plan your E-Code enterprise rollout' },
      secondaryCta: { label: 'See how governance works', ariaLabel: 'See how E-Code governance and controls work' },
      microcopy:
        'Start from the controls your organization already requires. Identity, roles, audit export, and deploy governance stay visible as the rollout expands across teams.',
    },
    languageSwitch: { label: 'Choose the Enterprise page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Northwind Control',
      brandType: 'Local release-governance demo',
      nav: ['Releases', 'Environments', 'Activity'],
      eyebrow: 'Fictional release workspace',
      title: 'Review release readiness before an approval decision.',
      intro:
        'A responsive local workspace with release readiness, an approval checklist, environment status, ownership, and an activity timeline. It runs without enterprise integrations.',
      primaryHeading: 'Fictional release state',
      primaryRows: [
        { label: 'Release 2.8 readiness', meta: 'fictional version · local state', status: 'Review required' },
        { label: 'Production environment', meta: 'sample status · no live runtime' },
        { label: 'Approval owner', meta: 'fictional platform lead' },
      ],
      asideHeading: 'Demonstration boundaries',
      asideRows: [
        { label: 'SSO / RBAC', value: 'Enterprise UI demo' },
        { label: 'Audit timeline', value: 'Local events' },
        { label: 'Deployment', value: 'Not connected' },
      ],
      asideCta: 'Review release',
      disclaimer:
        'Scripted local frontend · fictional releases, environments, owners, and events · no SSO, RBAC, audit export, deployment connection, or production approval · not a generation record',
      caption: {
        title: 'A release-review workspace that does not imitate operational evidence',
        body: 'This local interface demonstrates readiness, environment, ownership, checklist, and activity states without claiming that an enterprise control or deployment executed.',
      },
      alt: 'Scripted Northwind Control release workspace with fictional readiness, environment, owner, approval, and local audit states and no connected enterprise services.',
    },
    problem: {
      eyebrow: 'From ungoverned adoption to a controlled rollout',
      title: 'AI build tools spread fast, then collide with identity, access, and audit requirements',
      intro:
        'A single team can adopt a build tool overnight, but an organization cannot. Security, platform, and compliance need central identity, role boundaries, an audit trail, and control over where code runs and how it ships — before adoption becomes a liability.',
      obstacles: [
        {
          title: 'Identity lives outside the org directory',
          body: 'Standalone accounts and per-team logins sit outside SSO, so joiners and leavers are managed by hand and access never reflects the directory of record.',
        },
        {
          title: 'Access and audit are unaccountable',
          body: 'Without role boundaries and an exportable audit trail, no one can answer who changed what, who approved a deploy, or who can reach which environment.',
        },
        {
          title: 'Runtime and delivery are ungoverned',
          body: 'When any workspace can run anything and ship anywhere, platform teams lose the runtime isolation and deploy controls their environment requires.',
        },
      ],
      bridge:
        'The E-Code enterprise rollout maps identity integration, roles, audit export, runtime requirements, and deployment approvals to your existing controls. Configuration and tenant validation precede production enablement.',
    },
    build: {
      eyebrow: 'One prompt starts the release workspace',
      title: 'Describe the release decision your platform team needs to make',
      intro:
        'This platform-team request becomes Northwind Control in editable React and TypeScript files. The generated Webview keeps every release record local and marks enterprise integrations as demonstrations.',
      label: 'Platform rollout brief',
      promptText:
        'Create Northwind Control, a product release governance workspace for an enterprise software team. Include release readiness, approval checklist, environment status, ownership, and a local audit activity timeline. Treat SSO, RBAC, audit export, and deployment as interface demonstrations only; do not claim live enterprise integrations. Build accessible responsive React and TypeScript with graphite, steel blue, and orange actions. No purple.',
      outputs: [
        {
          title: 'Release-readiness overview',
          body: 'The Agent creates a responsive release view with fictional readiness, status, and risk information in editable project files.',
        },
        {
          title: 'Approval checklist and ownership',
          body: 'A review panel groups checklist items, owners, status, risk, and local approval controls. These controls do not authorize a real user or deployment.',
        },
        {
          title: 'Environment status and local timeline',
          body: 'Fictional environment cards and activity entries make the release context visible. No runtime, audit destination, or deployment provider receives those events.',
        },
        {
          title: 'A clickable release review in Webview',
          body: 'The “Review release” action opens the Approval checklist beside the Agent exchange and generated source. It proves the local interface path, not SSO, RBAC, audit export, or release execution.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Northwind Control prompt → Agent → release review in Webview',
      title: 'Inspect the release-governance workspace generated inside E-Code',
      body: 'These dedicated captures keep the Northwind Control prompt, Agent activity, generated React and TypeScript project tree, and the release-readiness Webview on one screen. The second state opens the Approval checklist from “Review release.”',
      galleryLabel: 'Captured Northwind Control generation and Approval checklist interaction inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional releases, environments, owners, risks, and local events · no connected SSO, enforced RBAC, audit export, deployment provider, production approval, or private runtime is demonstrated',
      openFullSizeLabel: 'Open the Northwind Control capture at full size',
      preview: {
        title: 'Northwind Control runs beside the files the Agent created',
        body: 'The first capture shows the real Agent exchange and generated project tree while Webview renders release readiness, environment status, ownership, and a fictional local activity timeline.',
        alt: 'Real E-Code Enterprise workspace showing the Northwind Control prompt, Agent activity, generated React and TypeScript files, and a fictional release-readiness view in Webview.',
      },
      iteration: {
        title: '“Review release” opens the local Approval checklist',
        body: 'The follow-up capture keeps the Agent iteration visible after the Webview action opens owner, status, risk, and local approval controls. It proves the UI interaction, not identity enforcement, audit export, deployment, or a real approval.',
        alt: 'Real E-Code Enterprise iteration showing generated Northwind Control files and the Review release interaction opening an Approval checklist with fictional owner, status, risk, and local controls in Webview.',
      },
      cta: {
        label: 'Inspect the captured release run',
        ariaLabel:
          'Inspect the captured E-Code Northwind Control generation and Approval checklist Webview interaction',
      },
    },
    deliverables: {
      eyebrow: 'What your organization receives',
      title: 'Inspectable project output, from source review to governed delivery',
      intro:
        'Every generated project exposes what teams review, what platform owners still connect, and which publishing path applies. Enterprise controls remain visible around the work without turning a demo into proof of production readiness.',
      items: [
        {
          title: 'Inspectable, exportable source',
          body: 'Teams receive real components, routes, styles, and configuration files that reviewers inspect in the workspace and export for their versioning and delivery process.',
        },
        {
          title: 'Visible data and integration boundaries',
          body: 'Schemas, adapters, environment references, and secret names stay visible in the project. Databases, identity providers, and internal services still require approved connections and tenant validation; credentials never belong in generated source.',
        },
        {
          title: 'Reviewable responsive Preview',
          body: 'A compatible build runs in Preview across desktop, tablet, and mobile so product, platform, and security reviewers inspect the same current interface before a release decision.',
        },
        {
          title: 'Governed static publishing',
          body: 'Supported static builds follow E-Code’s guided publishing flow. Enterprise roles, approval points, and target-environment checks remain explicit rollout configuration.',
        },
        {
          title: 'Live static URL or runtime handoff',
          body: 'A supported static release receives a live E-Code-hosted URL. Projects that depend on server processes remain exportable and need an agreed runtime, networking, secrets, and operational model.',
        },
        {
          title: 'Governed Agent iteration',
          body: 'A team continues the Agent conversation to request a policy, interface, or workflow change, then reviews the updated files, diff, and running Preview before accepting it.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for governed organizations',
      title: 'Everything a platform team needs to administer E-Code at scale',
      intro:
        'The Enterprise path keeps identity, access, audit, and delivery in one administrable workflow over real code.',
      items: [
        {
          title: 'Single sign-on',
          body: 'Use the SAML/OIDC configuration path and validate your provider’s metadata, claims, and role mapping before production use.',
        },
        {
          title: 'Directory provisioning',
          body: 'SCIM synchronizes supported membership changes after tenant configuration and live provisioning tests succeed.',
        },
        { title: 'Roles and permissions', body: 'Role boundaries scope who can build, review, ship, and administer.' },
        {
          title: 'Audit trail export',
          body: 'Verify exported identity, access, and deployment event coverage against the evidence your review process requires.',
        },
        {
          title: 'Runtime isolation planning',
          body: 'Assess a private runtime topology against networking, secrets, capacity, operations, and support requirements before adding it to scope.',
        },
        {
          title: 'Deploy governance',
          body: 'Configure and test roles and review points around supported release paths without hiding the underlying source.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who rolls it out',
      title: 'Organizations that adopt E-Code under governance',
      intro:
        'From a platform team standardizing tooling to a regulated org tightening access, the same controls frame a governed rollout.',
      items: [
        {
          title: 'Platform and infrastructure teams',
          body: 'Standardize how the org builds and ships under central identity and deploy controls.',
        },
        {
          title: 'Security and compliance teams',
          body: 'Validate SSO, role boundaries, and audit evidence against internal access and review requirements.',
        },
        {
          title: 'Regulated organizations',
          body: 'Evaluate E-Code through documented identity, audit, runtime, and deployment requirements without inferring a certification from this page.',
        },
        {
          title: 'Multi-team engineering orgs',
          body: 'Onboard many teams in stages with roles, provisioning, and governed delivery.',
        },
      ],
    },
    faq: {
      eyebrow: 'Enterprise-rollout questions',
      title: 'Enterprise rollout, answered honestly',
      intro: 'What a governed E-Code rollout provides, and where its boundaries are.',
      items: [
        {
          title: 'Does E-Code support SSO and SCIM?',
          body: 'E-Code includes SAML/OIDC configuration and SCIM provisioning paths. Production support for your organization is confirmed only after provider metadata, claims, role mapping, provisioning, and deprovisioning pass validation in your tenant.',
        },
        {
          title: 'Can I export an audit trail?',
          body: 'The enterprise scope includes audit export, with event coverage and destination verified against your review workflow. The inline demonstration on this page uses fictional data and proves no connected export.',
        },
        {
          title: 'Is E-Code certified for a specific compliance standard?',
          body: 'We describe SSO, provisioning, audit export, and runtime isolation as capabilities you plan and administer. We do not assert a specific compliance certification on this page — talk to us about your requirements.',
        },
        {
          title: 'Can workspaces run on a private runtime?',
          body: 'This page promises private-runtime planning, not an enabled private environment. Topology, availability, networking, operations, support, and commercial scope are confirmed during the rollout before any implementation commitment.',
        },
        {
          title: 'How do deployments stay governed?',
          body: 'The rollout configures roles and review points for the supported deployment paths, then tests who may release and how approval proceeds in the environments included in scope.',
        },
      ],
    },
    finalCta: {
      title: 'Plan your governed E-Code rollout',
      body: 'Map identity, roles, audit export, runtime requirements, and deployment approvals to your environment, then validate every production control before enablement.',
      primaryCta: { label: 'Plan your rollout', ariaLabel: 'Plan your E-Code enterprise rollout' },
      secondaryCta: { label: 'See how governance works', ariaLabel: 'See how E-Code governance and controls work' },
    },
    aria: {
      pageLabel: 'Enterprise solution page',
      heroLabel: 'Enterprise introduction',
      demoLabel: 'Enterprise product demonstration',
      problemLabel: 'The enterprise rollout problem',
      buildLabel: 'How the Enterprise rollout works',
      outputListLabel: 'Enterprise rollout outputs',
      proofLinkLabel: 'Inspect the enterprise-governance IDE evidence',
      deliverablesLabel: 'What the Enterprise rollout delivers',
      featuresLabel: 'Enterprise capabilities',
      useCasesLabel: 'Enterprise use cases',
      faqLabel: 'Enterprise questions',
      finalCtaLabel: 'Start your enterprise rollout',
    },
  },
  fr: {
    seo: {
      title: 'Déploiement entreprise avec gouvernance | E-Code',
      description:
        'Planifiez E-Code et inspectez un espace local de gouvernance des versions. SSO, RBAC, audit, approbations et déploiements exigent la validation du tenant.',
    },
    hero: {
      eyebrow: 'Déploiement entreprise pour des équipes d’ingénierie gouvernées',
      title: 'Déployez E-Code dans toute votre organisation avec identité, gouvernance et contrôle',
      subtitle:
        'Amenez E-Code à toute une organisation d’ingénierie par un déploiement contrôlé. Cadrez l’intégration SSO et SCIM, les frontières de rôles, l’export d’audit, les approbations de livraison et la topologie runtime selon votre environnement, puis validez chaque contrôle avant activation en production.',
      primaryCta: { label: 'Planifiez votre déploiement', ariaLabel: 'Planifiez votre déploiement entreprise E-Code' },
      secondaryCta: {
        label: 'Voir la gouvernance',
        ariaLabel: 'Voir comment fonctionnent la gouvernance et les contrôles E-Code',
      },
      microcopy:
        'Partez des contrôles que votre organisation exige déjà. Identité, rôles, export d’audit et gouvernance des déploiements restent visibles à mesure que le déploiement s’étend aux équipes.',
    },
    languageSwitch: { label: 'Choisir la langue de la page Entreprise', english: 'English', french: 'Français' },
    demo: {
      badge: 'Données fictives',
      brand: 'Northwind Control',
      brandType: 'Démo locale de gouvernance des releases',
      nav: ['Versions', 'Environnements', 'Activité'],
      eyebrow: 'Espace de release fictif',
      title: 'Relisez la préparation d’une version avant toute approbation.',
      intro:
        'Un espace local responsive avec préparation de version, checklist d’approbation, état des environnements, responsables et activité. Il tourne sans intégration entreprise.',
      primaryHeading: 'État de version fictif',
      primaryRows: [
        { label: 'Préparation version 2.8', meta: 'version fictive · état local', status: 'Revue requise' },
        { label: 'Environnement production', meta: 'état d’exemple · aucun runtime actif' },
        { label: 'Responsable approbation', meta: 'responsable plateforme fictif' },
      ],
      asideHeading: 'Limites de démonstration',
      asideRows: [
        { label: 'SSO / RBAC', value: 'Démo UI entreprise' },
        { label: 'Journal d’activité', value: 'Événements locaux' },
        { label: 'Déploiement', value: 'Non connecté' },
      ],
      asideCta: 'Examiner la version',
      disclaimer:
        'Frontend local scénarisé · versions, environnements, responsables et événements fictifs · aucun SSO, RBAC, export d’audit, déploiement connecté ni approbation de production · pas une trace de génération',
      caption: {
        title: 'Un espace de revue qui n’imite pas une preuve opérationnelle',
        body: 'Cette interface locale présente préparation, environnement, responsable, checklist et activité sans prétendre qu’un contrôle entreprise ou un déploiement s’est exécuté.',
      },
      alt: 'Espace Northwind Control scénarisé avec préparation, environnement, responsable, approbation et audit local fictifs, sans services entreprise connectés.',
    },
    problem: {
      eyebrow: 'De l’adoption non gouvernée à un déploiement contrôlé',
      title:
        'Les outils de génération IA se répandent vite, puis se heurtent aux exigences d’identité, d’accès et d’audit',
      intro:
        'Une seule équipe peut adopter un outil de génération du jour au lendemain, mais pas une organisation. La sécurité, la plateforme et la conformité ont besoin d’une identité centrale, de frontières de rôles, d’une piste d’audit et du contrôle de l’endroit où le code s’exécute et de la façon dont il est livré — avant que l’adoption ne devienne un risque.',
      obstacles: [
        {
          title: 'L’identité vit hors de l’annuaire',
          body: 'Des comptes autonomes et des connexions par équipe restent hors du SSO, si bien que les arrivées et départs se gèrent à la main et que les accès ne reflètent jamais l’annuaire de référence.',
        },
        {
          title: 'Accès et audit ne sont pas traçables',
          body: 'Sans frontières de rôles ni piste d’audit exportable, personne ne peut dire qui a changé quoi, qui a approuvé un déploiement, ni qui peut atteindre quel environnement.',
        },
        {
          title: 'Runtime et livraison ne sont pas gouvernés',
          body: 'Quand n’importe quel workspace peut tout exécuter et livrer partout, les équipes plateforme perdent l’isolation du runtime et les contrôles de déploiement qu’exige leur environnement.',
        },
      ],
      bridge:
        'Le déploiement entreprise E-Code aligne l’intégration d’identité, les rôles, l’export d’audit, les exigences runtime et les approbations de livraison sur vos contrôles existants. La configuration et la validation du tenant précèdent l’activation en production.',
    },
    build: {
      eyebrow: 'Un prompt lance l’espace de release',
      title: 'Décrivez la décision de mise en production de votre équipe plateforme',
      intro:
        'Cette demande d’équipe plateforme devient Northwind Control dans des fichiers React et TypeScript modifiables. La Webview générée garde chaque fiche de version locale et signale les intégrations entreprise comme des démonstrations.',
      label: 'Brief du déploiement plateforme',
      promptText:
        'Crée Northwind Control, un espace de gouvernance des mises en production pour une équipe logicielle d’entreprise. Ajoute la préparation de version, une checklist d’approbation, l’état des environnements, les responsables et un journal d’activité local. Présente le SSO, RBAC, export d’audit et déploiement uniquement comme démonstrations d’interface ; ne prétends pas avoir d’intégrations actives. React et TypeScript accessibles et responsive, graphite, bleu acier et actions orange. Aucun violet.',
      outputs: [
        {
          title: 'Vue de préparation de version',
          body: 'L’Agent crée une vue responsive avec préparation, statut et risque fictifs dans des fichiers projet modifiables.',
        },
        {
          title: 'Checklist d’approbation et responsables',
          body: 'Un panneau de revue regroupe checklist, responsables, statut, risque et contrôles locaux. Ces contrôles n’autorisent ni vrai utilisateur ni déploiement.',
        },
        {
          title: 'État des environnements et journal local',
          body: 'Des cartes d’environnement et événements fictifs rendent le contexte visible. Aucun runtime, destination d’audit ni fournisseur de déploiement ne reçoit ces événements.',
        },
        {
          title: 'Revue cliquable dans la Webview',
          body: 'L’action « Examiner la version » ouvre la Checklist d’approbation à côté de l’échange Agent et de la source générée. Elle prouve le parcours local, pas le SSO, le RBAC, l’export d’audit ni l’exécution d’une release.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt Northwind Control → Agent → revue dans la Webview',
      title: 'Inspectez l’espace de gouvernance des releases généré dans E-Code',
      body: 'Ces captures dédiées réunissent le prompt Northwind Control, l’activité de l’Agent, l’arborescence React et TypeScript générée et la Webview de préparation. Le second état ouvre la Checklist d’approbation depuis « Examiner la version ».',
      galleryLabel: 'Génération Northwind Control capturée et interaction Checklist d’approbation dans E-Code',
      disclaimer:
        'Génération E-Code capturée · versions, environnements, responsables, risques et événements locaux fictifs · aucun SSO connecté, RBAC appliqué, export d’audit, fournisseur de déploiement, approbation de production ni runtime privé démontré',
      openFullSizeLabel: 'Ouvrir la capture Northwind Control en grand',
      preview: {
        title: 'Northwind Control tourne à côté des fichiers créés par l’Agent',
        body: 'La première capture montre le vrai échange avec l’Agent et l’arborescence générée pendant que la Webview affiche préparation de version, état des environnements, responsables et journal d’activité local fictif.',
        alt: 'Vrai workspace Entreprise E-Code montrant le prompt Northwind Control, l’activité de l’Agent, les fichiers React et TypeScript générés et une vue fictive de préparation de version dans la Webview.',
      },
      iteration: {
        title: '« Examiner la version » ouvre la Checklist locale',
        body: 'La capture de suivi garde l’itération de l’Agent visible après l’ouverture des responsables, statuts, risques et contrôles locaux dans la Webview. Elle prouve l’interaction UI, pas l’identité, l’audit, le déploiement ni une vraie approbation.',
        alt: 'Vraie itération Entreprise E-Code montrant les fichiers Northwind Control générés et l’interaction Examiner la version ouvrant une Checklist avec responsables, statut, risque et contrôles locaux fictifs dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run de release capturé',
        ariaLabel:
          'Inspecter la génération Northwind Control capturée dans E-Code et la Checklist d’approbation dans la Webview',
      },
    },
    deliverables: {
      eyebrow: 'Ce que reçoit votre organisation',
      title: 'Une sortie projet inspectable, de la revue du code à la livraison gouvernée',
      intro:
        'Chaque projet généré expose ce que les équipes relisent, ce que la plateforme doit encore connecter et le parcours de publication applicable. Les contrôles entreprise entourent le travail sans transformer une démo en preuve d’aptitude à la production.',
      items: [
        {
          title: 'Source inspectable et exportable',
          body: 'Les équipes reçoivent de vrais composants, routes, styles et fichiers de configuration que les relecteurs inspectent dans le workspace puis exportent vers leur processus de versionnement et de livraison.',
        },
        {
          title: 'Frontières données et intégrations visibles',
          body: 'Schémas, adaptateurs, références d’environnement et noms de secrets restent visibles dans le projet. Bases, fournisseurs d’identité et services internes exigent encore des connexions approuvées et la validation du tenant ; les identifiants n’ont pas leur place dans la source générée.',
        },
        {
          title: 'Aperçu responsive à relire',
          body: 'Un build compatible tourne dans l’aperçu sur desktop, tablette et mobile pour que produit, plateforme et sécurité inspectent la même interface courante avant toute décision de livraison.',
        },
        {
          title: 'Publication statique gouvernée',
          body: 'Les builds statiques pris en charge suivent le parcours de publication guidée E-Code. Rôles entreprise, points d’approbation et contrôles de l’environnement cible restent une configuration explicite du déploiement.',
        },
        {
          title: 'URL statique en ligne ou relais runtime',
          body: 'Une livraison statique prise en charge reçoit une URL en ligne hébergée par E-Code. Les projets dépendants de processus serveur restent exportables et exigent un modèle convenu de runtime, réseau, secrets et exploitation.',
        },
        {
          title: 'Itération pilotée par la conversation',
          body: 'Une équipe poursuit la conversation avec l’Agent pour demander un changement de politique, d’interface ou de workflow, puis relit les fichiers, le diff et l’aperçu mis à jour avant de l’accepter.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour les organisations gouvernées',
      title: 'Tout ce dont une équipe plateforme a besoin pour administrer E-Code à l’échelle',
      intro:
        'Le parcours Entreprise garde identité, accès, audit et livraison dans un seul flux administrable sur du vrai code.',
      items: [
        {
          title: 'Authentification unique',
          body: 'Utilisez le parcours de configuration SAML/OIDC et validez les métadonnées, claims et mapping des rôles de votre fournisseur avant l’usage en production.',
        },
        {
          title: 'Provisionnement par annuaire',
          body: 'Le SCIM synchronise les changements d’appartenance pris en charge après réussite de la configuration du tenant et des tests réels de provisionnement.',
        },
        {
          title: 'Rôles et permissions',
          body: 'Les frontières de rôles cadrent qui peut construire, relire, livrer et administrer.',
        },
        {
          title: 'Export de piste d’audit',
          body: 'Vérifiez la couverture des événements exportés d’identité, d’accès et de livraison selon les preuves exigées par votre processus de revue.',
        },
        {
          title: 'Planification d’isolation runtime',
          body: 'Évaluez une topologie runtime privée selon les exigences de réseau, secrets, capacité, exploitation et support avant de l’ajouter au périmètre.',
        },
        {
          title: 'Gouvernance des déploiements',
          body: 'Configurez et testez rôles et points de revue autour des parcours de livraison pris en charge sans masquer la source sous-jacente.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui le déploie',
      title: 'Les organisations qui adoptent E-Code sous gouvernance',
      intro:
        'D’une équipe plateforme qui standardise l’outillage à une organisation régulée qui resserre les accès, les mêmes contrôles cadrent un déploiement gouverné.',
      items: [
        {
          title: 'Équipes plateforme et infrastructure',
          body: 'Standardisez la façon dont l’organisation construit et livre sous identité centrale et contrôles de déploiement.',
        },
        {
          title: 'Équipes sécurité et conformité',
          body: 'Validez le SSO, les frontières de rôles et les preuves d’audit selon les exigences internes d’accès et de revue.',
        },
        {
          title: 'Organisations régulées',
          body: 'Évaluez E-Code à travers des exigences documentées d’identité, d’audit, de runtime et de livraison sans déduire une certification de cette page.',
        },
        {
          title: 'Organisations multi-équipes',
          body: 'Intégrez de nombreuses équipes par étapes avec rôles, provisionnement et livraison gouvernée.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions sur le déploiement entreprise',
      title: 'Le déploiement entreprise, en toute honnêteté',
      intro: 'Ce que fournit un déploiement E-Code gouverné, et où sont ses limites.',
      items: [
        {
          title: 'E-Code prend-il en charge le SSO et le SCIM ?',
          body: 'E-Code inclut des parcours de configuration SAML/OIDC et de provisionnement SCIM. La prise en charge en production pour votre organisation n’est confirmée qu’après validation des métadonnées, claims, mappings de rôles, provisionnement et déprovisionnement dans votre tenant.',
        },
        {
          title: 'Puis-je exporter une piste d’audit ?',
          body: 'Le périmètre entreprise inclut l’export d’audit, avec couverture des événements et destination vérifiées selon votre flux de revue. La démonstration intégrée utilise des données fictives et ne prouve aucun export connecté.',
        },
        {
          title: 'E-Code est-il certifié pour une norme de conformité précise ?',
          body: 'Nous décrivons le SSO, le provisionnement, l’export d’audit et l’isolation du runtime comme des capacités que vous planifiez et administrez. Nous n’affirmons pas de certification de conformité précise sur cette page — parlons-en selon vos exigences.',
        },
        {
          title: 'Les workspaces peuvent-ils tourner sur un runtime privé ?',
          body: 'Cette page promet la planification d’un runtime privé, pas un environnement privé activé. Topologie, disponibilité, réseau, exploitation, support et périmètre commercial sont confirmés pendant le déploiement avant tout engagement d’implémentation.',
        },
        {
          title: 'Comment les déploiements restent-ils gouvernés ?',
          body: 'Le déploiement configure les rôles et points de revue pour les parcours de livraison pris en charge, puis teste qui peut livrer et comment l’approbation se déroule dans les environnements du périmètre.',
        },
      ],
    },
    finalCta: {
      title: 'Planifiez votre déploiement E-Code gouverné',
      body: 'Alignez identité, rôles, export d’audit, exigences runtime et approbations de livraison sur votre environnement, puis validez chaque contrôle de production avant activation.',
      primaryCta: { label: 'Planifiez votre déploiement', ariaLabel: 'Planifiez votre déploiement entreprise E-Code' },
      secondaryCta: {
        label: 'Voir la gouvernance',
        ariaLabel: 'Voir comment fonctionnent la gouvernance et les contrôles E-Code',
      },
    },
    aria: {
      pageLabel: 'Page solution Entreprise',
      heroLabel: 'Introduction Entreprise',
      demoLabel: 'Démonstration produit Entreprise',
      problemLabel: 'Le problème du déploiement entreprise',
      buildLabel: 'Comment fonctionne le déploiement Entreprise',
      outputListLabel: 'Résultats du déploiement Entreprise',
      proofLinkLabel: 'Inspecter la preuve IDE de gouvernance entreprise',
      deliverablesLabel: 'Ce que livre le déploiement Entreprise',
      featuresLabel: 'Capacités Entreprise',
      useCasesLabel: 'Cas d’usage Entreprise',
      faqLabel: 'Questions sur l’Entreprise',
      finalCtaLabel: 'Démarrer votre déploiement entreprise',
    },
  },
} as const satisfies SolutionCopyByLanguage;
