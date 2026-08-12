import type { CapturedSolutionCopyByLanguage } from './solution-copy';

/**
 * SOL-02 — Website Builder. Dedicated architecture-studio story in EN and FR.
 * All studio content is fictional and labeled; proof claims stop at the captured
 * Agent exchange, generated files, Webview, and local form behavior.
 */
export const WEBSITE_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Website Builder with Real Code | E-Code',
      description:
        'Describe your architecture studio site. E-Code generates editable source and a running Preview; contact delivery, CMS data, and production setup stay separate.',
      ogImageAlt:
        'E-Code Website Builder workspace with Meridian Studio files and its architecture portfolio in Webview.',
    },
    hero: {
      eyebrow: 'Website Builder for real content sites',
      title: 'Turn your studio and its work into a site you can inspect and shape',
      subtitle:
        'Describe the pages, the story, and the work you want to show. E-Code turns that into a responsive marketing site in editable source code. Inspect every file, run the site in Preview, refine it through the Agent, and publish supported static builds to a live URL.',
      primaryCta: { label: 'Describe your site', ariaLabel: 'Describe your website with E-Code' },
      secondaryCta: { label: 'See the site workflow', ariaLabel: 'See how E-Code builds the website from a prompt' },
      microcopy:
        'Start from the pages you already have in mind. Source files, the running Preview, and publishing controls stay visible as the site evolves.',
    },
    languageSwitch: { label: 'Choose the Website Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Meridian Studio',
      brandType: 'Fictional architecture practice',
      nav: ['Projects', 'Studio', 'Contact'],
      eyebrow: 'Sample selected work',
      title: 'Buildings shaped by light, place, and material.',
      intro:
        'A responsive portfolio site that presents projects, the studio, and an enquiry path in one clear journey.',
      primaryHeading: 'Fictional project entries',
      primaryRows: [
        { label: 'Coastal House, Biarritz', meta: 'Residential · 2025', status: 'Featured' },
        { label: 'Riverside Pavilion', meta: 'Public · 2024' },
        { label: 'Atelier Extension', meta: 'Renovation · 2024' },
      ],
      asideHeading: 'Sample enquiry',
      asideRows: [
        { label: 'Project type', value: 'New build' },
        { label: 'Location', value: 'Nouvelle-Aquitaine' },
        { label: 'Timeline', value: 'Q3 2026' },
      ],
      asideCta: 'Preview enquiry form',
      disclaimer:
        'Scripted local interface · fictional studio, projects, dates, and enquiry · no submitted request or external service · not a generation record',
      caption: {
        title: 'A local architecture-site scenario with clearly fictional content',
        body: 'This scripted interface demonstrates a portfolio grid, studio profile entry, and local enquiry-form state in one responsive layout.',
      },
      alt: 'Scripted local architecture website interface with fictional project entries and a sample enquiry panel.',
    },
    problem: {
      eyebrow: 'From template lock-in to source you control',
      title: 'Site builders look easy until the content and the brand fight the template',
      intro:
        'A studio needs a site that shows its work exactly the way it wants. Template builders start fast, then constrain layout, typography, and structure, and the exported result rarely maps to code the team can keep evolving.',
      obstacles: [
        {
          title: 'Templates constrain the story',
          body: 'Fixed sections and rigid grids force the work into a layout it was never designed for, and custom structure means fighting the builder at every step.',
        },
        {
          title: 'Content and code drift apart',
          body: 'Marketing tools hold the copy, a separate export holds the markup, and there is no single source the team can inspect, version, and change with confidence.',
        },
        {
          title: 'Hand-off leaves you dependent',
          body: 'When a freelancer or agency ships the site, the smallest change waits on someone else, and the underlying code is often unavailable to inspect or export.',
        },
      ],
      bridge:
        'E-Code starts from the pages you describe and produces a responsive site in real source files. You inspect the markup, run it in Preview, and request the next change without leaving the code behind.',
    },
    build: {
      eyebrow: 'One prompt starts the site',
      title: 'Describe the pages, not the framework',
      intro:
        'The request below reads like a note from a studio owner. The four items map its implementation scope in real source files, not a locked template.',
      label: 'Architecture studio brief',
      promptText: 'Build a showcase website for my architecture firm, with a portfolio, contact page, and blog.',
      outputs: [
        {
          title: 'Five responsive views',
          body: 'Home, Projects, Studio, Journal, and Contact render from editable React and TypeScript source, with navigation that opens each view inside Webview.',
        },
        {
          title: 'A portfolio visitors explore',
          body: 'The Projects view opens as “Selected work”, with local project filters and detail links over realistic fictional studio content.',
        },
        {
          title: 'An honest local contact flow',
          body: 'The contact form returns a local confirmation in the browser. It never presents that state as an email or submitted enquiry.',
        },
        {
          title: 'Studio brief, generated files, and Webview together',
          body: 'E-Code keeps the brief and Agent exchange beside the generated files while the architecture site runs in the real Webview tab.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Architecture brief → Agent → Webview',
      title: 'Watch an architecture portfolio become a running site',
      body: 'These dedicated E-Code captures keep the architecture-studio prompt, the Agent exchange, the generated React and TypeScript files, and the site running in Webview inside one workspace.',
      galleryLabel: 'Captured architecture-portfolio generation inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional studio copy and local sample content · the contact form confirms locally only · no email delivery, CMS, external database, or production deployment is demonstrated',
      openFullSizeLabel: 'Open the architecture-site capture at full size',
      preview: {
        title: 'The architecture homepage runs beside its source files',
        body: 'The first capture shows the original studio brief and Agent work beside the generated project tree and the responsive portfolio homepage running in E-Code Webview.',
        alt: 'Real E-Code workspace showing an architecture-studio website prompt, Agent activity, generated React files, and the portfolio homepage running in Webview.',
      },
      iteration: {
        title: 'A verified Projects click opens the explorable portfolio view',
        body: 'After the single generation, a verified click on “Projects” opens “Selected work” with local filters and project detail links. The capture does not demonstrate a CMS, database, or deployed contact service.',
        alt: 'E-Code Website Builder capture after the verified Projects click, with Meridian Studio files and Selected work open in Webview.',
      },
      cta: {
        label: 'Inspect the architecture-site run',
        ariaLabel: 'Inspect the captured E-Code architecture-site generation',
      },
    },
    proofVisualAlts: {
      prompt: 'E-Code Agent prompt requesting the Meridian Studio architecture portfolio, contact page, and journal.',
      preview:
        'E-Code workspace with generated React files and the Meridian Studio portfolio homepage open in Webview.',
      webviewOverview: 'Meridian Studio portfolio in Webview with fictional projects and a sample enquiry panel.',
      iteration:
        'E-Code workspace after the verified Projects click, with Meridian Studio files and Selected work in Webview.',
      webviewIteration: 'Meridian Studio Selected work view opened by the verified Projects navigation interaction.',
      files: 'E-Code file tree for Meridian Studio with editable portfolio components and journal routes.',
    },
    deliverables: {
      eyebrow: 'What your architecture site includes',
      title: 'A responsive site you can inspect, export, and keep evolving',
      intro:
        'Meridian Studio stays inspectable from its portfolio components and journal routes through Preview and export. Supported static sites add a guided live release without hiding the editorial source.',
      items: [
        {
          title: 'Website source you can inspect',
          body: 'The generated views, navigation, components, styles, and page content remain readable, versionable, and exportable as a complete project.',
        },
        {
          title: 'Visible content and local form state',
          body: 'Project entries, studio details, filters, and the local contact confirmation live in the code. A real CMS, database, or submission service requires a separate connection that this capture does not show.',
        },
        {
          title: 'A responsive site running in Preview',
          body: 'Open the portfolio and contact journey in the active Preview, then inspect its desktop, tablet, and phone layouts while you refine the site.',
        },
        {
          title: 'Guided release for supported static sites',
          body: 'When the website matches a supported static build, E-Code takes it through the guided publishing flow without hiding the source.',
        },
        {
          title: 'An E-Code URL or an exportable server project',
          body: 'A supported static site receives a live E-Code URL after publishing. If the project needs a server runtime, export the source and deploy it with your chosen host.',
        },
        {
          title: 'Keep briefing the Agent',
          body: 'Continue the conversation to add a case study, reshape the navigation, or revise a form, then review the change against the running site.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for real content sites',
      title: 'Everything a studio site needs, in code you control',
      intro: 'The Website Builder path keeps design intent, content, and publishing in one inspectable workflow.',
      items: [
        {
          title: 'Portfolio and case studies',
          body: 'Present projects with images, detail pages, and structured metadata.',
        },
        {
          title: 'Content you can edit',
          body: 'Copy and media live in editable files, not a locked builder database.',
        },
        {
          title: 'Forms and enquiries',
          body: 'A contact interface with a local confirmation that stays explicitly separate from email or form delivery.',
        },
        { title: 'SEO and social metadata', body: 'Titles, descriptions, and Open Graph tags generated per page.' },
        {
          title: 'Responsive portfolio layouts',
          body: 'Project grids, case-study pages, journal entries, and the contact layout reflow from studio desktop to a client’s phone.',
        },
        {
          title: 'Keep the editorial source open',
          body: 'Export the project or publish supported static builds while retaining editable source files.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Sites to shape from a brief',
      title: 'Website foundations teams shape for distinct content needs',
      intro:
        'From a studio portfolio to a product launch page, the same loop produces responsive source and a running site; content services, submissions, and release checks stay explicit.',
      items: [
        { title: 'Studio and portfolio sites', body: 'Architects, designers, and agencies presenting selected work.' },
        {
          title: 'Company and marketing sites',
          body: 'Multi-page sites with a clear story, services, and contact paths.',
        },
        {
          title: 'Launch and campaign pages',
          body: 'Focused pages with a validated form interface, a delivery-service hook, and social metadata ready to review.',
        },
        { title: 'Docs and content surfaces', body: 'Readable, structured content sites that stay easy to update.' },
      ],
    },
    faq: {
      eyebrow: 'Architecture-site questions',
      title: 'Website Builder, answered honestly',
      intro: 'What the Website Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked template?',
          body: 'You get editable source files — views, navigation, components, styles, and content — that you can read, version, and export. There is no proprietary template lock-in.',
        },
        {
          title: 'Is the site responsive?',
          body: 'Yes. Layouts are generated to adapt across desktop, tablet, and mobile, and you verify them in Preview at each size before publishing.',
        },
        {
          title: 'Can I publish to a live URL?',
          body: 'Supported static builds publish to a live URL through guided publishing. Other projects remain exportable for your own hosting workflow.',
        },
        {
          title: 'Can I connect a CMS or database?',
          body: 'The generated content model is code you can extend and wire to external services. The inline demonstration on this page uses fictional data and no connected backend.',
        },
        {
          title: 'How do I change the site later?',
          body: 'Edit the studio files directly or ask the Agent for another project, journal entry, or contact-state change, then compare the diff with the running site.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your site and see it running',
      body: 'Turn the pages you have in mind into a responsive site in real source code, run it in Preview, and publish supported static builds.',
      primaryCta: { label: 'Describe your site', ariaLabel: 'Describe your website with E-Code' },
      secondaryCta: { label: 'See the site workflow', ariaLabel: 'See how E-Code builds the site from a prompt' },
    },
    aria: {
      pageLabel: 'Website Builder solution page',
      heroLabel: 'Website Builder introduction',
      demoLabel: 'Website Builder product demonstration',
      problemLabel: 'The website building problem',
      buildLabel: 'How the Website Builder works',
      outputListLabel: 'Website build outputs',
      proofLinkLabel: 'Inspect the Website Builder workflow evidence',
      deliverablesLabel: 'What the Website Builder delivers',
      featuresLabel: 'Website Builder capabilities',
      useCasesLabel: 'Website Builder use cases',
      faqLabel: 'Website Builder questions',
      finalCtaLabel: 'Start building your site',
    },
  },
  fr: {
    seo: {
      title: 'Générateur de site web avec un code source modifiable | E-Code',
      description:
        'Décrivez le site de votre cabinet d’architecture. E-Code génère le code modifiable et l’aperçu actif ; contact, CMS et mise en production restent séparés.',
      ogImageAlt:
        'Workspace E-Code Website Builder avec fichiers Meridian Studio et portfolio d’architecture dans la Webview.',
    },
    hero: {
      eyebrow: 'Générateur de site pour de vrais sites de contenu',
      title: 'Transformez votre studio et son travail en un site que vous inspectez et façonnez',
      subtitle:
        'Décrivez les pages, le récit et le travail à montrer. E-Code en fait un site vitrine responsive sous forme de code source modifiable. Inspectez chaque fichier, exécutez le site dans l’aperçu, affinez-le avec l’Agent et publiez les builds statiques pris en charge vers une URL en ligne.',
      primaryCta: { label: 'Décrivez votre site', ariaLabel: 'Décrivez votre site web avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours du site',
        ariaLabel: 'Voir comment E-Code construit le site à partir d’un prompt',
      },
      microcopy:
        'Partez des pages que vous avez déjà en tête. Les fichiers source, l’aperçu actif et les contrôles de publication restent visibles à mesure que le site évolue.',
    },
    languageSwitch: {
      label: 'Choisir la langue de la page Générateur de site',
      english: 'English',
      french: 'Français',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'Meridian Studio',
      brandType: 'Agence d’architecture fictive',
      nav: ['Projets', 'Studio', 'Contact'],
      eyebrow: 'Sélection d’exemple',
      title: 'Des bâtiments façonnés par la lumière, le lieu et la matière.',
      intro: 'Un site portfolio responsive qui présente les projets, le studio et un parcours de contact clair.',
      primaryHeading: 'Fiches projet fictives',
      primaryRows: [
        { label: 'Maison littorale, Biarritz', meta: 'Résidentiel · 2025', status: 'À la une' },
        { label: 'Pavillon des berges', meta: 'Public · 2024' },
        { label: 'Extension d’atelier', meta: 'Rénovation · 2024' },
      ],
      asideHeading: 'Demande d’exemple',
      asideRows: [
        { label: 'Type de projet', value: 'Construction neuve' },
        { label: 'Lieu', value: 'Nouvelle-Aquitaine' },
        { label: 'Échéance', value: 'T3 2026' },
      ],
      asideCta: 'Prévisualiser le formulaire',
      disclaimer:
        'Interface locale scénarisée · studio, projets, dates et demande fictifs · aucun formulaire envoyé ni service externe · pas une trace de génération',
      caption: {
        title: 'Un scénario local de site d’architecture au contenu clairement fictif',
        body: 'Cette interface scénarisée présente une grille de projets, un profil de studio et l’état local d’un formulaire de contact dans une mise en page responsive.',
      },
      alt: 'Interface locale scénarisée de site d’architecture avec des projets fictifs et un panneau de demande d’exemple.',
    },
    problem: {
      eyebrow: 'Du carcan des templates à une source que vous maîtrisez',
      title: 'Les créateurs de site paraissent simples jusqu’à ce que le contenu et la marque se heurtent au template',
      intro:
        'Un studio a besoin d’un site qui montre son travail exactement comme il le souhaite. Les créateurs de sites démarrent vite, puis contraignent la mise en page, la typographie et la structure, et l’export correspond rarement à un code que l’équipe peut faire évoluer.',
      obstacles: [
        {
          title: 'Les templates contraignent le récit',
          body: 'Des sections figées et des grilles rigides forcent le travail dans une mise en page qui n’a pas été pensée pour lui, et toute structure sur mesure revient à lutter contre l’outil.',
        },
        {
          title: 'Contenu et code se désynchronisent',
          body: 'Les outils marketing gardent la copie, un export séparé garde le balisage, et aucune source unique n’est inspectable, versionnable et modifiable en confiance.',
        },
        {
          title: 'La livraison vous rend dépendant',
          body: 'Quand un freelance ou une agence livre le site, le moindre changement attend quelqu’un d’autre, et le code sous-jacent reste souvent impossible à inspecter ou à exporter.',
        },
      ],
      bridge:
        'E-Code part des pages que vous décrivez et produit un site responsive dans de vrais fichiers source. Vous inspectez le balisage, l’exécutez dans l’aperçu et demandez le changement suivant sans abandonner le code.',
    },
    build: {
      eyebrow: 'Un prompt lance le site',
      title: 'Décrivez les pages, pas le framework',
      intro:
        'La demande ci-dessous se lit comme un mot d’un propriétaire de studio. Les quatre éléments en précisent le périmètre d’implémentation dans de vrais fichiers source, pas un template verrouillé.',
      label: 'Brief du cabinet d’architecture',
      promptText: 'Créez un site vitrine pour mon cabinet d’architecte, avec portfolio, contact et blog.',
      outputs: [
        {
          title: 'Cinq vues responsives',
          body: 'Accueil, Projets, Studio, Journal et Contact s’affichent depuis une source React et TypeScript modifiable, avec une navigation qui ouvre chaque vue dans la Webview.',
        },
        {
          title: 'Un portfolio à parcourir',
          body: 'La vue Projets s’ouvre sous le titre « Projets sélectionnés », avec des filtres locaux et des liens de fiches sur un contenu de studio fictif réaliste.',
        },
        {
          title: 'Un parcours de contact local explicite',
          body: 'Le formulaire affiche une confirmation locale dans le navigateur. Il ne présente jamais cet état comme un email ni comme une demande réellement envoyée.',
        },
        {
          title: 'Brief du studio, fichiers générés et Webview réunis',
          body: 'E-Code garde le brief et l’échange avec l’Agent à côté des fichiers générés pendant que le site d’architecture tourne dans la vraie Webview.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Brief d’architecture → Agent → Webview',
      title: 'Regardez un portfolio d’architecture devenir un site actif',
      body: 'Ces captures E-Code dédiées réunissent dans un même workspace le prompt du cabinet d’architecture, l’échange avec l’Agent, les fichiers React et TypeScript générés et le site actif dans la Webview.',
      galleryLabel: 'Génération capturée du portfolio d’architecture dans E-Code',
      disclaimer:
        'Génération E-Code capturée · textes du studio et contenu local fictifs · le formulaire confirme uniquement dans l’interface locale · aucun envoi d’email, CMS, base externe ni déploiement de production démontré',
      openFullSizeLabel: 'Ouvrir la capture du site d’architecture en grand',
      preview: {
        title: 'La page d’accueil du cabinet tourne à côté de ses fichiers source',
        body: 'La première capture montre le brief initial et le travail de l’Agent à côté de l’arborescence générée et de la page d’accueil responsive active dans la Webview E-Code.',
        alt: 'Vrai workspace E-Code montrant le prompt d’un site de cabinet d’architecture, l’activité de l’Agent, les fichiers React générés et le portfolio actif dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur Projets ouvre la vue explorable du portfolio',
        body: 'Après la génération unique, un clic vérifié sur « Projets » ouvre « Projets sélectionnés » avec des filtres locaux et des liens de fiches. La capture ne démontre ni CMS, ni base, ni service de contact déployé.',
        alt: 'Capture E-Code Website Builder après le clic vérifié sur Projets, avec fichiers Meridian Studio et vue Projets sélectionnés dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution du site d’architecture',
        ariaLabel: 'Inspecter la génération E-Code capturée du site d’architecture',
      },
    },
    proofVisualAlts: {
      prompt: 'Prompt de l’Agent E-Code demandant le portfolio, le contact et le journal du cabinet Meridian Studio.',
      preview: 'Workspace E-Code avec fichiers React générés et accueil du portfolio Meridian Studio dans la Webview.',
      webviewOverview:
        'Portfolio Meridian Studio dans la Webview, avec projets fictifs et panneau de demande d’exemple.',
      iteration:
        'Workspace E-Code après le clic vérifié sur Projets, avec fichiers Meridian Studio et vue Projets sélectionnés.',
      webviewIteration:
        'Vue Projets sélectionnés de Meridian Studio ouverte par l’interaction de navigation Projets vérifiée.',
      files: 'Arborescence E-Code de Meridian Studio avec composants de portfolio et routes du journal modifiables.',
    },
    deliverables: {
      eyebrow: 'Ce que comprend votre site d’architecture',
      title: 'Un site responsive que vous inspectez, exportez et faites évoluer',
      intro:
        'Meridian Studio reste inspectable, de ses composants portfolio et routes de journal jusqu’à l’aperçu et l’export. Les sites statiques pris en charge ajoutent une mise en ligne guidée sans masquer la source éditoriale.',
      items: [
        {
          title: 'La source du site reste inspectable',
          body: 'Les vues générées, la navigation, les composants, les styles et le contenu des pages restent lisibles, versionnables et exportables comme un projet complet.',
        },
        {
          title: 'Contenu et état local du formulaire visibles',
          body: 'Les fiches projet, les informations du studio, les filtres et la confirmation locale du contact vivent dans le code. Un vrai CMS, une base ou un service d’envoi exige une connexion séparée que cette capture ne montre pas.',
        },
        {
          title: 'Le site responsive tourne dans l’aperçu',
          body: 'Ouvrez le portfolio et le parcours de contact dans l’aperçu actif, puis inspectez les mises en page sur ordinateur, tablette et mobile pendant vos ajustements.',
        },
        {
          title: 'Mise en ligne guidée des sites statiques pris en charge',
          body: 'Quand le site correspond à un build statique compatible, E-Code l’accompagne dans le parcours de publication sans masquer sa source.',
        },
        {
          title: 'Une URL E-Code ou un projet serveur exportable',
          body: 'Un site statique pris en charge reçoit une URL E-Code en ligne après publication. Si le projet exige un runtime serveur, exportez sa source et déployez-la chez l’hébergeur choisi.',
        },
        {
          title: 'Continuez à briefer l’Agent',
          body: 'Poursuivez la conversation pour ajouter une étude de cas, revoir la navigation ou modifier un formulaire, puis contrôlez le changement face au site actif.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour de vrais sites de contenu',
      title: 'Tout ce dont un site de studio a besoin, dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur de site garde l’intention design, le contenu et la publication dans un seul flux inspectable.',
      items: [
        {
          title: 'Portfolio et études de cas',
          body: 'Présentez les projets avec images, pages de détail et métadonnées structurées.',
        },
        {
          title: 'Un contenu modifiable',
          body: 'La copie et les médias vivent dans des fichiers modifiables, pas dans une base verrouillée.',
        },
        {
          title: 'Formulaires et demandes',
          body: 'Une interface de contact avec confirmation locale, explicitement séparée d’un envoi de formulaire ou d’email.',
        },
        { title: 'SEO et métadonnées sociales', body: 'Titres, descriptions et balises Open Graph générés par page.' },
        {
          title: 'Mises en page portfolio responsives',
          body: 'Grilles de projets, études de cas, articles du journal et contact se recomposent de l’ordinateur du studio au téléphone d’un client.',
        },
        {
          title: 'Gardez la source éditoriale ouverte',
          body: 'Exportez le projet ou publiez les builds statiques pris en charge tout en conservant des fichiers source modifiables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Sites à façonner depuis un brief',
      title: 'Les bases de sites que les équipes façonnent selon chaque besoin de contenu',
      intro:
        'D’un portfolio de studio à une page de lancement produit, la même boucle produit une source responsive et un site actif ; services de contenu, envois de formulaires et contrôles de mise en ligne restent explicites.',
      items: [
        {
          title: 'Sites studio et portfolio',
          body: 'Architectes, designers et agences présentant leurs travaux sélectionnés.',
        },
        {
          title: 'Sites d’entreprise et vitrines',
          body: 'Sites multi-pages avec un récit clair, des services et des parcours de contact.',
        },
        {
          title: 'Pages de lancement et campagnes',
          body: 'Pages ciblées avec interface de formulaire validée, point de branchement vers un service d’envoi et métadonnées sociales à relire.',
        },
        {
          title: 'Docs et surfaces de contenu',
          body: 'Sites de contenu lisibles et structurés, faciles à mettre à jour.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions sur le site d’architecture',
      title: 'Le Générateur de site, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de site, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens un code source modifiable ou un template verrouillé ?',
          body: 'Vous obtenez des fichiers source modifiables — vues, navigation, composants, styles et contenu — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire.',
        },
        {
          title: 'Le site est-il responsive ?',
          body: 'Oui. Les mises en page sont générées pour s’adapter aux écrans d’ordinateur, de tablette et de mobile, et vous les vérifiez dans l’aperçu à chaque taille avant de publier.',
        },
        {
          title: 'Puis-je publier vers une URL en ligne ?',
          body: 'Les builds statiques pris en charge se publient vers une URL en ligne via la publication guidée. Les autres projets restent exportables pour votre propre hébergement.',
        },
        {
          title: 'Puis-je connecter un CMS ou une base ?',
          body: 'Le modèle de contenu généré est du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'Comment modifier le site ensuite ?',
          body: 'Modifiez directement les fichiers du studio ou demandez à l’Agent un nouveau projet, un article ou un état de contact, puis comparez le diff au site actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre site et voyez-le tourner',
      body: 'Transformez les pages que vous avez en tête en un site responsive sous forme de code source modifiable, exécutez-le dans l’aperçu et publiez les builds statiques pris en charge.',
      primaryCta: { label: 'Décrivez votre site', ariaLabel: 'Décrivez votre site web avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours du site',
        ariaLabel: 'Voir comment E-Code construit le site à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Générateur de site',
      heroLabel: 'Introduction du Générateur de site',
      demoLabel: 'Démonstration produit du Générateur de site',
      problemLabel: 'Le problème de la création de site',
      buildLabel: 'Comment fonctionne le Générateur de site',
      outputListLabel: 'Résultats de la génération de site',
      proofLinkLabel: 'Inspecter la preuve du processus du Générateur de site',
      deliverablesLabel: 'Ce que livre le Générateur de site',
      featuresLabel: 'Capacités du Générateur de site',
      useCasesLabel: 'Cas d’usage du Générateur de site',
      faqLabel: 'Questions sur le Générateur de site',
      finalCtaLabel: 'Commencer à construire votre site',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
