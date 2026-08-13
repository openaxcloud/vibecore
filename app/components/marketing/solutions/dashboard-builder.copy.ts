import type { CapturedSolutionCopyByLanguage } from './solution-copy';

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
        'Describe PipelineIQ. E-Code generates editable sales charts, pipeline stages, and working filters over fictional local data; no external database is connected.',
      ogImageAlt:
        'E-Code Dashboard Builder workspace with PipelineIQ files, sales charts, and local filters in Webview.',
    },
    hero: {
      eyebrow: 'Dashboard Builder ready for your data',
      title: 'Turn your sales numbers into a dashboard your team actually uses',
      subtitle:
        'Describe the revenue charts, pipeline stages, date and region filters, and deals table you need. E-Code generates PipelineIQ in editable source code, runs it against clearly labeled local sample data, and keeps the Agent, files, and Webview visible while you refine the dashboard.',
      primaryCta: { label: 'Describe your dashboard', ariaLabel: 'Describe your dashboard with E-Code' },
      secondaryCta: {
        label: 'See the dashboard workflow',
        ariaLabel: 'See how E-Code builds the dashboard from a prompt',
      },
      microcopy:
        'Start from the metrics you already track. Source files, the running Preview, and the chart and filter components stay visible as the dashboard evolves.',
    },
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
        'E-Code starts from the KPIs and sales views you describe and produces a dashboard in real source files. You inspect the components, run the local dataset in Preview, and ask the Agent to change the filters or variance view without leaving the project.',
    },
    build: {
      eyebrow: 'One prompt starts the dashboard',
      title: 'Describe the metrics, not the charting library',
      intro:
        'The request below reads like a note from a sales leader. The four items map its implementation scope in real source files, not a locked BI template.',
      label: 'Sales dashboard brief',
      promptText: 'Build a dashboard for my sales, connected to my database, with charts and filters.',
      outputs: [
        {
          title: 'Revenue KPIs and charts',
          body: 'PipelineIQ renders revenue indicators and charts from clearly labeled fictional local records in editable React and TypeScript components.',
        },
        {
          title: 'Pipeline stages and deals table',
          body: 'Pipeline stages and the deals table stay visible beside the charts, with sample opportunities that never pass as real company records.',
        },
        {
          title: 'Working date and region controls',
          body: 'Date and region selections feed an Apply filters action that updates every displayed KPI and chart from the local sample dataset.',
        },
        {
          title: 'Visible confirmation and target variance',
          body: 'The interaction shows “Filters applied” and a target-variance table in the real Webview. No external database query, authentication flow, or live refresh runs behind it.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Sales metrics → Agent → filterable Webview',
      title: 'Inspect a sales dashboard generated inside E-Code',
      body: 'These dedicated captures show the PipelineIQ request, the Agent exchange, generated chart and table source, then the sales interface and its local filter state running in Webview.',
      galleryLabel: 'Captured sales-dashboard generation and local filtering inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional sales figures and opportunities · filters operate on local sample data · no external database, production authentication, live refresh, or deployed access control is demonstrated',
      openFullSizeLabel: 'Open the sales-dashboard capture at full size',
      preview: {
        title: 'PipelineIQ runs beside its generated source',
        body: 'The first capture keeps the sales-dashboard prompt and Agent activity beside the generated files while Webview renders PipelineIQ’s revenue KPIs, charts, pipeline stages, date and region controls, and deals table from fictional local records.',
        alt: 'Real E-Code Dashboard Builder workspace showing the PipelineIQ prompt, Agent activity, generated React files, and revenue charts with local date and region filters in Webview.',
      },
      iteration: {
        title: 'A verified Apply filters click updates the local dashboard',
        body: 'After the single generation, a verified click on “Apply filters” shows “Filters applied” and a target-variance table. The capture does not prove an external database query, live refresh, or access policy.',
        alt: 'E-Code Dashboard Builder capture after the verified Apply filters click, with PipelineIQ files and Filters applied in Webview.',
      },
      cta: {
        label: 'Inspect the captured dashboard run',
        ariaLabel: 'Inspect the captured E-Code sales-dashboard generation and local filter state',
      },
    },
    proofVisualAlts: {
      prompt:
        'E-Code Agent prompt requesting PipelineIQ with sales KPIs, pipeline stages, and date and region filters.',
      preview: 'E-Code workspace with generated PipelineIQ files and sales charts open in Webview.',
      webviewOverview: 'PipelineIQ in Webview with fictional KPIs, charts, deals, and local date and region filters.',
      iteration:
        'E-Code workspace after the verified Apply filters click, with PipelineIQ files and Filters applied in Webview.',
      webviewIteration:
        'PipelineIQ showing Filters applied and a target-variance table after the verified filter action.',
      files: 'E-Code file tree for PipelineIQ with editable chart, filter, KPI, and deals-table source.',
    },
    deliverables: {
      eyebrow: 'What PipelineIQ includes',
      title: 'A data-rich dashboard you can inspect and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. PipelineIQ’s charts, deals table, date and region filters, and target variance are real code over local fixtures — no hidden BI layer or connected database.',
      items: [
        {
          title: 'Reporting source you can audit and export',
          body: 'Chart components, deals-table logic, filters, local sample records, and styles remain readable, versionable, and exportable instead of disappearing inside a BI layer.',
        },
        {
          title: 'An explicit data contract',
          body: 'The fictional sales records and the components that consume them stay visible in the source. Replace that local dataset only after wiring and testing your own database or API.',
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
      intro:
        'The Dashboard Builder path keeps PipelineIQ’s local dataset, revenue views, filters, and generated source in one inspectable workflow.',
      items: [
        {
          title: 'KPIs and charts',
          body: 'Revenue tiles, charts, and trend indicators presented as editable components over fictional local records.',
        },
        {
          title: 'Filters and segments',
          body: 'Working date and region controls that update every visible KPI and chart together from local sample records.',
        },
        {
          title: 'Pipeline and record tables',
          body: 'Pipeline stages, fictional deals, and a target-variance table presented as editable components.',
        },
        {
          title: 'Verified filter feedback',
          body: 'The Apply filters action changes the rendered state and displays “Filters applied” inside Webview.',
        },
        {
          title: 'Responsive revenue views',
          body: 'KPI cards, pipeline stages, charts, filters, and deal rows reorganize for a wall display, laptop review, or phone check-in.',
        },
        {
          title: 'Local-data boundary in view',
          body: 'The interface states that its figures come from a local sample dataset and never presents them as live sales results.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Dashboard patterns to build',
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
          title: 'Deal-review workspaces',
          body: 'Sales tables, regional filters, and target variance for teams that later connect their verified pipeline records.',
        },
      ],
    },
    faq: {
      eyebrow: 'Sales-dashboard questions',
      title: 'Dashboard Builder, answered honestly',
      intro: 'What the Dashboard Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked BI tool?',
          body: 'You get editable source files — KPI components, charts, filters, tables, local records, and styles — that you can read, version, and export. There is no proprietary dashboard lock-in.',
        },
        {
          title: 'Is the dashboard connected to my data?',
          body: 'No. The inline demonstration on this page uses fictional data and no connected backend. Connecting a real data source is code you extend, wired to your own database or API.',
        },
        {
          title: 'Does it include authentication and team access?',
          body: 'No authentication or role enforcement is demonstrated in PipelineIQ. Add identity and server-side authorization to the exported project, then test those controls against your real access rules.',
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
      body: 'Turn your revenue KPIs, pipeline stages, deals, and regional filters into editable source, then verify the local-data flow in Webview before connecting any production system.',
      primaryCta: { label: 'Describe your dashboard', ariaLabel: 'Describe your dashboard with E-Code' },
      secondaryCta: {
        label: 'See the dashboard workflow',
        ariaLabel: 'See how E-Code builds the dashboard from a prompt',
      },
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
      title: 'Générateur de tableau de bord avec un code source modifiable | E-Code',
      description:
        'Décrivez PipelineIQ. E-Code génère des graphiques de vente, des étapes de pipeline et des filtres actifs sur des données locales fictives ; aucune base externe n’est connectée.',
      ogImageAlt:
        'Workspace E-Code Dashboard Builder avec fichiers PipelineIQ, graphiques de vente et filtres locaux dans la Webview.',
    },
    hero: {
      eyebrow: 'Générateur de tableau de bord prêt pour vos données',
      title: 'Transformez vos chiffres commerciaux en un tableau de bord que votre équipe utilise vraiment',
      subtitle:
        'Décrivez les graphiques de chiffre d’affaires, les étapes du pipeline, les filtres de date et de région, et le tableau des affaires. E-Code génère PipelineIQ dans un code source modifiable, l’exécute sur un jeu de données local clairement signalé et garde l’Agent, les fichiers et la Webview visibles pendant vos ajustements.',
      primaryCta: { label: 'Décrivez votre tableau de bord', ariaLabel: 'Décrivez votre tableau de bord avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours du tableau de bord',
        ariaLabel: 'Voir comment E-Code construit le tableau de bord à partir d’un prompt',
      },
      microcopy:
        'Partez des indicateurs que vous suivez déjà. Les fichiers source, l’aperçu actif et les composants de graphiques et de filtres restent visibles à mesure que le tableau de bord évolue.',
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
        'Interface locale sur fiches fictives · aucun CRM, base, fournisseur d’identité, rafraîchissement en temps réel ni prévision de production · pas une trace de génération',
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
        'E-Code part des indicateurs et vues commerciales décrits et produit un tableau de bord dans de vrais fichiers source. Vous inspectez les composants, exécutez le jeu local dans l’aperçu et demandez à l’Agent de modifier les filtres ou les écarts sans quitter le projet.',
    },
    build: {
      eyebrow: 'Un prompt lance le tableau de bord',
      title: 'Décrivez les indicateurs, pas la librairie de graphiques',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable commercial. Les quatre éléments en précisent le périmètre d’implémentation dans de vrais fichiers source, pas un template de BI verrouillé.',
      label: 'Brief du tableau de bord commercial',
      promptText: 'Un tableau de bord de mes ventes, connecté à ma base, avec graphiques et filtres.',
      outputs: [
        {
          title: 'Indicateurs et graphiques de chiffre d’affaires',
          body: 'PipelineIQ affiche ses indicateurs et graphiques depuis des fiches locales fictives clairement signalées, dans des composants React et TypeScript modifiables.',
        },
        {
          title: 'Étapes du pipeline et tableau des affaires',
          body: 'Les étapes et les affaires restent visibles à côté des graphiques, avec des opportunités d’exemple qui ne passent jamais pour des fiches d’entreprises réelles.',
        },
        {
          title: 'Contrôles de date et région fonctionnels',
          body: 'Les sélections de date et région alimentent l’action « Appliquer les filtres », qui met à jour chaque indicateur et graphique depuis le jeu local.',
        },
        {
          title: 'Confirmation visible et écarts aux objectifs',
          body: 'L’interaction affiche « Filtres appliqués » et un tableau des écarts aux objectifs dans la vraie Webview. Aucune requête externe, authentification ni actualisation en temps réel n’est exécutée en arrière-plan.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Indicateurs de vente → Agent → Webview filtrable',
      title: 'Inspectez un tableau de bord commercial généré dans E-Code',
      body: 'Ces captures dédiées montrent la demande PipelineIQ, l’échange avec l’Agent, les fichiers de graphiques et tableaux générés, puis l’interface commerciale et son filtre local actifs dans la Webview.',
      galleryLabel: 'Génération capturée du tableau de bord et filtrage local dans E-Code',
      disclaimer:
        'Génération E-Code capturée · chiffres et opportunités fictifs · filtres appliqués aux données locales d’exemple · aucune base externe, authentification de production, actualisation en temps réel ni contrôle d’accès déployé démontré',
      openFullSizeLabel: 'Ouvrir la capture du tableau de bord commercial en grand',
      preview: {
        title: 'PipelineIQ tourne à côté de sa source générée',
        body: 'La première capture conserve le prompt et l’activité de l’Agent à côté des fichiers générés pendant que la Webview affiche les indicateurs de chiffre d’affaires, graphiques, étapes du pipeline, contrôles de date et région, et affaires fictives de PipelineIQ.',
        alt: 'Vrai workspace Dashboard Builder E-Code montrant le prompt PipelineIQ, l’activité de l’Agent, les fichiers React générés et les graphiques de chiffre d’affaires avec filtres locaux de date et région dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur Appliquer les filtres actualise le tableau local',
        body: 'Après la génération unique, un clic vérifié sur « Appliquer les filtres » affiche « Filtres appliqués » et un tableau des écarts. La capture ne prouve ni requête externe, ni actualisation en temps réel, ni règle d’accès.',
        alt: 'Capture E-Code Dashboard Builder après le clic vérifié sur Appliquer les filtres, avec PipelineIQ et Filtres appliqués dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution capturée du tableau de bord',
        ariaLabel: 'Inspecter la génération E-Code capturée du tableau de bord commercial et son filtre local',
      },
    },
    proofVisualAlts: {
      prompt: 'Prompt de l’Agent E-Code demandant PipelineIQ avec KPI, pipeline et filtres de date et de région.',
      preview: 'Workspace E-Code avec fichiers PipelineIQ générés et graphiques commerciaux ouverts dans la Webview.',
      webviewOverview: 'PipelineIQ dans la Webview avec KPI, graphiques et affaires fictifs, plus des filtres locaux.',
      iteration: 'Workspace E-Code après le clic vérifié sur Appliquer les filtres, avec l’état Filtres appliqués.',
      webviewIteration:
        'PipelineIQ affichant Filtres appliqués et le tableau des écarts après l’action de filtrage vérifiée.',
      files: 'Arborescence E-Code de PipelineIQ avec sources modifiables des KPI, graphiques, filtres et affaires.',
    },
    deliverables: {
      eyebrow: 'Ce que comprend PipelineIQ',
      title: 'Un tableau de bord riche en données que vous inspectez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les graphiques, affaires, filtres de date et de région, et écarts de PipelineIQ sont du code source modifiable alimenté par des données de test locales — aucune couche BI cachée ni base connectée.',
      items: [
        {
          title: 'Une source de reporting auditable et exportable',
          body: 'Les composants de graphiques, la logique du tableau des affaires, les filtres, les fiches locales et les styles restent lisibles, versionnables et exportables au lieu de disparaître dans une couche de BI.',
        },
        {
          title: 'Un contrat de données explicite',
          body: 'Les fiches commerciales fictives et les composants qui les consomment restent visibles dans la source. Remplacez ce jeu local seulement après avoir branché et testé votre propre base ou API.',
        },
        {
          title: 'Un tableau de bord responsive dans l’aperçu actif',
          body: 'Ouvrez les indicateurs, les lignes du pipeline, les graphiques et les filtres dans l’aperçu en fonctionnement, puis inspectez leur comportement sur ordinateur, tablette et mobile.',
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
        'Le parcours Générateur de tableau de bord garde le jeu local, les vues commerciales, les filtres et la source générée de PipelineIQ dans un seul flux inspectable.',
      items: [
        {
          title: 'Indicateurs et graphiques',
          body: 'Tuiles de chiffre d’affaires, graphiques et indicateurs de tendance sous forme de composants modifiables sur des fiches locales fictives.',
        },
        {
          title: 'Filtres et segments',
          body: 'Contrôles de date et région qui mettent à jour ensemble chaque indicateur et graphique visible depuis les fiches locales.',
        },
        {
          title: 'Tableaux de pipeline et d’enregistrements',
          body: 'Étapes du pipeline, affaires fictives et tableau des écarts aux objectifs sous forme de composants modifiables.',
        },
        {
          title: 'Retour de filtre vérifié',
          body: 'L’action « Appliquer les filtres » change l’état affiché et présente « Filtres appliqués » dans la Webview.',
        },
        {
          title: 'Vues commerciales responsives',
          body: 'Cartes KPI, étapes du pipeline, graphiques, filtres et lignes d’affaires se réorganisent pour un écran mural, une revue sur ordinateur portable ou un contrôle mobile.',
        },
        {
          title: 'Limite des données locales visible',
          body: 'L’interface indique que ses chiffres viennent d’un jeu local et ne les présente jamais comme des résultats commerciaux actifs.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Modèles de tableaux de bord à construire',
      title: 'Les bases de tableaux de bord que les équipes relient à chaque domaine opérationnel',
      intro:
        'D’un pipeline commercial à une salle de contrôle des opérations, la boucle produit une interface de données responsive alimentée par des données de test locales ; chiffres de production, actualisation, identité et permissions passent par des connexions testées séparément.',
      items: [
        {
          title: 'Tableaux de bord commerciaux',
          body: 'Vues pipeline, prévision et taux de gain à brancher aux fiches commerciales vérifiées de l’équipe.',
        },
        {
          title: 'Moniteurs d’opérations et de KPI',
          body: 'Tableaux d’état pour la livraison, l’assistance et les métriques de service, prêts à brancher aux données opérationnelles.',
        },
        {
          title: 'Vues finance et reporting',
          body: 'Interfaces de budget, de dépenses et de trésorerie avec filtres locaux, prêtes pour une connexion approuvée aux données financières.',
        },
        {
          title: 'Espaces de revue des affaires',
          body: 'Tableaux commerciaux, filtres régionaux et écarts aux objectifs à relier ensuite aux fiches de pipeline vérifiées de l’équipe.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions sur le tableau de bord commercial',
      title: 'Le Générateur de tableau de bord, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de tableau de bord, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens un code source modifiable ou un outil de BI verrouillé ?',
          body: 'Vous obtenez des fichiers source modifiables — composants d’indicateurs, graphiques, filtres, tableaux, fiches locales et styles — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire de tableau de bord.',
        },
        {
          title: 'Le tableau de bord est-il connecté à mes données ?',
          body: 'Non. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté. La connexion à une source réelle passe par du code que vous étendez et branchez à votre base ou API.',
        },
        {
          title: 'Inclut-il l’authentification et l’accès de l’équipe ?',
          body: 'PipelineIQ ne démontre aucune authentification ni règle de rôle. Ajoutez l’identité et l’autorisation serveur au projet exporté, puis testez ces contrôles avec vos vraies règles d’accès.',
        },
        {
          title: 'Le tableau de bord est-il responsive ?',
          body: 'Oui. Les mises en page sont générées pour s’adapter aux ordinateurs, tablettes et mobiles, et vous les vérifiez dans l’aperçu à chaque taille.',
        },
        {
          title: 'Comment modifier le tableau de bord ensuite ?',
          body: 'Modifiez les fichiers directement ou demandez l’indicateur, le tableau ou le filtre suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre tableau de bord et voyez-le tourner',
      body: 'Transformez vos indicateurs de chiffre d’affaires, étapes du pipeline, affaires et filtres régionaux en une source modifiable, puis vérifiez le parcours local dans la Webview avant toute connexion de production.',
      primaryCta: { label: 'Décrivez votre tableau de bord', ariaLabel: 'Décrivez votre tableau de bord avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours du tableau de bord',
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
      proofLinkLabel: 'Inspecter la preuve du processus du Générateur de tableau de bord',
      deliverablesLabel: 'Ce que livre le Générateur de tableau de bord',
      featuresLabel: 'Capacités du Générateur de tableau de bord',
      useCasesLabel: 'Cas d’usage du Générateur de tableau de bord',
      faqLabel: 'Questions sur le Générateur de tableau de bord',
      finalCtaLabel: 'Commencer à construire votre tableau de bord',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
