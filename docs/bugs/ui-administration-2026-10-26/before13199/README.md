# Audit Administration local — en cours

Dénominateur6IDs allocation P2 : routes/admin._index (redirect vers overview), routes/admin.$section (ici overview et users seulement), routes/admin.billing, routes/admin.oauth-providers, routes/admin.stripe, routes/admin.wallets. Sept URL observées ne sont pas sept IDs. Les autres valeurs de $section restent non exercées, notamment infrastructure/runtime/settings ; aucune prétention aux32sections admin standalone ni ControlPanel IDE.

Build existant priority servi en lecture seule13199, fixtureAPI6699. Sources six modules identiques org-next/priority, hashes et build dans source-provenance.json ; dépendances transitives non entièrement comparées. Aucune édition de priority. Cookie/session/admin uniquement synthétiques en mémoire de fixture. Aucun accès réel fourni ni permission créée. Toutes méthodes nonGET refusées405 ; tiers/export bloqués. Aucun secret, actionStripe, solde, impersonation, créationOAuth ou soumission.

Matrice visée7URLs×5formats320×740,390×844,844×390,820×1180,1440×900×FR/EN×clair/sombre. Formats360/768/1024/1280/1920/2560, zoom200%, WebKit/Firefox, OSclavier, lecteursécran et matériel safeareas non exercés. Captures FRclair ciblées320/paysage/1440 uniquement. Statuts/langues sont lus du reçu, pas déduits de l’URL : alias/admin perd querylang et premier titreFR observé anglais.

Défaut Facturation : offre synthétique longue, body.scrollWidth1743 à320 malgré html.scrollWidth320. Select1695 dansparent225 ; strong1421 dansparent202. Maxwidth seul sur select ne suffit pas (première contrepreuve conservée). Minwidth0 sur select +maxwidth100% sur strong ramènent body320, select225,strong202. Contrepreuve DOM temporaire, pas encore build corrigé. Patch proposé2classes, aucune valeur/action/API changée.32PR ouvertes relues sans chevauchement admin.billing ; parent revue favorable avant application.

Tableaux défilants volontairement larges : aucune suppression de colonne ni conclusion de clipping basée seulement sur un tableau hors viewport. Une capturefullpage ne prouve pas à elle seule accès au bas du contenu ou lecture clavier de chaque colonne.
