import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Enterprise. Declined from the App Builder gabarit, centered on a governed
 * organization rollout of E-Code (SSO, SCIM, roles, audit export, private runtime
 * planning, governed deploys and support). All demo data is fictional and labeled;
 * the one real captured E-Code IDE proof lives on /solutions/app-builder.
 */
export const ENTERPRISE_COPY = {
  en: {
    seo: {
      title: 'Enterprise Rollout with Governance | E-Code',
      description:
        'Plan an E-Code rollout around SSO and SCIM integration, role-based access, audit export, deployment approvals, and runtime requirements — with tenant validation before production enablement.',
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
      brand: 'Northwind Platform',
      brandType: 'Platform engineering',
      nav: ['Members', 'Audit', 'Deploys'],
      eyebrow: 'Organization console',
      title: 'Recent audit events',
      intro:
        'A responsive organization console that surfaces identity, audit events, and controls in one governed view.',
      primaryHeading: 'Recent audit events',
      primaryRows: [
        { label: 'Role changed — Engineering', meta: 'admin · 12:04', status: 'SSO' },
        { label: 'Member provisioned — Platform', meta: 'scim-sync · 11:47' },
        { label: 'Deploy approved — Payments API', meta: 'release-owner · 11:20' },
      ],
      asideHeading: 'Controls',
      asideRows: [
        { label: 'Identity / SSO', value: 'SCIM' },
        { label: 'Audit export', value: 'Enabled' },
        { label: 'Runtime', value: 'Private planning' },
      ],
      asideCta: 'Export audit log',
      disclaimer: 'Inline responsive demonstration · fictional organization data · not a generation record',
      caption: {
        title: 'An org console that reads like a real governed rollout',
        body: 'This inline demonstration shows an audit event feed, identity and control status, and an audit export action in one responsive layout.',
      },
      alt: 'Enterprise organization console demonstration with a recent audit event list and an identity controls panel.',
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
      eyebrow: 'One request frames the rollout',
      title: 'Describe the governance, not the plumbing',
      intro:
        'The request below reads like a note from a platform lead. The four items map what a governed rollout provides — identity, governance, controlled delivery, and support — over real infrastructure, not a locked template.',
      label: 'Example prompt',
      promptText:
        'Roll out E-Code across our engineering org with SSO, role-based access, audit export, and governed deployments.',
      outputs: [
        {
          title: 'Identity and provisioning',
          body: 'E-Code includes SAML/OIDC and SCIM configuration paths. Your identity metadata, role mapping, joiner/leaver behavior, and tenant connection are validated before they govern production access.',
        },
        {
          title: 'Governance and access',
          body: 'Role-based access scopes build, review, deploy, and administration actions. The rollout verifies which identity, access, and deployment events enter the audit export required by your review process.',
        },
        {
          title: 'Controlled delivery',
          body: 'Runtime isolation is an architecture and rollout decision, not a default entitlement. Deployment roles and approval paths are configured and tested against the environments in scope.',
        },
        {
          title: 'Rollout support',
          body: 'A guided rollout plan, onboarding for teams, and a support path help the organization adopt E-Code in stages rather than all at once.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Inspect the real IDE workflow before planning an organization rollout',
      body: 'These two captures come from the real App Builder salon-booking run: the prompt, the agent, the generated files, and the running Preview all appear inside E-Code. They prove the build workflow; they do not claim that the fictional organization console above came from that run.',
      galleryLabel: 'Real IDE evidence from the App Builder salon-booking reference run',
      disclaimer:
        'Reference evidence only: both images are genuine captures of the App Builder salon run. The Enterprise console on this page is a scripted role demonstration with fictional organization data, not a generation log.',
      openFullSizeLabel: 'Open the enterprise workflow reference at full size',
      preview: {
        title: 'A real workspace moves from prompt to running Preview',
        body: 'The first reference capture shows the salon prompt, the agent conversation, the generated project tree, and the booking app running together in the E-Code IDE.',
        alt: 'Real E-Code App Builder salon run showing the agent, generated project files, and booking application in the Preview tab, used as workflow evidence for the Enterprise page.',
      },
      iteration: {
        title: 'The same workspace records the next requested change',
        body: 'The second reference capture shows a follow-up instruction and the updated Preview, illustrating the inspectable iteration loop an enterprise rollout governs.',
        alt: 'Real E-Code App Builder salon run after an iteration, with the follow-up agent exchange and updated Preview visible inside the IDE.',
      },
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
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
        'Planifiez un déploiement E-Code autour de l’intégration SSO et SCIM, des accès par rôle, de l’export d’audit, des approbations de livraison et des exigences d’exécution, avec validation du tenant avant activation en production.',
    },
    hero: {
      eyebrow: 'Déploiement entreprise pour des équipes d’ingénierie gouvernées',
      title: 'Déployez E-Code dans toute votre organisation avec identité, gouvernance et contrôle',
      subtitle:
        'Amenez E-Code à toute une organisation d’ingénierie par un déploiement contrôlé. Cadrez l’intégration SSO et SCIM, les frontières de rôles, l’export d’audit, les approbations de livraison et la topologie d’exécution selon votre environnement, puis validez chaque contrôle avant activation en production.',
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
      brand: 'Northwind Platform',
      brandType: 'Ingénierie de plateforme',
      nav: ['Membres', 'Audit', 'Déploiements'],
      eyebrow: 'Console d’organisation',
      title: 'Événements d’audit récents',
      intro:
        'Une console d’organisation adaptative qui présente l’identité, les événements d’audit et les contrôles dans une vue gouvernée.',
      primaryHeading: 'Événements d’audit récents',
      primaryRows: [
        { label: 'Rôle modifié — Ingénierie', meta: 'admin · 12:04', status: 'SSO' },
        { label: 'Membre provisionné — Plateforme', meta: 'scim-sync · 11:47' },
        { label: 'Déploiement approuvé — API Paiements', meta: 'release-owner · 11:20' },
      ],
      asideHeading: 'Contrôles',
      asideRows: [
        { label: 'Identité / SSO', value: 'SCIM' },
        { label: 'Export d’audit', value: 'Activé' },
        { label: 'Environnement d’exécution', value: 'Planification privée' },
      ],
      asideCta: 'Exporter le journal d’audit',
      disclaimer: 'Démonstration adaptative intégrée · données d’organisation fictives · pas une trace de génération',
      caption: {
        title: 'Une console d’organisation qui se lit comme un vrai déploiement gouverné',
        body: 'Cette démonstration intégrée présente un flux d’événements d’audit, l’état de l’identité et des contrôles, et une action d’export d’audit dans une mise en page adaptative.',
      },
      alt: 'Démonstration de console d’organisation entreprise avec une liste d’événements d’audit récents et un panneau de contrôles d’identité.',
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
          title: 'Environnement d’exécution et livraison ne sont pas gouvernés',
          body: 'Quand n’importe quel espace de travail peut tout exécuter et livrer partout, les équipes plateforme perdent l’isolation de l’environnement d’exécution et les contrôles de déploiement qu’exige leur environnement.',
        },
      ],
      bridge:
        'Le déploiement entreprise E-Code aligne l’intégration d’identité, les rôles, l’export d’audit, les exigences d’exécution et les approbations de livraison sur vos contrôles existants. La configuration et la validation du tenant précèdent l’activation en production.',
    },
    build: {
      eyebrow: 'Une demande cadre le déploiement',
      title: 'Décrivez la gouvernance, pas la tuyauterie',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable plateforme. Les quatre éléments cartographient ce qu’un déploiement gouverné fournit — identité, gouvernance, livraison contrôlée et support — sur une vraie infrastructure, pas un modèle verrouillé.',
      label: 'Exemple de prompt',
      promptText:
        'Déployez E-Code dans toute notre organisation d’ingénierie avec le SSO, des accès par rôle, l’export d’audit et des déploiements gouvernés.',
      outputs: [
        {
          title: 'Identité et provisionnement',
          body: 'E-Code inclut des parcours de configuration SAML/OIDC et SCIM. Vos métadonnées d’identité, le mapping des rôles, les arrivées et départs, et la connexion du tenant sont validés avant de gouverner les accès de production.',
        },
        {
          title: 'Gouvernance et accès',
          body: 'Les accès par rôle cadrent les actions de construction, revue, déploiement et administration. Le déploiement vérifie quels événements d’identité, d’accès et de livraison entrent dans l’export exigé par votre processus de revue.',
        },
        {
          title: 'Livraison contrôlée',
          body: 'L’isolation de l’environnement d’exécution est une décision d’architecture et de déploiement, pas un droit activé par défaut. Les rôles et parcours d’approbation sont configurés et testés selon les environnements du périmètre.',
        },
        {
          title: 'Support au déploiement',
          body: 'Un plan de déploiement guidé, une prise en main des équipes et un canal de support aident l’organisation à adopter E-Code par étapes plutôt que d’un seul coup.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Inspectez le vrai parcours IDE avant de planifier un déploiement organisationnel',
      body: 'Ces deux captures viennent du vrai run Générateur d’applications du salon de coiffure : le prompt, l’agent, les fichiers générés et l’aperçu actif apparaissent ensemble dans E-Code. Elles prouvent le parcours de construction ; elles ne prétendent pas que la console d’organisation fictive ci-dessus vient de ce run.',
      galleryLabel: 'Preuves IDE réelles du run de référence Générateur d’applications du salon',
      disclaimer:
        'Preuve de référence uniquement : les deux images sont de vraies captures du run Générateur d’applications du salon. La console Entreprise de cette page est une démonstration scénarisée avec des données d’organisation fictives, pas un journal de génération.',
      openFullSizeLabel: 'Ouvrir la référence du parcours entreprise en plein format',
      preview: {
        title: 'Un vrai espace de travail passe du prompt à l’aperçu actif',
        body: 'La première capture de référence montre le prompt du salon, l’échange avec l’agent, l’arborescence générée et l’application de réservation qui tourne dans l’IDE E-Code.',
        alt: 'Vrai run Générateur d’applications E-Code du salon montrant l’agent, les fichiers projet générés et l’application de réservation dans l’onglet Aperçu, utilisé comme preuve de parcours pour la page Entreprise.',
      },
      iteration: {
        title: 'Le même espace de travail conserve la modification demandée ensuite',
        body: 'La seconde capture de référence montre une instruction de suivi et l’aperçu mis à jour, soit la boucle d’itération inspectable qu’un déploiement entreprise encadre.',
        alt: 'Vrai run Générateur d’applications E-Code du salon après une itération, avec l’échange de suivi de l’agent et l’aperçu mis à jour visibles dans l’IDE.',
      },
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page Générateur d’applications',
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
          body: 'Les équipes reçoivent de vrais composants, routes, styles et fichiers de configuration que les relecteurs inspectent dans l’espace de travail puis exportent vers leur processus de versionnement et de livraison.',
        },
        {
          title: 'Frontières données et intégrations visibles',
          body: 'Schémas, adaptateurs, références d’environnement et noms de secrets restent visibles dans le projet. Bases, fournisseurs d’identité et services internes exigent encore des connexions approuvées et la validation du tenant ; les identifiants n’ont pas leur place dans la source générée.',
        },
        {
          title: 'Aperçu adaptatif à relire',
          body: 'Une compilation compatible tourne dans l’aperçu sur desktop, tablette et mobile pour que produit, plateforme et sécurité inspectent la même interface courante avant toute décision de livraison.',
        },
        {
          title: 'Publication statique guidée',
          body: 'Les compilations statiques prises en charge suivent le parcours de publication guidée E-Code. Rôles entreprise, points d’approbation et contrôles de l’environnement cible restent une configuration explicite du déploiement.',
        },
        {
          title: 'URL statique en ligne ou relais d’exécution',
          body: 'Une livraison statique prise en charge reçoit une URL en ligne hébergée par E-Code. Les projets dépendants de processus serveur restent exportables et exigent un modèle convenu d’exécution, réseau, secrets et exploitation.',
        },
        {
          title: 'Itération pilotée par la conversation',
          body: 'Une équipe poursuit la conversation avec l’Agent pour demander un changement de politique, d’interface ou de processus, puis relit les fichiers, le diff et l’aperçu mis à jour avant de l’accepter.',
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
          title: 'Rôles et autorisations',
          body: 'Les frontières de rôles cadrent qui peut construire, relire, livrer et administrer.',
        },
        {
          title: 'Export de piste d’audit',
          body: 'Vérifiez la couverture des événements exportés d’identité, d’accès et de livraison selon les preuves exigées par votre processus de revue.',
        },
        {
          title: 'Planification d’isolation de l’environnement d’exécution',
          body: 'Évaluez une topologie d’exécution privée selon les exigences de réseau, secrets, capacité, exploitation et support avant de l’ajouter au périmètre.',
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
          body: 'Évaluez E-Code à travers des exigences documentées d’identité, d’audit, d’exécution et de livraison sans déduire une certification de cette page.',
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
          body: 'Nous décrivons le SSO, le provisionnement, l’export d’audit et l’isolation de l’environnement d’exécution comme des capacités que vous planifiez et administrez. Nous n’affirmons pas de certification de conformité précise sur cette page — parlons-en selon vos exigences.',
        },
        {
          title: 'Les espaces de travail peuvent-ils tourner sur un environnement d’exécution privé ?',
          body: 'Cette page promet la planification d’un environnement d’exécution privé, pas un environnement privé activé. Topologie, disponibilité, réseau, exploitation, support et périmètre commercial sont confirmés pendant le déploiement avant tout engagement d’implémentation.',
        },
        {
          title: 'Comment les déploiements restent-ils gouvernés ?',
          body: 'Le déploiement configure les rôles et points de revue pour les parcours de livraison pris en charge, puis teste qui peut livrer et comment l’approbation se déroule dans les environnements du périmètre.',
        },
      ],
    },
    finalCta: {
      title: 'Planifiez votre déploiement E-Code gouverné',
      body: 'Alignez identité, rôles, export d’audit, exigences d’exécution et approbations de livraison sur votre environnement, puis validez chaque contrôle de production avant activation.',
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
} as const satisfies SolutionCopyByLanguage;
