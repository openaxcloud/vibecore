import type { CapturedSolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Enterprise. Dedicated governed-organization story in EN and FR. All
 * member, role, audit, deployment, and readiness data is fictional and labeled;
 * proof claims stop at the Northwind Control generation and local Webview state.
 */
export const ENTERPRISE_COPY = {
  en: {
    seo: {
      title: 'Enterprise Rollout with Governance | E-Code',
      description:
        'Plan an E-Code rollout around SSO and SCIM integration, role-based access, audit export, deployment approvals, and runtime requirements — with tenant validation before production enablement.',
      ogImageAlt:
        'E-Code Enterprise workspace with Northwind Control source files and the fictional local governance console in Webview.',
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
    demo: {
      badge: 'Fictional demo data',
      brand: 'Northwind Control',
      brandType: 'Platform engineering',
      nav: ['Members', 'Audit', 'Deploys'],
      eyebrow: 'Organization console',
      title: 'Recent audit events',
      intro:
        'A responsive local organization-console demonstration that keeps identity readiness, audit events, and controls visible without implying live integrations.',
      primaryHeading: 'Recent audit events',
      primaryRows: [
        { label: 'Role boundary review — Engineering', meta: 'Local sample · pending', status: 'SSO' },
        { label: 'Provisioning readiness — Platform', meta: 'Local sample · unconnected' },
        { label: 'Deployment approval — Payments API', meta: 'Local sample · review only' },
      ],
      asideHeading: 'Controls',
      asideRows: [
        { label: 'Identity / SSO', value: 'Not connected' },
        { label: 'Audit export', value: 'Local only' },
        { label: 'Runtime', value: 'Planning only' },
      ],
      asideCta: 'Export audit log',
      disclaimer:
        'Fictional local demonstration · no live identity provider, directory, runtime, audit export, or deployment connection · not a generation record',
      caption: {
        title: 'A local control surface for reviewing a governed rollout',
        body: 'This demonstration brings a fictional audit feed, integration readiness, role review, and a local export action into one responsive layout.',
      },
      alt: 'Northwind Control local organization-console demonstration with fictional audit events, role review, and clearly unconnected identity controls.',
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
      eyebrow: 'One prompt frames the control surface',
      title: 'Model the review workflow without pretending the integrations are live',
      intro:
        'The request below asks E-Code for a local governance console that a platform team can inspect. It demonstrates the interface and review flow while keeping real identity, directory, runtime, and deployment connections explicitly out of scope.',
      label: 'Example prompt',
      promptText:
        'Create Northwind Control, a governed organization console with members, role boundaries, audit events, deployment approvals, SSO and SCIM readiness, and private-runtime planning, using fictional local data only.',
      outputs: [
        {
          title: 'Identity-readiness interface',
          body: 'The local console presents SSO and SCIM readiness, members, and role boundaries as fictional review states. It does not connect an identity provider or provision an account.',
        },
        {
          title: 'Local audit and role review',
          body: 'A fictional event feed and role-review view make the intended governance workflow inspectable without claiming a production audit trail or enforced authorization.',
        },
        {
          title: 'Deployment and runtime planning',
          body: 'Local approval states and private-runtime planning prompts clarify the decisions to validate later. No deployment platform, private runtime, or production environment is connected.',
        },
        {
          title: 'Inspectable React and TypeScript project',
          body: 'The Agent keeps the brief, generated source, local state, and running Webview together so the team can review the control surface before any tenant configuration work.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Northwind Control prompt → Agent → governed Webview',
      title: 'Inspect the local governance console generated inside E-Code',
      body: 'These dedicated E-Code captures keep the Northwind Control prompt, Agent activity, generated React and TypeScript files, and fictional local organization console in one workspace. The second state opens “Export ready” from “Export audit log.”',
      galleryLabel: 'Captured Northwind Control generation and local audit-export interaction inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional local members, roles, events, approvals, and readiness states · no live identity provider, directory, audit export, private runtime, deployment integration, or tenant validation is demonstrated',
      openFullSizeLabel: 'Open the Northwind Control capture at full size',
      preview: {
        title: 'Northwind Control runs beside the files created by the Agent',
        body: 'The first capture shows the dedicated governance brief and generated project tree while Webview renders fictional members, role boundaries, audit events, deployment approvals, and integration-readiness notices.',
        alt: 'Real E-Code Enterprise workspace showing the Northwind Control prompt, Agent activity, generated React and TypeScript files, and a fictional local organization console in Webview.',
      },
      iteration: {
        title: 'A verified audit-export click opens the local ready state',
        body: 'After the single generation, a verified click on “Export audit log” opens “Export ready” with the fictional local event scope. It proves the interface transition, not an external export, live audit coverage, or tenant integration.',
        alt: 'E-Code Enterprise capture after the verified Export audit log click, with Northwind Control files and the local Export ready panel in Webview.',
      },
      cta: {
        label: 'Inspect the captured Northwind Control run',
        ariaLabel: 'Inspect the captured E-Code Northwind Control generation and local Export ready interaction',
      },
    },
    proofVisualAlts: {
      prompt:
        'E-Code Agent prompt requesting Northwind Control with members, role boundaries, audit events, deployment approvals, and SSO and SCIM readiness.',
      preview:
        'E-Code workspace with generated Northwind Control React and TypeScript files and the fictional local organization console open in Webview.',
      webviewOverview:
        'Northwind Control in Webview with fictional members, audit events, deployment reviews, and visibly unconnected integrations.',
      iteration:
        'E-Code workspace after the verified Export audit log click, with Northwind Control files and Export ready in Webview.',
      webviewIteration:
        'Northwind Control Export ready panel listing the fictional local event scope after the verified audit-export interaction.',
      files:
        'E-Code file tree for Northwind Control with editable member, role, audit-event, deployment-approval, and readiness source.',
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
          title: 'Guided static publishing',
          body: 'Supported static builds follow E-Code’s guided publishing flow. Enterprise roles, approval points, and target-environment checks remain explicit rollout configuration.',
        },
        {
          title: 'Live static URL or runtime handoff',
          body: 'A supported static release receives a live E-Code-hosted URL. Projects that depend on server processes remain exportable and need an agreed runtime, networking, secrets, and operational model.',
        },
        {
          title: 'Conversation-led iteration',
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
      eyebrow: 'Common questions',
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
      proofLinkLabel: 'See the real E-Code IDE proof',
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
        'Planifiez un déploiement E-Code autour de l’intégration SSO et SCIM, des accès par rôle, de l’export d’audit, des approbations de livraison et des exigences runtime, avec validation du tenant avant activation en production.',
      ogImageAlt:
        'Workspace E-Code Entreprise avec fichiers Northwind Control et console locale fictive de gouvernance dans la Webview.',
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
    demo: {
      badge: 'Données fictives',
      brand: 'Northwind Control',
      brandType: 'Ingénierie de plateforme',
      nav: ['Membres', 'Audit', 'Déploiements'],
      eyebrow: 'Console d’organisation',
      title: 'Événements d’audit récents',
      intro:
        'Une démonstration locale responsive de console d’organisation qui garde visibles la préparation de l’identité, les événements d’audit et les contrôles sans suggérer d’intégrations actives.',
      primaryHeading: 'Événements d’audit récents',
      primaryRows: [
        { label: 'Revue des limites de rôle — Ingénierie', meta: 'Exemple local · en attente', status: 'SSO' },
        { label: 'Préparation du provisionnement — Plateforme', meta: 'Exemple local · non connecté' },
        { label: 'Approbation de déploiement — API Paiements', meta: 'Exemple local · revue uniquement' },
      ],
      asideHeading: 'Contrôles',
      asideRows: [
        { label: 'Identité / SSO', value: 'Non connecté' },
        { label: 'Export d’audit', value: 'Local uniquement' },
        { label: 'Runtime', value: 'Planification uniquement' },
      ],
      asideCta: 'Exporter le journal d’audit',
      disclaimer:
        'Démonstration locale fictive · aucun fournisseur d’identité, annuaire, runtime, export d’audit ni déploiement connecté · pas une trace de génération',
      caption: {
        title: 'Une surface locale pour examiner un déploiement gouverné',
        body: 'Cette démonstration réunit un flux d’audit fictif, l’état de préparation des intégrations, la revue des rôles et une action d’export locale dans une mise en page responsive.',
      },
      alt: 'Démonstration locale de Northwind Control avec événements d’audit fictifs, revue des rôles et contrôles d’identité clairement non connectés.',
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
      eyebrow: 'Un prompt cadre la surface de contrôle',
      title: 'Modélisez la revue sans prétendre que les intégrations sont actives',
      intro:
        'La demande ci-dessous confie à E-Code une console locale de gouvernance que l’équipe plateforme peut inspecter. Elle démontre l’interface et le parcours de revue tout en gardant explicitement hors périmètre les connexions réelles d’identité, d’annuaire, de runtime et de déploiement.',
      label: 'Exemple de prompt',
      promptText:
        'Créez Northwind Control, une console d’organisation gouvernée avec membres, limites de rôles, événements d’audit, approbations de déploiement, préparation SSO et SCIM, et planification d’un runtime privé, uniquement avec des données locales fictives.',
      outputs: [
        {
          title: 'Interface de préparation de l’identité',
          body: 'La console locale présente la préparation SSO et SCIM, les membres et les limites de rôles comme des états de revue fictifs. Elle ne connecte aucun fournisseur d’identité et ne provisionne aucun compte.',
        },
        {
          title: 'Audit local et revue des rôles',
          body: 'Un flux d’événements fictifs et une vue de revue des rôles rendent le parcours de gouvernance inspectable sans revendiquer de piste d’audit en production ni d’autorisation appliquée.',
        },
        {
          title: 'Planification du déploiement et du runtime',
          body: 'Des états locaux d’approbation et des indications de planification du runtime privé explicitent les décisions à valider ensuite. Aucune plateforme de déploiement, aucun runtime privé ni environnement de production n’est connecté.',
        },
        {
          title: 'Projet React et TypeScript inspectable',
          body: 'L’Agent garde le brief, la source générée, l’état local et la Webview active ensemble afin que l’équipe examine la surface de contrôle avant tout travail de configuration du tenant.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt Northwind Control → Agent → Webview gouvernée',
      title: 'Inspectez la console locale de gouvernance générée dans E-Code',
      body: 'Ces captures E-Code dédiées réunissent dans un même workspace le prompt Northwind Control, l’activité de l’Agent, les fichiers React et TypeScript générés et la console d’organisation locale fictive. Le second état ouvre « Export prêt » depuis « Exporter le journal ».',
      galleryLabel: 'Génération Northwind Control capturée et interaction locale d’export d’audit dans E-Code',
      disclaimer:
        'Génération E-Code capturée · membres, rôles, événements, approbations et états de préparation locaux fictifs · aucun fournisseur d’identité, annuaire, export d’audit, runtime privé, déploiement ni tenant validé démontré',
      openFullSizeLabel: 'Ouvrir la capture Northwind Control en grand',
      preview: {
        title: 'Northwind Control tourne à côté des fichiers créés par l’Agent',
        body: 'La première capture montre le brief de gouvernance dédié et l’arborescence générée pendant que la Webview affiche membres fictifs, limites de rôles, événements d’audit, approbations de déploiement et avertissements sur les intégrations.',
        alt: 'Vrai workspace Entreprise E-Code montrant le prompt Northwind Control, l’activité de l’Agent, les fichiers React et TypeScript générés et une console d’organisation locale fictive dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur l’export d’audit ouvre l’état local prêt',
        body: 'Après la génération unique, un clic vérifié sur « Exporter le journal » ouvre « Export prêt » avec le périmètre fictif des événements locaux. Il prouve la transition d’interface, pas un export externe, une couverture d’audit active ni une intégration tenant.',
        alt: 'Capture E-Code Entreprise après le clic vérifié sur Exporter le journal, avec les fichiers Northwind Control et le panneau local Export prêt dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution Northwind Control capturée',
        ariaLabel: 'Inspecter la génération Northwind Control capturée dans E-Code et l’interaction locale Export prêt',
      },
    },
    proofVisualAlts: {
      prompt:
        'Prompt de l’Agent E-Code demandant Northwind Control avec membres, limites de rôles, événements d’audit, approbations de déploiement et préparation SSO et SCIM.',
      preview:
        'Workspace E-Code avec fichiers React et TypeScript Northwind Control générés et console d’organisation locale fictive dans la Webview.',
      webviewOverview:
        'Northwind Control dans la Webview avec membres fictifs, événements d’audit, revues de déploiement et intégrations visiblement non connectées.',
      iteration:
        'Workspace E-Code après le clic vérifié sur Exporter le journal, avec fichiers Northwind Control et état Export prêt dans la Webview.',
      webviewIteration:
        'Panneau Export prêt de Northwind Control listant le périmètre fictif des événements locaux après l’interaction vérifiée.',
      files:
        'Arborescence E-Code de Northwind Control avec sources modifiables des membres, rôles, événements d’audit, approbations et états de préparation.',
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
          title: 'Publication statique guidée',
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
      eyebrow: 'Questions fréquentes',
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
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le déploiement Entreprise',
      featuresLabel: 'Capacités Entreprise',
      useCasesLabel: 'Cas d’usage Entreprise',
      faqLabel: 'Questions sur l’Entreprise',
      finalCtaLabel: 'Démarrer votre déploiement entreprise',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
