import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL-02 — Website Builder. Declined from the App Builder gabarit, centered on a
 * fictional architecture studio marketing site. All demo data is fictional and
 * labeled; the embedded IDE images come from the separately verified App Builder run.
 */
export const WEBSITE_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Website Builder with Real Code | E-Code',
      description:
        'Describe the pages, sections, and content your site needs. E-Code turns it into a responsive site in editable source files with a running Preview, project export, and publishing for supported static builds.',
    },
    hero: {
      eyebrow: 'Website Builder for real content sites',
      title: 'Turn your studio and its work into a site you can inspect and shape',
      subtitle:
        'Describe the pages, the story, and the work you want to show. E-Code turns that into a responsive marketing site in editable source code. Inspect every file, run the site in Preview, refine it through the Agent, and publish supported static builds to a live URL.',
      primaryCta: { label: 'Describe your site', ariaLabel: 'Describe your website with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the website from a prompt' },
      microcopy:
        'Start from the pages you already have in mind. Source files, the running Preview, and publishing controls stay visible as the site evolves.',
    },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Meridian Studio',
      brandType: 'Architecture practice',
      nav: ['Projects', 'Studio', 'Contact'],
      eyebrow: 'Selected work',
      title: 'Buildings shaped by light, place, and material.',
      intro:
        'A responsive portfolio site that presents projects, the studio, and an enquiry path in one clear journey.',
      primaryHeading: 'Featured projects',
      primaryRows: [
        { label: 'Coastal House, Biarritz', meta: 'Residential · 2025', status: 'Featured' },
        { label: 'Riverside Pavilion', meta: 'Public · 2024' },
        { label: 'Atelier Extension', meta: 'Renovation · 2024' },
      ],
      asideHeading: 'Start a project',
      asideRows: [
        { label: 'Project type', value: 'New build' },
        { label: 'Location', value: 'Nouvelle-Aquitaine' },
        { label: 'Timeline', value: 'Q3 2026' },
      ],
      asideCta: 'Request a consultation',
      disclaimer: 'Inline responsive demonstration · fictional studio data · not a generation record',
      caption: {
        title: 'A content site that reads like a real practice',
        body: 'This inline demonstration shows a portfolio grid, studio profile entry, and an enquiry form in one responsive layout.',
      },
      alt: 'Architecture studio website demonstration with a featured project list and a project enquiry panel.',
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
      label: 'Example prompt',
      promptText: 'Build a showcase website for my architecture firm, with a portfolio, contact page, and blog.',
      outputs: [
        {
          title: 'Responsive pages',
          body: 'Home, portfolio, project detail, studio, and contact pages render across desktop, tablet, and mobile from real components and routes.',
        },
        {
          title: 'Structured content',
          body: 'Projects, images, studio details, and enquiries are modeled as editable content the team can extend without breaking the layout.',
        },
        {
          title: 'Working contact flow',
          body: 'The enquiry form validates input and exposes a submission hook in code. Connect that hook to your chosen form or email service before accepting real enquiries.',
        },
        {
          title: 'Preview and publishing',
          body: 'E-Code runs the site in Preview across screen sizes. Supported static builds continue through guided publishing to a live URL; other projects stay exportable for any host.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'The site-building workflow, captured in the IDE',
      title: 'See how the prompt, Agent, files, and Webview stay together',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to a content site like this one.',
      galleryLabel: 'Real workflow reference: the salon booking workspace',
      disclaimer:
        'Evidence note: these two images come from the real App Builder salon run. The Meridian Studio website above is a scripted layout with fictional content, not a captured E-Code generation.',
      openFullSizeLabel: 'Open the booking-workspace evidence at full size',
      preview: {
        title: 'The salon application running beside its source files',
        body: 'This first capture shows the real booking prompt, the Agent plan, the project tree, and the working salon dashboard together inside the E-Code IDE.',
        alt: 'Real E-Code App Builder workspace with a salon booking prompt and agent plan on the left, the running booking dashboard in the Webview, and editable project files on the right.',
      },
      iteration: {
        title: 'A runtime correction requested in the same workspace',
        body: 'The second capture records the follow-up prompt used to diagnose a React context error while keeping the booking Preview visible for verification.',
        alt: 'Real E-Code App Builder workspace showing a prompt to repair a React context runtime error beside the salon booking Webview and generated file tree.',
      },
      cta: {
        label: 'Inspect the captured build workflow',
        ariaLabel: 'Inspect the real E-Code App Builder workflow used as a Website Builder reference',
      },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A responsive site you can inspect, export, and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Supported static builds add a live release through guided publishing without hiding the code.',
      items: [
        {
          title: 'Website source you can inspect',
          body: 'Real routes, components, styles, and page content remain readable, versionable, and exportable as a complete project.',
        },
        {
          title: 'Visible content schema and form adapter',
          body: 'Project entries, media fields, studio details, and the enquiry hook live in the code. Wire them to your CMS, database, and delivery service before using real content or submissions.',
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
          body: 'Contact and lead-capture interfaces with validation plus an explicit integration point for your delivery service.',
        },
        { title: 'SEO and social metadata', body: 'Titles, descriptions, and Open Graph tags generated per page.' },
        {
          title: 'Responsive by default',
          body: 'Layouts adapt from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Keep the source accessible',
          body: 'Export the project or publish supported static builds while retaining editable source files.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Sites teams ship with the Website Builder',
      intro: 'From a studio portfolio to a product launch page, the same loop produces a real, responsive site.',
      items: [
        { title: 'Studio and portfolio sites', body: 'Architects, designers, and agencies presenting selected work.' },
        {
          title: 'Company and marketing sites',
          body: 'Multi-page sites with a clear story, services, and contact paths.',
        },
        {
          title: 'Launch and campaign pages',
          body: 'Focused pages with lead capture and social metadata ready to share.',
        },
        { title: 'Docs and content surfaces', body: 'Readable, structured content sites that stay easy to update.' },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Website Builder, answered honestly',
      intro: 'What the Website Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked template?',
          body: 'You get editable source files — components, routes, styles, and content — that you can read, version, and export. There is no proprietary template lock-in.',
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
          body: 'Edit the files directly or ask the Agent for the next change and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your site and see it running',
      body: 'Turn the pages you have in mind into a responsive site in real source code, run it in Preview, and publish supported static builds.',
      primaryCta: { label: 'Describe your site', ariaLabel: 'Describe your website with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the site from a prompt' },
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
      title: 'Générateur de site web avec vrai code | E-Code',
      description:
        'Décrivez les pages, les sections et le contenu de votre site. E-Code les transforme en un site adaptatif dans des fichiers source modifiables, avec un aperçu actif, l’export du projet et la publication des compilations statiques prises en charge.',
    },
    hero: {
      eyebrow: 'Générateur de site pour de vrais sites de contenu',
      title: 'Transformez votre studio et son travail en un site que vous inspectez et façonnez',
      subtitle:
        'Décrivez les pages, le récit et le travail à montrer. E-Code en fait un site vitrine adaptatif dans un vrai code source modifiable. Inspectez chaque fichier, exécutez le site dans l’aperçu, affinez-le avec l’Agent et publiez les compilations statiques prises en charge vers une URL en ligne.',
      primaryCta: { label: 'Décrivez votre site', ariaLabel: 'Décrivez votre site web avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le site à partir d’un prompt',
      },
      microcopy:
        'Partez des pages que vous avez déjà en tête. Les fichiers source, l’aperçu actif et les contrôles de publication restent visibles à mesure que le site évolue.',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'Studio Meridian',
      brandType: 'Agence d’architecture',
      nav: ['Projets', 'Studio', 'Contact'],
      eyebrow: 'Travaux sélectionnés',
      title: 'Des bâtiments façonnés par la lumière, le lieu et la matière.',
      intro: 'Un site portfolio adaptatif qui présente les projets, le studio et un parcours de contact clair.',
      primaryHeading: 'Projets mis en avant',
      primaryRows: [
        { label: 'Maison littorale, Biarritz', meta: 'Résidentiel · 2025', status: 'À la une' },
        { label: 'Pavillon des berges', meta: 'Public · 2024' },
        { label: 'Extension d’atelier', meta: 'Rénovation · 2024' },
      ],
      asideHeading: 'Démarrer un projet',
      asideRows: [
        { label: 'Type de projet', value: 'Construction neuve' },
        { label: 'Lieu', value: 'Nouvelle-Aquitaine' },
        { label: 'Échéance', value: 'T3 2026' },
      ],
      asideCta: 'Demander un rendez-vous',
      disclaimer: 'Démonstration adaptative intégrée · données de studio fictives · pas une trace de génération',
      caption: {
        title: 'Un site de contenu qui se lit comme une vraie agence',
        body: 'Cette démonstration intégrée présente une grille de projets, une entrée de profil du studio et un formulaire de contact dans une mise en page adaptative.',
      },
      alt: 'Démonstration de site d’agence d’architecture avec une liste de projets mis en avant et un panneau de demande de projet.',
    },
    problem: {
      eyebrow: 'Du carcan des modèles à une source que vous maîtrisez',
      title: 'Les créateurs de site paraissent simples jusqu’à ce que le contenu et la marque se heurtent au modèle',
      intro:
        'Un studio a besoin d’un site qui montre son travail exactement comme il le souhaite. Les créateurs de sites démarrent vite, puis contraignent la mise en page, la typographie et la structure, et l’export correspond rarement à un code que l’équipe peut faire évoluer.',
      obstacles: [
        {
          title: 'Les modèles contraignent le récit',
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
        'E-Code part des pages que vous décrivez et produit un site adaptatif dans de vrais fichiers source. Vous inspectez le balisage, l’exécutez dans l’aperçu et demandez le changement suivant sans abandonner le code.',
    },
    build: {
      eyebrow: 'Un prompt lance le site',
      title: 'Décrivez les pages, pas le framework',
      intro:
        'La demande ci-dessous se lit comme un mot d’un propriétaire de studio. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un modèle verrouillé.',
      label: 'Exemple de prompt',
      promptText: 'Fais-moi un site vitrine pour mon cabinet d’architecte, avec portfolio, contact et blog.',
      outputs: [
        {
          title: 'Pages adaptatives',
          body: 'Accueil, portfolio, détail de projet, studio et contact s’affichent sur desktop, tablette et mobile à partir de vrais composants et routes.',
        },
        {
          title: 'Contenu structuré',
          body: 'Projets, images, détails du studio et demandes sont modélisés comme un contenu modifiable que l’équipe peut étendre sans casser la mise en page.',
        },
        {
          title: 'Parcours de contact fonctionnel',
          body: 'Le formulaire valide les entrées et expose un point de branchement dans le code. Connectez-le au service de formulaire ou d’email choisi avant de recevoir de vraies demandes.',
        },
        {
          title: 'Aperçu et publication',
          body: 'E-Code exécute le site dans l’aperçu à toutes les tailles d’écran. Les compilations statiques prises en charge se publient vers une URL en ligne ; les autres projets restent exportables pour tout hébergeur.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Le processus de création de site, capturé dans l’IDE',
      title: 'Voyez le prompt, l’Agent, les fichiers et la Webview rester réunis',
      body: 'La page Générateur d’applications montre un vrai espace de travail E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un site de contenu comme celui-ci.',
      galleryLabel: 'Référence réelle du processus : l’espace de travail de réservation du salon',
      disclaimer:
        'Note de preuve : ces deux images proviennent du vrai run Générateur d’applications du salon. Le site Studio Meridian présenté plus haut est une mise en page scénarisée avec du contenu fictif, pas la capture d’une génération E-Code.',
      openFullSizeLabel: 'Ouvrir la preuve de l’espace de travail de réservation en grand',
      preview: {
        title: 'L’application du salon active à côté de ses fichiers source',
        body: 'Cette première capture réunit dans l’IDE E-Code le vrai prompt de réservation, le plan de l’Agent, l’arborescence du projet et le tableau de bord du salon en fonctionnement.',
        alt: 'Vrai espace de travail Générateur d’applications E-Code avec le prompt et le plan de l’agent pour un salon à gauche, le tableau de bord de réservation actif dans la Webview et les fichiers modifiables à droite.',
      },
      iteration: {
        title: 'Une correction d’exécution demandée sans quitter l’espace de travail',
        body: 'La seconde capture conserve l’aperçu de réservation visible pendant qu’un prompt de suivi demande le diagnostic d’une erreur de contexte React.',
        alt: 'Vrai espace de travail Générateur d’applications E-Code montrant un prompt de réparation d’une erreur d’exécution React à côté de la Webview du salon et de l’arborescence générée.',
      },
      cta: {
        label: 'Inspecter le processus capturé',
        ariaLabel:
          'Inspecter le vrai processus Générateur d’applications E-Code utilisé comme référence du Générateur de site',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un site adaptatif que vous inspectez, exportez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les compilations statiques prises en charge ajoutent une mise en ligne guidée sans masquer le code.',
      items: [
        {
          title: 'La source du site reste inspectable',
          body: 'De vraies routes, des composants, des styles et le contenu des pages restent lisibles, versionnables et exportables comme un projet complet.',
        },
        {
          title: 'Schéma de contenu et adaptateur de formulaire visibles',
          body: 'Les fiches projet, les champs média, les informations du studio et le point de branchement des demandes vivent dans le code. Reliez-les à votre CMS, votre base et votre service d’envoi avant d’utiliser de vrais contenus ou formulaires.',
        },
        {
          title: 'Le site adaptatif tourne dans l’aperçu',
          body: 'Ouvrez le portfolio et le parcours de contact dans l’aperçu actif, puis inspectez les mises en page desktop, tablette et mobile pendant vos ajustements.',
        },
        {
          title: 'Mise en ligne guidée des sites statiques pris en charge',
          body: 'Quand le site correspond à une compilation statique compatible, E-Code l’accompagne dans le parcours de publication sans masquer sa source.',
        },
        {
          title: 'Une URL E-Code ou un projet serveur exportable',
          body: 'Un site statique pris en charge reçoit une URL E-Code en ligne après publication. Si le projet exige un environnement d’exécution serveur, exportez sa source et déployez-la chez l’hébergeur choisi.',
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
          body: 'Interfaces de contact et de capture de leads avec validation et point d’intégration explicite pour votre service d’envoi.',
        },
        { title: 'SEO et métadonnées sociales', body: 'Titres, descriptions et balises Open Graph générés par page.' },
        {
          title: 'Adaptatif par défaut',
          body: 'Les mises en page s’adaptent du grand écran au téléphone sans compilation mobile séparée.',
        },
        {
          title: 'Gardez la source accessible',
          body: 'Exportez le projet ou publiez les compilations statiques prises en charge tout en conservant des fichiers source modifiables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les sites que les équipes livrent avec le Générateur de site',
      intro: 'D’un portfolio de studio à une page de lancement produit, la même boucle produit un vrai site adaptatif.',
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
          body: 'Pages ciblées avec capture de leads et métadonnées sociales prêtes à partager.',
        },
        {
          title: 'Documentation et surfaces de contenu',
          body: 'Sites de contenu lisibles et structurés, faciles à mettre à jour.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Le Générateur de site, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de site, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou un modèle verrouillé ?',
          body: 'Vous obtenez des fichiers source modifiables — composants, routes, styles et contenu — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire.',
        },
        {
          title: 'Le site est-il adaptatif ?',
          body: 'Oui. Les mises en page sont générées pour s’adapter à desktop, tablette et mobile, et vous les vérifiez dans l’aperçu à chaque taille avant de publier.',
        },
        {
          title: 'Puis-je publier vers une URL en ligne ?',
          body: 'Les compilations statiques prises en charge se publient vers une URL en ligne via la publication guidée. Les autres projets restent exportables pour votre propre hébergement.',
        },
        {
          title: 'Puis-je connecter un CMS ou une base ?',
          body: 'Le modèle de contenu généré est du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun service applicatif connecté.',
        },
        {
          title: 'Comment modifier le site ensuite ?',
          body: 'Modifiez les fichiers directement ou demandez le changement suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre site et voyez-le tourner',
      body: 'Transformez les pages que vous avez en tête en un site adaptatif dans du vrai code source, exécutez-le dans l’aperçu et publiez les compilations statiques prises en charge.',
      primaryCta: { label: 'Décrivez votre site', ariaLabel: 'Décrivez votre site web avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
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
      proofLinkLabel: 'Inspecter la preuve du processus Générateur de site',
      deliverablesLabel: 'Ce que livre le Générateur de site',
      featuresLabel: 'Capacités du Générateur de site',
      useCasesLabel: 'Cas d’usage du Générateur de site',
      faqLabel: 'Questions sur le Générateur de site',
      finalCtaLabel: 'Commencer à construire votre site',
    },
  },
} as const satisfies SolutionCopyByLanguage;
