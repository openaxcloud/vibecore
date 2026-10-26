# Marketing et éditorial — 15 IDs, audit partiel et correctif Blog

Sources isolées initialement Discovery puis worktree Editorial base7759cbcbd. Le build commun priority fbb678704 est réutilisé en lecture seule, sans nouveau build. Les50 fichiers de routes et dépendances directes/à un niveau ont été comparés identiques avant audit (`route-map.json`). Ce graphe limité n’est pas un graphe transitif complet.

## Couverture exacte

300 observations géométriques :15URL ×5formats (320×740,390×844,844×390,820×1180,1440×900) ×FR/EN ×clair/sombre. URL : /about, /blog, /blog/introducing-e-code, /careers, /case-studies, /changelog, /compare, /compare/github-codespaces, /partners, /press, /status, /newsletter, /newsletter-confirmed, /newsletter/confirm, /newsletter/unsubscribe. Zéro dépassement détecté par les sélecteurs mesurés, zéro erreurJS ;120GET tiers de fontes bloqués, aucune mutation tentée dans la matrice.

**300 observations ne signifient pas300 succès fonctionnels.** Le détail Blog est masqué par le parent dans20observations ; la confirmation Newsletter est un écran statique sans preuve d’abonnement. Les captures sont FRclair seulement, pas une inspection visuelle exhaustive des langues/thèmes. Aucune validation production, Safari/Firefox, zoom200, matériel/safe areas, clavier virtuel ou lecteur d’écran.

## Blog : correction locale autorisée

/blog/introducing-e-code répond200 mais affiche « Le blog E-Code »/« The E-Code blog », dans les4groupes FR/EN×thèmes. Le parent `app/routes/blog.tsx` ne rend pas d’Outlet ; l’enfant possède pourtant loader et contenu publié. Correction minimale : useOutlet inconditionnel, puis enfant ou Blog index. Aucun loader, contenu, shell partagé ou lien de carte modifié.

Le nouveau test DataRouter utilise les vrais composants de route et loader de détail, avec seuls renderers visuels remplacés. Deux cas échouent avant : accès direct et transition index→enfant. Les deux passent après, avec une coquille unique et Retour au parent ; les deux tests de locale/données du détail existants passent également (4tests total). Le lien de l’index du test est explicitement une fixture : il ne prétend pas corriger les vrais liens des cartes. Lint/format passent après correction des erreurs de style initiales conservées. Le build et la recette du correctif compilé seront faits par le parent, pas dans ce lot.

Contrôle GitHub frais :32PR ouvertes, toutes pages de fichiers lues, aucun chevauchement blog.tsx ou nouveau test. PR324 touche un test du catalogue legal-blog, laissé intact. Lectures de fichiers #768/#764 uniquement : aucune opération précédemment refusée retentée.

## Autres parcours et défauts laissés distincts

- Les7liens « Lire la suite » (featured+6cartes) pointent réellement /blog ; clic reproduit le retour à la liste. Les6 IDs éditoriaux ne correspondent pas aux3slugs de contenu publié. Voir [diagnostic des cartes](blog-card-mapping.md) ; aucune carte retirée, aucun article inventé.
- Compare liste→GitHub Codespaces→Back passe dans4groupes avec attente d’URL et de titre. Un post Blog inconnu renvoie404 localisé,4groupes.
- Statut : le premier test sélectionnait un input email global et ne qualifie pas la fermeture du popover. Le recontrôle cible son testId ; quatre Escape ferment et restaurent le focus. Après passage320→844paysage, Radix masque le panneau quand son déclencheur est détaché du viewport ; le brouillon reste dans le champ et Escape fonctionne. Sans recette de récupération par scroll, aucune validation complète du resize du popover n’est affirmée.
- Newsletter : /newsletter/confirm sans token mène à /newsletter-confirmed et affirme un abonnement confirmé, sans appel de mutation. /unsubscribe pointe vers ce même succès d’abonnement. [Diagnostic backend séparé](newsletter-contract.md), aucun patch cosmétique ni API inventée.

## Partage et isolation

Composants communs avec Solutions/présentations : EcodeExactShell, EcodeExactUi, EcodeMarketingPages, SaaSLayout ; catalogues marketing, remaining-route-shells, case-studies-collaboration, status-desktop, partners-bounties. Le registre `route-map.json` donne les consommateurs exacts. Aucun de ces composants partagés n’est modifié. Admin/DPA/ReportAbuse, IDE, hub Intégrations restent hors périmètre.

Les preuves et scripts exacts sont sous `before13399/` (scripts `.txt` avec chemins de session, à adapter pour rejouer). La fixture locale6799 refuse tout sauf GET ; newsletter/email/paiement/actions externes n’ont jamais été activés. Les navigateurs ont été fermés. Serveurs13399/API6799 arrêtés, PID disparus ; anciens12999/13099 absents. Incident du lanceur13299 séparé : erreur d’écriture de provenance après spawn, second lancement échoué EADDRINUSE ; PID propre vérifié puis terminé. Son entrée résiduelle était un zombie sousPID1, sans serveur vivant, et reste décrite ainsi dans le reçu au lieu de prétendre une disparition non observée.
