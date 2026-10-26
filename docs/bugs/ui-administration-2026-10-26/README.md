# Administration — audit partiel de six IDs

Dénominateur6IDs allocation P2 : routes/admin._index (redirect vers overview), routes/admin.$section (ici overview et users seulement), routes/admin.billing, routes/admin.oauth-providers, routes/admin.stripe, routes/admin.wallets. Sept URL observées ne sont pas sept IDs. Les autres valeurs de $section restent non exercées, notamment infrastructure/runtime/settings ; aucune prétention aux32sections admin standalone ni ControlPanel IDE.

Build existant priority servi en lecture seule13199, fixtureAPI6699. Sources six modules identiques org-next/priority, hashes et build dans source-provenance.json ; dépendances transitives non entièrement comparées. Aucune édition de priority. Cookie/session/admin uniquement synthétiques en mémoire de fixture. Aucun accès réel fourni ni permission créée. Toutes méthodes nonGET refusées405 ; tiers/export bloqués. Aucun secret, actionStripe, solde, impersonation, créationOAuth ou soumission.

Matrice exécutée :140 observations =7URLs×5formats320×740,390×844,844×390,820×1180,1440×900×FR/EN×clair/sombre. Formats360/768/1024/1280/1920/2560, zoom200%, WebKit/Firefox, OSclavier, lecteursécran et matériel safeareas non exercés. Captures FRclair ciblées320/paysage/1440 uniquement. Statuts/langues sont lus du reçu, pas déduits de l’URL : alias/admin perd querylang et premier titreFR observé anglais.

Défaut Facturation : offre synthétique longue, body.scrollWidth1743 à320 malgré html.scrollWidth320. Select1695 dansparent225 ; strong1421 dansparent202. Maxwidth seul sur select ne suffit pas (première contrepreuve conservée). Minwidth0 sur select +maxwidth100% sur strong ramènent body320, select225,strong202. Contrepreuve DOM temporaire, pas encore build corrigé. Patch proposé2classes, aucune valeur/action/API changée.32PR ouvertes relues sans chevauchement admin.billing ; parent revue favorable avant application.

Tableaux défilants volontairement larges : aucune suppression de colonne ni conclusion de clipping basée seulement sur un tableau hors viewport. Une capturefullpage ne prouve pas à elle seule accès au bas du contenu ou lecture clavier de chaque colonne.

## Résultats et correction locale

140observations terminées,0erreurJS/0mutation réseau. Débordement body uniquement dans20contextes Billing ; les alertes de texte « Section d’administration » mesurent un label sr-only de1px et sont exclues des défautsvisuels. Petits boutons Users (tri~16–20px, menu~21–25px, pagination~25–29px) relevés mais non corrigés ici ; pas de conclusion WCAG automatique.

`interactions.json` :10GET503 avec restaurationfixture FR/EN sur Billing/OAuth/Stripe/Wallets/Overview. Six reprises via bouton focalisé+Entrée ; Wallets etOverview par reload navigateur (Wallets possède bien un bouton Reload non sélectionné par ce harness). Titres récupérés ; aucune certification des soldes ou de chaque donnée. Huit brouillons navigateur conservés au resize320/390→844, focus avantresize maintenu, Escape/Tab ; Back vérifieURLseulement, pas restauration des valeurs. Deux gardes401auth→login avec returnTo. Aucun refus403 utilisateur nonadmin testé dans ce complément, aucune permission réelle.

Correction appliquée dans worktree isolé base7759cbcbd, après revue parent et32PR ouvertes : uniquement min-w-0 sur selectplan et max-w-full sur nomoffrestrong.18tests existants/2fichiers verts, lint ciblé0,diffcheck0. Testsactions utilisent mocksunitaires et ne constituent aucune opération financière. La recette compilée du build commun P2 est maintenant disponible ci-dessous ; la contrepreuveDOM antérieure reste distincte. Commit local de préparation autorisé ; aucun index partagé ni push. Parent regroupera les correctifs P2 pour un build commun unique ; aucun build admin isolé lancé. Le harness préparé est conservé historiquement ; sa version effectivement exécutée est archivée dans after13299/.

App13199/API6699 propres arrêtés après vérificationPID/startTicks. Portsfermés,API disparue ; serveurapp résiduel identique a nécessitéSIGKILL aprèsSIGTERM, reçu cleanup.json. Aucun processusautrui touché. Scripts exacts archivés avec chemins de session ; adapter seulement vers environnementlocal synthétique équivalent pour rejouer, jamais APIréelle.

## Validation compilée finale13299

Build commun P2 tête222495dda, source route SHA256 identique au correctiflocal (source.json).20observations Billing uniquement :5formats320/390/paysage844/820/1440×FR/EN×clair/sombre. Body≤viewport, selectcontenu, nomintégral replié dans sa carte dans20cas. Les120autresobservations de baseline ne sont pas recomptées comme rejouées.

Quatre parcours FR/ENthèmes : saisie ordinaire, focus conservé aux resize320→844→1440→320, Tab versselect, Escape sans modification devaleur, options complètes inchangées et nom affichéintégral vérifié.0erreurJS,0nonGET. Aucun POST ni action de quota/offre. CaptureFRclair320inspectée : sélecteurfermé écourte naturellement le libellé long, mais option/valeur complète reste inchangée et le nom complet est lisible dans la carte. Pas de prétention de menu natif ouvert ou de chaque colonne de tableau.

Navigateurs fermés ; API6699/app13299 arrêtés avec vérificationPID/startTicks, résiduel app identique terminéSIGKILL aprèsSIGTERM. Aucun processusautrui. Buildréussi attesté parparent ; aucune nouvelle compilation par cette mission. Main/live restent faux, pas de livraisonproduction.
