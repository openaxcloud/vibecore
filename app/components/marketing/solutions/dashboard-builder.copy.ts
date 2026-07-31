import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL-03 — Dashboard Builder. Declined from the App Builder gabarit, centered on a
 * fictional connected sales dashboard. All demo data is fictional and labeled; the
 * one real captured E-Code IDE proof lives on /solutions/app-builder.
 */
export const DASHBOARD_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Dashboard Builder with Real Code | E-Code',
      description:
        'Describe the KPIs, tables, and filters your team needs. E-Code turns it into a data-rich dashboard in editable source files with a running Preview, project export, and code you extend to connect your own data and authentication.',
    },
    hero: {
      eyebrow: 'Dashboard Builder for connected data',
      title: 'Turn your sales numbers into a dashboard your team actually uses',
      subtitle:
        'Describe the KPIs, the pipeline view, and the filters you need. E-Code turns that into a data-rich dashboard in editable source code. Inspect every file, run it in Preview, refine it through the Agent, and extend the code to connect your own data and team access.',
      primaryCta: { label: 'Describe your dashboard', ariaLabel: 'Describe your dashboard with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the dashboard from a prompt' },
      microcopy:
        'Start from the metrics you already track. Source files, the running Preview, and the chart and filter components stay visible as the dashboard evolves.',
    },
    languageSwitch: { label: 'Choose the Dashboard Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'PipelineIQ',
      brandType: 'Revenue operations',
      nav: ['Overview', 'Pipeline', 'Team'],
      eyebrow: 'This quarter',
      title: 'Every deal, KPI, and forecast in one connected view.',
      intro:
        'A responsive dashboard that presents open opportunities, key metrics, and a forecast path in one clear layout.',
      primaryHeading: 'Open opportunities',
      primaryRows: [
        { label: 'Northwind Traders', meta: '€48k · Negotiation', status: 'Closing' },
        { label: 'Atlas Logistics', meta: '€32k · Proposal' },
        { label: 'Beacon Retail Group', meta: '€19k · Discovery' },
      ],
      asideHeading: 'Key metrics',
      asideRows: [
        { label: 'Pipeline', value: '€420k' },
        { label: 'Win rate', value: '38%' },
        { label: 'Avg. deal', value: '€24k' },
      ],
      asideCta: 'Open forecast',
      disclaimer: 'Inline responsive demonstration · fictional pipeline data · not a generation record',
      caption: {
        title: 'A dashboard that reads like a real revenue tool',
        body: 'This inline demonstration shows a KPI row, an opportunity table, and a forecast panel in one responsive layout.',
      },
      alt: 'Sales dashboard demonstration with an open opportunities table and a key metrics panel.',
    },
    problem: {
      eyebrow: 'From spreadsheet sprawl to a dashboard you own',
      title: 'Reporting looks solved until the spreadsheet becomes the product',
      intro:
        'A revenue team needs one view of the numbers that every rep and manager trusts. Spreadsheets and generic BI tools start fast, then fracture into tabs, break on refresh, and never become a real interface the team can shape.',
      obstacles: [
        {
          title: 'Spreadsheets do not scale',
          body: 'Shared tabs drift out of sync, formulas break silently, and no one is sure which version holds the number the forecast is built on.',
        },
        {
          title: 'BI tools lock the layout',
          body: 'Generic dashboards constrain how KPIs, tables, and filters fit together, and the moment you need a custom view you are fighting the tool.',
        },
        {
          title: 'No code means no control',
          body: 'When the reporting layer lives inside a closed platform, connecting your own data, auth, and access rules waits on someone else and stays out of your hands.',
        },
      ],
      bridge:
        'E-Code starts from the KPIs and views you describe and produces a dashboard in real source files. You inspect the components, run it in Preview, and extend the code to connect your data and team access.',
    },
    build: {
      eyebrow: 'One prompt starts the dashboard',
      title: 'Describe the metrics, not the charting library',
      intro:
        'The request below reads like a note from a sales leader. The four items map its implementation scope in real source files, not a locked BI template.',
      label: 'Example prompt',
      promptText:
        'Build a sales dashboard with KPIs, a pipeline table, filters, and team access, connected to our data.',
      outputs: [
        {
          title: 'KPI and chart components',
          body: 'Metric tiles, charts, and trend indicators render across desktop, tablet, and mobile from real components you can read and restyle.',
        },
        {
          title: 'Filterable pipeline table',
          body: 'An opportunities table with sortable columns and filters is modeled as editable code the team can extend without breaking the layout.',
        },
        {
          title: 'Authentication and team access',
          body: 'The dashboard scaffolds sign-in and role-aware access as real code you extend to your identity provider and access rules.',
        },
        {
          title: 'Preview and data wiring',
          body: 'E-Code runs the dashboard in Preview across screen sizes with fictional data. Connecting a real data source is code you extend; the project stays exportable for any host.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to a data dashboard like this one.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A data-rich dashboard you own and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. The charts, tables, filters, and access scaffolding are real code you extend to your own data — no hidden BI layer.',
      items: [
        {
          title: 'Editable source files',
          body: 'Real components, routes, styles, and chart code you can read, version, and change directly.',
        },
        {
          title: 'KPI and chart components',
          body: 'Metric tiles and charts modeled as components you can restyle and extend.',
        },
        {
          title: 'Filterable data tables',
          body: 'Sortable, filterable tables for pipeline and record views, ready to wire to your data.',
        },
        {
          title: 'Authentication scaffolding',
          body: 'Sign-in and role-aware access generated as code you extend to your identity provider.',
        },
        {
          title: 'Responsive layouts',
          body: 'Desktop, tablet, and mobile layouts verified in Preview before you extend the data.',
        },
        {
          title: 'Agent-ready iteration',
          body: 'Ask the Agent for the next metric or view and review the diff against the running dashboard.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for real data dashboards',
      title: 'Everything a revenue dashboard needs, in code you control',
      intro: 'The Dashboard Builder path keeps metrics, tables, filters, and access in one inspectable workflow.',
      items: [
        {
          title: 'KPIs and charts',
          body: 'Metric tiles, line and bar charts, and trend indicators as editable components.',
        },
        {
          title: 'Filters and segments',
          body: 'Date ranges, owners, and stage filters that narrow every view together.',
        },
        {
          title: 'Pipeline and record tables',
          body: 'Sortable, paginated tables for opportunities and detail records.',
        },
        {
          title: 'Authentication and roles',
          body: 'Sign-in and role-aware access scaffolded as code you extend to your provider.',
        },
        {
          title: 'Responsive by default',
          body: 'Layouts adapt from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Own the code',
          body: 'Export the project and connect your own data — the source and the queries stay yours.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Dashboards teams ship with the Dashboard Builder',
      intro: 'From a sales pipeline to an ops control room, the same loop produces a real, responsive dashboard.',
      items: [
        {
          title: 'Sales and revenue dashboards',
          body: 'Pipeline, forecast, and win-rate views for reps and managers.',
        },
        {
          title: 'Operations and KPI monitors',
          body: 'Live status boards for delivery, support, and service metrics.',
        },
        {
          title: 'Finance and reporting views',
          body: 'Budget, spend, and cash dashboards with filters and drill-downs.',
        },
        {
          title: 'Internal admin consoles',
          body: 'Role-aware tables and metrics for teams managing their own records.',
        },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Dashboard Builder, answered honestly',
      intro: 'What the Dashboard Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked BI tool?',
          body: 'You get editable source files — components, routes, charts, and tables — that you can read, version, and export. There is no proprietary dashboard lock-in.',
        },
        {
          title: 'Is the dashboard connected to my data?',
          body: 'No. The inline demonstration on this page uses fictional data and no connected backend. Connecting a real data source is code you extend, wired to your own database or API.',
        },
        {
          title: 'Does it include authentication and team access?',
          body: 'The build scaffolds sign-in and role-aware access as real code. Wiring it to your identity provider and enforcing your access rules is code you extend.',
        },
        {
          title: 'Is the dashboard responsive?',
          body: 'Yes. Layouts are generated to adapt across desktop, tablet, and mobile, and you verify them in Preview at each size.',
        },
        {
          title: 'How do I change the dashboard later?',
          body: 'Edit the files directly or ask the Agent for the next metric, table, or filter and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your dashboard and see it running',
      body: 'Turn the KPIs and views you have in mind into a data-rich dashboard in real source code, run it in Preview, and extend it to connect your own data and team access.',
      primaryCta: { label: 'Describe your dashboard', ariaLabel: 'Describe your dashboard with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the dashboard from a prompt' },
    },
    aria: {
      pageLabel: 'Dashboard Builder solution page',
      heroLabel: 'Dashboard Builder introduction',
      demoLabel: 'Dashboard Builder product demonstration',
      problemLabel: 'The dashboard building problem',
      buildLabel: 'How the Dashboard Builder works',
      outputListLabel: 'Dashboard build outputs',
      proofLinkLabel: 'See the real E-Code IDE proof',
      deliverablesLabel: 'What the Dashboard Builder delivers',
      featuresLabel: 'Dashboard Builder capabilities',
      useCasesLabel: 'Dashboard Builder use cases',
      faqLabel: 'Dashboard Builder questions',
      finalCtaLabel: 'Start building your dashboard',
    },
  },
  fr: {
    seo: {
      title: 'Générateur de tableau de bord avec vrai code | E-Code',
      description:
        'Décrivez les indicateurs, tableaux et filtres dont votre équipe a besoin. E-Code les transforme en un tableau de bord riche en données dans des fichiers source modifiables, avec un aperçu actif, l’export du projet et du code que vous étendez pour connecter vos propres données et l’authentification.',
    },
    hero: {
      eyebrow: 'Générateur de tableau de bord pour données connectées',
      title: 'Transformez vos chiffres commerciaux en un tableau de bord que votre équipe utilise vraiment',
      subtitle:
        'Décrivez les indicateurs, la vue pipeline et les filtres dont vous avez besoin. E-Code en fait un tableau de bord riche en données dans un vrai code source modifiable. Inspectez chaque fichier, exécutez-le dans l’aperçu, affinez-le avec l’Agent et étendez le code pour connecter vos propres données et un accès équipe.',
      primaryCta: { label: 'Décrivez votre tableau de bord', ariaLabel: 'Décrivez votre tableau de bord avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le tableau de bord à partir d’un prompt',
      },
      microcopy:
        'Partez des indicateurs que vous suivez déjà. Les fichiers source, l’aperçu actif et les composants de graphiques et de filtres restent visibles à mesure que le tableau de bord évolue.',
    },
    languageSwitch: {
      label: 'Choisir la langue de la page Générateur de tableau de bord',
      english: 'English',
      french: 'Français',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'PipelineIQ',
      brandType: 'Opérations commerciales',
      nav: ['Vue d’ensemble', 'Pipeline', 'Équipe'],
      eyebrow: 'Ce trimestre',
      title: 'Chaque affaire, indicateur et prévision dans une vue connectée.',
      intro:
        'Un tableau de bord responsive qui présente les opportunités ouvertes, les indicateurs clés et un parcours de prévision dans une mise en page claire.',
      primaryHeading: 'Opportunités ouvertes',
      primaryRows: [
        { label: 'Northwind Traders', meta: '48 k€ · Négociation', status: 'En clôture' },
        { label: 'Atlas Logistics', meta: '32 k€ · Proposition' },
        { label: 'Beacon Retail Group', meta: '19 k€ · Découverte' },
      ],
      asideHeading: 'Indicateurs clés',
      asideRows: [
        { label: 'Pipeline', value: '420 k€' },
        { label: 'Taux de gain', value: '38 %' },
        { label: 'Affaire moy.', value: '24 k€' },
      ],
      asideCta: 'Ouvrir la prévision',
      disclaimer: 'Démonstration responsive intégrée · données de pipeline fictives · pas une trace de génération',
      caption: {
        title: 'Un tableau de bord qui se lit comme un vrai outil commercial',
        body: 'Cette démonstration intégrée présente une ligne d’indicateurs, un tableau d’opportunités et un panneau de prévision dans une mise en page responsive.',
      },
      alt: 'Démonstration de tableau de bord commercial avec un tableau d’opportunités ouvertes et un panneau d’indicateurs clés.',
    },
    problem: {
      eyebrow: 'De la prolifération de tableurs à un tableau de bord que vous possédez',
      title: 'Le reporting paraît résolu jusqu’à ce que le tableur devienne le produit',
      intro:
        'Une équipe commerciale a besoin d’une vue unique des chiffres à laquelle chaque commercial et manager fait confiance. Les tableurs et outils de BI génériques démarrent vite, puis se fragmentent en onglets, cassent à l’actualisation et ne deviennent jamais une vraie interface que l’équipe peut façonner.',
      obstacles: [
        {
          title: 'Les tableurs ne passent pas à l’échelle',
          body: 'Les onglets partagés se désynchronisent, les formules cassent en silence, et personne n’est sûr de la version qui contient le chiffre sur lequel repose la prévision.',
        },
        {
          title: 'Les outils de BI verrouillent la mise en page',
          body: 'Les tableaux de bord génériques contraignent l’agencement des indicateurs, tableaux et filtres, et dès qu’il faut une vue sur mesure, vous luttez contre l’outil.',
        },
        {
          title: 'Sans code, pas de contrôle',
          body: 'Quand la couche de reporting vit dans une plateforme fermée, connecter vos propres données, votre auth et vos règles d’accès attend quelqu’un d’autre et vous échappe.',
        },
      ],
      bridge:
        'E-Code part des indicateurs et des vues que vous décrivez et produit un tableau de bord dans de vrais fichiers source. Vous inspectez les composants, l’exécutez dans l’aperçu et étendez le code pour connecter vos données et un accès équipe.',
    },
    build: {
      eyebrow: 'Un prompt lance le tableau de bord',
      title: 'Décrivez les indicateurs, pas la librairie de graphiques',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable commercial. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un template de BI verrouillé.',
      label: 'Exemple de prompt',
      promptText:
        'Construis un tableau de bord commercial avec des indicateurs, un pipeline, des filtres et un accès équipe, connecté à nos données.',
      outputs: [
        {
          title: 'Composants d’indicateurs et de graphiques',
          body: 'Tuiles de mesure, graphiques et indicateurs de tendance s’affichent sur desktop, tablette et mobile à partir de vrais composants que vous lisez et restylez.',
        },
        {
          title: 'Tableau de pipeline filtrable',
          body: 'Un tableau d’opportunités avec colonnes triables et filtres est modélisé comme un code modifiable que l’équipe peut étendre sans casser la mise en page.',
        },
        {
          title: 'Authentification et accès équipe',
          body: 'Le tableau de bord échafaude la connexion et un accès selon les rôles sous forme de vrai code que vous branchez à votre fournisseur d’identité et à vos règles d’accès.',
        },
        {
          title: 'Aperçu et branchement des données',
          body: 'E-Code exécute le tableau de bord dans l’aperçu à toutes les tailles d’écran avec des données fictives. Connecter une vraie source de données est du code que vous étendez ; le projet reste exportable pour tout hébergeur.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un tableau de bord de données comme celui-ci.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un tableau de bord riche en données que vous possédez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les graphiques, tableaux, filtres et l’échafaudage d’accès sont du vrai code que vous étendez à vos propres données — aucune couche de BI cachée.',
      items: [
        {
          title: 'Fichiers source modifiables',
          body: 'De vrais composants, routes, styles et code de graphiques que vous lisez, versionnez et modifiez directement.',
        },
        {
          title: 'Composants d’indicateurs et graphiques',
          body: 'Tuiles de mesure et graphiques modélisés comme des composants que vous restylez et étendez.',
        },
        {
          title: 'Tableaux de données filtrables',
          body: 'Tableaux triables et filtrables pour le pipeline et les vues d’enregistrements, prêts à brancher à vos données.',
        },
        {
          title: 'Échafaudage d’authentification',
          body: 'Connexion et accès selon les rôles générés en code que vous branchez à votre fournisseur d’identité.',
        },
        {
          title: 'Mises en page responsives',
          body: 'Desktop, tablette et mobile vérifiés dans l’aperçu avant de brancher les données.',
        },
        {
          title: 'Itération avec l’Agent',
          body: 'Demandez l’indicateur ou la vue suivante à l’Agent et relisez le diff face au tableau de bord actif.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour de vrais tableaux de bord de données',
      title: 'Tout ce dont un tableau de bord commercial a besoin, dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur de tableau de bord garde indicateurs, tableaux, filtres et accès dans un seul flux inspectable.',
      items: [
        {
          title: 'Indicateurs et graphiques',
          body: 'Tuiles de mesure, graphiques en courbes et en barres, et indicateurs de tendance comme composants modifiables.',
        },
        {
          title: 'Filtres et segments',
          body: 'Plages de dates, propriétaires et filtres d’étape qui affinent toutes les vues ensemble.',
        },
        {
          title: 'Tableaux de pipeline et d’enregistrements',
          body: 'Tableaux triables et paginés pour les opportunités et les enregistrements de détail.',
        },
        {
          title: 'Authentification et rôles',
          body: 'Connexion et accès selon les rôles échafaudés en code que vous branchez à votre fournisseur.',
        },
        {
          title: 'Responsive par défaut',
          body: 'Les mises en page s’adaptent du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Possédez le code',
          body: 'Exportez le projet et connectez vos propres données — la source et les requêtes restent les vôtres.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les tableaux de bord que les équipes livrent avec le Générateur de tableau de bord',
      intro:
        'D’un pipeline commercial à une salle de contrôle des opérations, la même boucle produit un vrai tableau de bord responsive.',
      items: [
        {
          title: 'Tableaux de bord commerciaux',
          body: 'Vues pipeline, prévision et taux de gain pour les commerciaux et les managers.',
        },
        {
          title: 'Moniteurs d’opérations et de KPI',
          body: 'Tableaux d’état en direct pour la livraison, le support et les métriques de service.',
        },
        {
          title: 'Vues finance et reporting',
          body: 'Tableaux de bord budget, dépenses et trésorerie avec filtres et explorations.',
        },
        {
          title: 'Consoles d’administration internes',
          body: 'Tableaux et indicateurs selon les rôles pour les équipes qui gèrent leurs propres enregistrements.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Le Générateur de tableau de bord, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de tableau de bord, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou un outil de BI verrouillé ?',
          body: 'Vous obtenez des fichiers source modifiables — composants, routes, graphiques et tableaux — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire de tableau de bord.',
        },
        {
          title: 'Le tableau de bord est-il connecté à mes données ?',
          body: 'Non. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté. Connecter une vraie source de données est du code que vous étendez, branché à votre propre base ou API.',
        },
        {
          title: 'Inclut-il l’authentification et l’accès équipe ?',
          body: 'La génération échafaude la connexion et un accès selon les rôles en vrai code. Le brancher à votre fournisseur d’identité et faire respecter vos règles d’accès est du code que vous étendez.',
        },
        {
          title: 'Le tableau de bord est-il responsive ?',
          body: 'Oui. Les mises en page sont générées pour s’adapter à desktop, tablette et mobile, et vous les vérifiez dans l’aperçu à chaque taille.',
        },
        {
          title: 'Comment modifier le tableau de bord ensuite ?',
          body: 'Modifiez les fichiers directement ou demandez l’indicateur, le tableau ou le filtre suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre tableau de bord et voyez-le tourner',
      body: 'Transformez les indicateurs et les vues que vous avez en tête en un tableau de bord riche en données dans du vrai code source, exécutez-le dans l’aperçu et étendez-le pour connecter vos propres données et un accès équipe.',
      primaryCta: { label: 'Décrivez votre tableau de bord', ariaLabel: 'Décrivez votre tableau de bord avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le tableau de bord à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Générateur de tableau de bord',
      heroLabel: 'Introduction du Générateur de tableau de bord',
      demoLabel: 'Démonstration produit du Générateur de tableau de bord',
      problemLabel: 'Le problème de la création de tableau de bord',
      buildLabel: 'Comment fonctionne le Générateur de tableau de bord',
      outputListLabel: 'Résultats de la génération de tableau de bord',
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le Générateur de tableau de bord',
      featuresLabel: 'Capacités du Générateur de tableau de bord',
      useCasesLabel: 'Cas d’usage du Générateur de tableau de bord',
      faqLabel: 'Questions sur le Générateur de tableau de bord',
      finalCtaLabel: 'Commencer à construire votre tableau de bord',
    },
  },
} as const satisfies SolutionCopyByLanguage;
