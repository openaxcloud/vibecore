import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL-03 — Dashboard Builder. Dedicated sales-analytics story in EN and FR.
 * All metrics are fictional and labeled; proof claims stop at the captured Agent
 * exchange, generated files, Webview, and local filters over sample data.
 */
export const DASHBOARD_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Dashboard Builder with Real Code | E-Code',
      description:
        'Describe the KPIs, tables, and filters your team needs. E-Code turns it into a data-rich dashboard in editable source files with a running Preview, project export, and code you extend to connect your own data and authentication.',
    },
    hero: {
      eyebrow: 'Dashboard Builder ready for your data',
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
      brandType: 'Sample revenue dashboard',
      nav: ['Overview', 'Pipeline', 'Team'],
      eyebrow: 'Sample quarter',
      title: 'Every deal, KPI, and forecast in one consolidated view.',
      intro:
        'A responsive dashboard that presents open opportunities, key metrics, and a forecast path in one clear layout.',
      primaryHeading: 'Fictional opportunities',
      primaryRows: [
        { label: 'Northwind Traders', meta: '€48k sample · Negotiation', status: 'Sample stage' },
        { label: 'Atlas Logistics', meta: '€32k sample · Proposal' },
        { label: 'Beacon Retail Group', meta: '€19k sample · Discovery' },
      ],
      asideHeading: 'Sample metrics',
      asideRows: [
        { label: 'Fictional pipeline', value: '€420k sample' },
        { label: 'Fictional win rate', value: '38% sample' },
        { label: 'Fictional avg. deal', value: '€24k sample' },
      ],
      asideCta: 'Open sample forecast',
      disclaimer:
        'Local interface over fictional records · no CRM, database, identity provider, live refresh, or production forecast · not a generation record',
      caption: {
        title: 'A sales-dashboard scenario grounded in local sample records',
        body: 'This local interface demonstrates a KPI row, opportunity table, and forecast panel without presenting the sample figures as business results.',
      },
      alt: 'Local sales dashboard interface with fictional opportunity values and explicitly labeled sample metrics.',
    },
    problem: {
      eyebrow: 'From spreadsheet sprawl to an inspectable dashboard',
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
      promptText: 'Build a dashboard for my sales, connected to my database, with charts and filters.',
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
      eyebrow: 'Sales metrics → Agent → filterable Webview',
      title: 'Inspect a sales dashboard generated inside E-Code',
      body: 'These dedicated captures show the dashboard request, the Agent exchange, generated chart and table files, and the resulting sales interface running in Webview with local sample data.',
      galleryLabel: 'Captured sales-dashboard generation and local filtering inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional sales figures and opportunities · filters operate on local sample data · no external database, production authentication, live refresh, or deployed access control is demonstrated',
      openFullSizeLabel: 'Open the sales-dashboard capture at full size',
      preview: {
        title: 'Charts and pipeline rows run beside their source',
        body: 'The first capture keeps the sales-leader prompt and Agent activity beside the generated components while Webview renders KPI cards, charts, filters, and pipeline rows from fictional local records.',
        alt: 'Real E-Code Dashboard Builder workspace showing a sales-dashboard prompt, Agent activity, generated chart files, and KPI cards with a pipeline table running in Webview.',
      },
      iteration: {
        title: 'The next prompt refines the data view in place',
        body: 'The follow-up capture shows the instruction beside the updated dashboard and its files. The visible filter state proves a local interface interaction over sample records; it does not prove that a database query or access policy ran.',
        alt: 'Real E-Code Dashboard Builder iteration showing a follow-up prompt, generated dashboard files, and an updated local sales filter state in Webview.',
      },
      cta: {
        label: 'Inspect the captured dashboard run',
        ariaLabel: 'Inspect the captured E-Code sales-dashboard generation and local filter state',
      },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A data-rich dashboard you can inspect and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. The charts, tables, filters, and access scaffolding are real code you extend to your own data — no hidden BI layer.',
      items: [
        {
          title: 'Reporting source you can audit and export',
          body: 'Chart components, table logic, filters, routes, and styles remain readable, versionable, and exportable instead of disappearing inside a BI layer.',
        },
        {
          title: 'An explicit data contract',
          body: 'Fields, sample records, query boundaries, and adapters stay visible in code. Replace the fictional pipeline data by wiring your database or API, and connect identity separately.',
        },
        {
          title: 'A responsive dashboard in active Preview',
          body: 'Open KPIs, pipeline rows, charts, and filters in the running Preview and inspect their behavior across desktop, tablet, and phone layouts.',
        },
        {
          title: 'A guided path for supported static releases',
          body: 'A dashboard frontend that qualifies as a supported static build can move through E-Code’s guided publishing flow after review.',
        },
        {
          title: 'An E-Code live URL or a server-ready export',
          body: 'Supported static dashboards receive an E-Code live URL after publishing. Projects that require server queries or protected APIs stay exportable for deployment with their runtime.',
        },
        {
          title: 'Add the next decision view through conversation',
          body: 'Keep talking to the Agent to add a KPI, segment, or drill-down, then compare the updated code with the dashboard still running in Preview.',
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
          title: 'Keep the code accessible',
          body: 'Export the project and connect your data while keeping the source and query code editable.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Dashboard foundations teams connect to each operational domain',
      intro:
        'From a sales pipeline to an ops control room, the loop produces a responsive data interface over local fixtures; production figures, refresh, identity, and permissions arrive through separately tested connections.',
      items: [
        {
          title: 'Sales and revenue dashboards',
          body: 'Pipeline, forecast, and win-rate views to wire to the team’s verified sales records.',
        },
        {
          title: 'Operations and KPI monitors',
          body: 'Status boards for delivery, support, and service metrics, ready to wire to operational data.',
        },
        {
          title: 'Finance and reporting views',
          body: 'Budget, spend, and cash-flow interfaces with local filters, ready for an approved finance-data connection.',
        },
        {
          title: 'Internal admin consoles',
          body: 'Role-aware table and metric interfaces whose authorization still requires enforced server-side checks.',
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
      proofLinkLabel: 'Inspect the Dashboard Builder workflow evidence',
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
      eyebrow: 'Générateur de tableau de bord prêt pour vos données',
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
      brandType: 'Tableau commercial d’exemple',
      nav: ['Vue d’ensemble', 'Pipeline', 'Équipe'],
      eyebrow: 'Trimestre d’exemple',
      title: 'Chaque affaire, indicateur et prévision dans une vue consolidée.',
      intro:
        'Un tableau de bord responsive qui présente les opportunités ouvertes, les indicateurs clés et un parcours de prévision dans une mise en page claire.',
      primaryHeading: 'Opportunités fictives',
      primaryRows: [
        { label: 'Northwind Traders', meta: '48 k€ fictifs · Négociation', status: 'Étape d’exemple' },
        { label: 'Atlas Logistics', meta: '32 k€ fictifs · Proposition' },
        { label: 'Beacon Retail Group', meta: '19 k€ fictifs · Découverte' },
      ],
      asideHeading: 'Indicateurs d’exemple',
      asideRows: [
        { label: 'Pipeline fictif', value: '420 k€ fictifs' },
        { label: 'Taux de gain fictif', value: '38 % fictifs' },
        { label: 'Affaire moy. fictive', value: '24 k€ fictifs' },
      ],
      asideCta: 'Ouvrir la prévision d’exemple',
      disclaimer:
        'Interface locale sur fiches fictives · aucun CRM, base, fournisseur d’identité, rafraîchissement live ni prévision de production · pas une trace de génération',
      caption: {
        title: 'Un scénario de tableau commercial fondé sur des fiches locales d’exemple',
        body: 'Cette interface locale présente une ligne d’indicateurs, un tableau d’opportunités et un panneau de prévision sans faire passer les chiffres fictifs pour des résultats.',
      },
      alt: 'Interface locale de tableau de bord commercial avec opportunités fictives et indicateurs explicitement marqués comme exemples.',
    },
    problem: {
      eyebrow: 'De la prolifération de tableurs à un tableau de bord inspectable',
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
      promptText: 'Un tableau de bord de mes ventes, connecté à ma base, avec graphiques et filtres.',
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
      eyebrow: 'Indicateurs de vente → Agent → Webview filtrable',
      title: 'Inspectez un tableau de bord commercial généré dans E-Code',
      body: 'Ces captures dédiées montrent la demande de tableau de bord, l’échange avec l’Agent, les fichiers de graphiques et tableaux générés et l’interface commerciale active dans la Webview avec des données locales d’exemple.',
      galleryLabel: 'Génération capturée du tableau de bord et filtrage local dans E-Code',
      disclaimer:
        'Génération E-Code capturée · chiffres et opportunités fictifs · filtres appliqués aux données locales d’exemple · aucune base externe, authentification de production, actualisation live ni contrôle d’accès déployé démontré',
      openFullSizeLabel: 'Ouvrir la capture du tableau de bord commercial en grand',
      preview: {
        title: 'Les graphiques et le pipeline tournent à côté de leur source',
        body: 'La première capture conserve le prompt du responsable commercial et l’activité de l’Agent auprès des composants générés pendant que la Webview affiche indicateurs, graphiques, filtres et opportunités à partir de fiches locales fictives.',
        alt: 'Vrai workspace Dashboard Builder E-Code montrant un prompt de tableau de bord commercial, l’activité de l’Agent, les fichiers de graphiques générés et les indicateurs avec pipeline dans la Webview.',
      },
      iteration: {
        title: 'Le prompt suivant affine la vue de données sur place',
        body: 'La capture de suivi montre l’instruction auprès du tableau de bord mis à jour et de ses fichiers. Le filtre visible prouve une interaction locale sur des fiches d’exemple ; il ne prouve ni requête vers une base ni exécution d’une règle d’accès.',
        alt: 'Vraie itération Dashboard Builder E-Code montrant un prompt de suivi, les fichiers générés et un filtre commercial local mis à jour dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run capturé du tableau de bord',
        ariaLabel: 'Inspecter la génération E-Code capturée du tableau de bord commercial et son filtre local',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un tableau de bord riche en données que vous inspectez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les graphiques, tableaux, filtres et l’échafaudage d’accès sont du vrai code que vous étendez à vos propres données — aucune couche de BI cachée.',
      items: [
        {
          title: 'Une source de reporting auditable et exportable',
          body: 'Les composants de graphiques, la logique des tableaux, les filtres, les routes et les styles restent lisibles, versionnables et exportables au lieu de disparaître dans une couche de BI.',
        },
        {
          title: 'Un contrat de données explicite',
          body: 'Les champs, les enregistrements d’exemple, les frontières de requêtes et les adaptateurs restent visibles dans le code. Remplacez le pipeline fictif en branchant votre base ou votre API, puis connectez l’identité séparément.',
        },
        {
          title: 'Un tableau de bord responsive dans l’aperçu actif',
          body: 'Ouvrez les indicateurs, les lignes du pipeline, les graphiques et les filtres dans l’aperçu en fonctionnement, puis inspectez leur comportement sur desktop, tablette et mobile.',
        },
        {
          title: 'Un parcours guidé pour les publications statiques compatibles',
          body: 'Un frontend de tableau de bord reconnu comme build statique pris en charge suit le parcours de publication guidée E-Code après vérification.',
        },
        {
          title: 'Une URL E-Code en ligne ou un export prêt pour le serveur',
          body: 'Les tableaux de bord statiques pris en charge reçoivent une URL E-Code après publication. Les projets avec requêtes serveur ou API protégées restent exportables pour être déployés avec leur runtime.',
        },
        {
          title: 'Ajoutez la prochaine vue de décision par la conversation',
          body: 'Continuez à parler à l’Agent pour ajouter un indicateur, un segment ou une exploration, puis comparez le code mis à jour au tableau de bord toujours actif dans l’aperçu.',
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
          title: 'Gardez le code accessible',
          body: 'Exportez le projet et connectez vos données en conservant la source et le code des requêtes modifiables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les bases de tableaux de bord que les équipes relient à chaque domaine opérationnel',
      intro:
        'D’un pipeline commercial à une salle de contrôle des opérations, la boucle produit une interface de données responsive sur fixtures locales ; chiffres de production, actualisation, identité et permissions passent par des connexions testées séparément.',
      items: [
        {
          title: 'Tableaux de bord commerciaux',
          body: 'Vues pipeline, prévision et taux de gain à brancher aux fiches commerciales vérifiées de l’équipe.',
        },
        {
          title: 'Moniteurs d’opérations et de KPI',
          body: 'Tableaux d’état pour la livraison, le support et les métriques de service, prêts à brancher aux données opérationnelles.',
        },
        {
          title: 'Vues finance et reporting',
          body: 'Interfaces budget, dépenses et trésorerie avec filtres locaux, prêtes pour une connexion approuvée aux données finance.',
        },
        {
          title: 'Consoles d’administration internes',
          body: 'Interfaces de tableaux et d’indicateurs selon les rôles, dont l’autorisation exige encore des contrôles serveur appliqués.',
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
      proofLinkLabel: 'Inspecter la preuve du workflow Générateur de tableau de bord',
      deliverablesLabel: 'Ce que livre le Générateur de tableau de bord',
      featuresLabel: 'Capacités du Générateur de tableau de bord',
      useCasesLabel: 'Cas d’usage du Générateur de tableau de bord',
      faqLabel: 'Questions sur le Générateur de tableau de bord',
      finalCtaLabel: 'Commencer à construire votre tableau de bord',
    },
  },
} as const satisfies SolutionCopyByLanguage;
