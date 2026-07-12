# Audit UI/UX complet d'app.e-code.ai

**Périmètre :** IDE, création de projet et user area  
**Formats :** web, tablette et mobile  
**Date de l'audit :** 12 juillet 2026  
**Références :** Replit, Cursor, WCAG 2.2 AA et pratiques produit enterprise  
**Verdict :** couverture fonctionnelle solide, mais produit non prêt pour une validation « Fortune 500 » en l'état

## 1. Résumé exécutif

E-Code possède déjà une base produit beaucoup plus avancée qu'un MVP : agent, éditeur, fichiers, preview, Git, déploiement, terminal, paramètres, facturation, usage, sécurité et navigation responsive existent réellement. L'IDE desktop est la surface la plus mature.

Le problème principal n'est pas l'absence de fonctionnalités. Il est dans la cohérence d'exécution : erreurs d'hydratation en production, surfaces mobiles cachées mais encore accessibles au clavier et aux lecteurs d'écran, recouvrements de contenu, adaptation tablette trop proche d'une interface téléphone, cibles tactiles trop petites et textes internes exposés aux utilisateurs.

« Sans la moindre erreur » ne peut pas être garanti de façon absolue. La définition exploitable doit être : **zéro défaut bloquant connu, zéro erreur console sur les parcours critiques, zéro violation d'accessibilité critique ou sérieuse, et une non-régression automatisée sur toutes les tailles supportées.**

### Score de maturité observé

Ces scores sont un indice d'audit interne sur 100, pas une certification standardisée.

| Domaine              |  Score | Lecture                                                                 |
| -------------------- | -----: | ----------------------------------------------------------------------- |
| IDE desktop          |     72 | Fonctionnel et dense, mais états et hiérarchie à stabiliser             |
| IDE tablette         |     43 | Architecture responsive insuffisante pour un usage clavier              |
| IDE mobile           |     36 | Fonctions présentes, plusieurs blocages P0 d'accessibilité et de layout |
| User area desktop    |     67 | Large couverture, trop de cartes et de vocabulaire technique            |
| User area tablette   |     61 | Utilisable, mais navigation et densité à mieux exploiter                |
| User area mobile     |     49 | Pas de débordement horizontal, mais priorités et ergonomie faibles      |
| Accessibilité        |     35 | Bonne intention ARIA, mais défauts critiques sur mobile                 |
| Contenu et confiance |     43 | Incohérences de devise, d'état, de langue et de terminologie            |
| Résilience perçue    |     50 | Error boundary globale solide, récupération locale inégale              |
| **Maturité globale** | **54** | **Non validable Fortune 500 avant correction des P0 et P1**             |

## 2. Méthode et limites

L'audit combine :

- inspection visuelle et interactive de `https://app.e-code.ai/` et de la page de connexion en production ;
- contrôle de la console navigateur en production ;
- vérification du routage protégé vers `/dashboard` ;
- audit authentifié d'un build local de production relié à la vraie API et à PostgreSQL locaux, sans mock permanent ;
- tests aux viewports `1440x900`, `1194x834`, `1024x768` et `390x844` ;
- inspection du DOM, des dimensions tactiles, du focus, des états accessibles et des débordements ;
- revue statique de l'architecture responsive, des routes, des error boundaries et des contenus ;
- comparaison aux documentations officielles de Replit, Cursor, W3C et Apple.

Limite importante : les pages publiques ont été testées sur la production réelle. L'IDE et la user area authentifiés ont été testés sur le code actuel via un build local de production, car aucune session de production authentifiée n'était disponible. Les constats correspondants doivent donc être confirmés une dernière fois sur `app.e-code.ai` après déploiement.

## 3. Blocages de mise en production

### P0 - à corriger avant toute validation enterprise

| ID    | Défaut observé                                                              | Preuve                                                                                              | Risque utilisateur                                                                         | Critère de correction                                                                                |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| P0-01 | Erreurs React minifiées `#418` et `#423` sur la production publique         | Console sur la home et `/login`                                                                     | Hydratation incohérente, rendu remplacé côté client, instabilité et risque SEO/performance | Zéro erreur console sur SSR, login, redirection auth et navigation initiale                          |
| P0-02 | 86 contrôles focusables hors écran dans l'IDE mobile                        | Mesure DOM à `390x844` ; Preview, Git et autres panneaux invisibles restent dans l'arbre interactif | Navigation clavier/lecteur d'écran impossible et focus perdu hors viewport                 | Panneaux inactifs démontés ou rendus `inert` et `aria-hidden`; seul le panneau visible est focusable |
| P0-03 | Premières lignes de l'arbre de fichiers recouvertes par deux en-têtes fixes | En mobile, `src` à `y=12.5` et `App.tsx` à `y=52.5`, sous des en-têtes couvrant `y=0..96`           | Fichiers essentiels invisibles et difficiles à sélectionner                                | Première ligne entièrement visible sous le header, y compris à 200 % de zoom                         |
| P0-04 | Barre d'outils Preview recoupée en mobile                                   | Vue Webview à `390x844`, première rangée et sélecteur de device partiellement masqués               | Contrôles de preview non fiables et non découvrables                                       | Aucun contrôle recouvert à 320, 390 et 430 px ; toolbar scrollable ou repliée proprement             |

### P1 - requis pour le niveau Fortune 500

| ID    | Défaut observé                                                                    | Impact                                                                                 | Recommandation                                                                           |
| ----- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1-01 | Toute largeur de 768 à 1199 px bascule vers le shell mobile                       | Une tablette paysage de 1194 px perd l'éditeur multipanneau                            | Introduire un vrai mode tablette à deux panneaux et un mode clavier                      |
| P1-02 | Nombreuses cibles de 30 à 42 px                                                   | Erreurs tactiles, difficulté motrice, faible conformité enterprise                     | Porter les commandes tactiles critiques à au moins `44x44` px                            |
| P1-03 | États contradictoires : `Ready`, `Starting`, `Reconnecting` simultanément         | Perte de confiance et actions lancées au mauvais moment                                | Une machine d'état centrale doit piloter toutes les surfaces                             |
| P1-04 | Troncatures et débordements : `Prompt`, suggestions, statuts, breadcrumb          | Commandes ambiguës et interface perçue comme cassée                                    | Largeurs stables, libellés adaptatifs, menu overflow et tests avec le texte le plus long |
| P1-05 | Euro affiché mais labels accessibles en dollars dans Billing                      | Erreur potentielle de consentement financier                                           | Devise unique provenant du compte, affichage et nom accessible identiques                |
| P1-06 | Contradiction « never expire for 6 months » et clés brutes comme `projects.count` | Risque légal et baisse de confiance                                                    | Réécriture produit, revue juridique et dictionnaire de libellés métier                   |
| P1-07 | Dashboard centré sur des métriques techniques avant l'action principale           | Le projet récent et « Open IDE » arrivent trop tard sur mobile                         | Premier écran : reprendre un projet, suivre l'agent, créer un projet                     |
| P1-08 | Création de projet mobile trop longue et trop technique                           | Charge cognitive, abandon avant création                                               | Prompt d'abord ; provider, modèle et artefacts dans « Options avancées »                 |
| P1-09 | Raccourci desktop `⌘↵` affiché sur téléphone                                      | Instruction inutilisable                                                               | Afficher le raccourci uniquement avec clavier détecté                                    |
| P1-10 | Langues mélangées et textes internes exposés                                      | Incohérence de marque et difficulté de compréhension                                   | Une locale active par session, catalogue i18n complet, aucun texte d'implémentation      |
| P1-11 | Hiérarchie visuelle trop faible dans la user area                                 | H1 calculé à 14 px, titres dupliqués, sections très cardifiées                         | Echelle typographique cohérente et sections non encartées par défaut                     |
| P1-12 | Navigation mobile surtout iconographique                                          | Libellés non découvrables au toucher ; un bouton Run apparaît comme un carré bleu vide | Libellé visible pour l'onglet actif, icônes contrastées et noms accessibles uniques      |
| P1-13 | Récupération locale des surfaces async inégale                                    | Une panne locale peut remplacer trop de contenu                                        | Skeleton, vide, erreur, retry et timeout pour chaque panneau asynchrone                  |
| P1-14 | Sidebar tablette réduite à des icônes sans contexte                               | Navigation lente et mémorisation forcée                                                | Rail avec tooltip immédiat, libellé actif et raccourci de bascule                        |

### P2 - amélioration de qualité perçue

- Remplacer le fuseau horaire en texte libre par un sélecteur IANA recherchable avec auto-détection.
- Ajouter outils récents, favoris et panneau actif dans le sélecteur d'outils mobile.
- Réduire l'omniprésence des cartes et du bleu nuit ; réserver l'orange aux actions et états de marque.
- Rendre la visite guidée non bloquante et reprenable depuis l'aide.
- Ajouter aperçu visuel, dernière activité et statut clair aux cartes projet.
- Proposer notifications de fin d'agent, reprise sur desktop et handoff explicite depuis mobile.
- Uniformiser les fontes déjà présentes : IBM Plex Sans pour l'interface et IBM Plex Mono pour le code, sans overrides locaux concurrents.

## 4. Ce qui fonctionne déjà bien

- Le socle IDE est réel : agent, éditeur, fichiers, preview, Git, déploiement, terminal et status bar.
- Les panneaux principaux disposent de routes et d'URL partageables.
- Le desktop exploite correctement une structure multipanneau proche d'un IDE moderne.
- Les formats testés n'ont pas produit de débordement horizontal global.
- Le mode sombre est cohérent avec un outil développeur et le mode clair existe.
- Le shell possède un skip link, des landmarks et de nombreux noms accessibles.
- `PanelBoundary` fournit retry automatique, rapport d'erreur, rechargement et assainissement du message.
- L'éditeur mobile utilise CodeMirror au lieu d'essayer de forcer Monaco dans un contexte inadapté.
- Le sélecteur d'outils mobile est fonctionnel, recherchable et présente une description par outil.
- La redirection de `/dashboard` vers `/login?returnTo=...` conserve correctement l'intention de navigation.

## 5. Audit détaillé de l'IDE

### 5.1 Desktop

**Etat actuel**

La disposition Agent + éditeur + fichiers/Library + status bar est crédible et productive. Les onglets, le code, la preview, Git et Deploy sont présents. La densité se rapproche de Replit et Cursor.

**Défauts observés**

- breadcrumb d'organisation/projet tronqué ;
- suggestions de l'agent coupées horizontalement ;
- status bar surchargée de libellés abrégés ;
- états runtime contradictoires entre header, preview et status bar ;
- badges Git peu lisibles ;
- contraste et palette trop uniformément bleu nuit ;
- contrôles de toolbar parfois trop petits ;
- certains textes accessibles restent en français au milieu d'une UI anglaise.

**Architecture cible desktop**

| Zone         |          Dimension cible | Comportement                                                            |
| ------------ | -----------------------: | ----------------------------------------------------------------------- |
| Activity bar |                    48 px | Outils principaux, un seul état actif, tooltip immédiat                 |
| Agent        |             320 à 420 px | Redimensionnable, repliable, historique et état du run                  |
| Explorateur  |             240 à 320 px | Fichiers, recherche, symboles ; mutualisé avec l'activity bar           |
| Editeur      | Flexible, minimum 420 px | Onglets, split horizontal/vertical, diff et diagnostics                 |
| Preview      |             360 à 520 px | Responsive presets, reload, URL, console et état runtime                |
| Panneau bas  |             180 à 420 px | Terminal, logs, problèmes et tests                                      |
| Status bar   |                    24 px | Branche, runtime, diagnostics, position, encodage ; textes non tronqués |

Le nombre de panneaux visibles doit dépendre de l'espace disponible. Sous 1280 px, un panneau secondaire se replie automatiquement avec possibilité de le rappeler, sans transformer l'ensemble en interface téléphone.

### 5.2 Tablette paysage

**Constat critique**

À `1194x834`, l'application active délibérément `useMobileIde`. L'utilisateur voit une grande surface Agent presque vide et un dock flottant, alors que la largeur permet un éditeur et un second panneau. Cette décision est inscrite dans les breakpoints de `packages/editor/src/index.ts` et dans `BaseChat.tsx`.

**Cible recommandée**

- Deux panneaux simultanés : Agent + Editor, Editor + Preview ou Files + Editor.
- Séparateur tactile de 12 px avec poignée visible et zones de snap 40/60, 50/50, 60/40.
- Barre d'onglets principale persistante et libellée.
- Mode clavier automatique lorsque clavier matériel ou trackpad est détecté.
- Command palette, raccourcis et hover activés en mode clavier.
- Panneaux Git, Deploy, Terminal et Database dans un drawer latéral, pas dans le DOM hors écran.
- Portrait tablette : un panneau principal et un drawer, mais contrôles et densité tablette, pas téléphone agrandi.

### 5.3 Mobile

**Orientation produit recommandée**

Cursor traite le mobile comme une surface d'orchestration d'agents, de revue, d'artefacts et de handoff. Replit permet aussi l'édition, mais avec un mode tablette spécifique. E-Code doit suivre la même logique : l'agent et la preview sont prioritaires ; l'édition complète reste disponible, mais n'est pas une miniature du desktop.

**Navigation cible**

1. `Agent` : prompt, plan, exécution, permissions, questions, logs synthétiques.
2. `Preview` : résultat, presets responsive, erreurs, capture et partage.
3. `Files` : recherche, arbre, édition légère, historique récent.
4. `Review` : diff, tests, problèmes, Git et validation du changement.
5. `More` : terminal, deploy, database, secrets, settings.

Le dock doit afficher le libellé de l'onglet actif. Les panneaux non actifs doivent être démontés ou `inert`, jamais simplement déplacés hors écran.

**Corrections de détail**

- Commandes top bar, composer et panneaux : `44x44` px minimum.
- Le bouton `Prompt` doit avoir une largeur intrinsèque stable ou devenir une icône avec tooltip sur desktop seulement.
- Les suggestions utilisent deux lignes maximum puis un menu « Plus ».
- Les statuts doivent afficher une icône, un terme court et une action éventuelle.
- Le toolbar symboles de l'éditeur peut rester à 40 px uniquement si son espacement porte la cible réelle à 44 px.
- La gutter de CodeMirror doit reprendre le thème sombre de l'éditeur.
- Les contrôles Preview secondaires doivent passer dans un menu overflow à 390 px.
- La vue Files doit réserver explicitement la hauteur des deux en-têtes.

## 6. Audit détaillé de la user area

### 6.1 Dashboard

**Desktop**

La sidebar complète, la recherche, les notifications et les accès produit sont présents. La page souffre surtout d'une hiérarchie faible : titre visuellement petit, duplication de conteneurs et textes de cartes décrivant l'implémentation backend.

**Tablette**

Le rail compact conserve l'espace de travail, mais les icônes seules réduisent la compréhension. Une seule carte projet laisse un grand vide, signe que la grille n'adapte pas sa composition au volume de données.

**Mobile**

Le premier écran montre le titre puis quatre grandes cartes de statistiques. Le projet récent et l'action `Open IDE` arrivent plus bas. Le menu et la cloche mesurent environ 32 px.

**Ordre cible du dashboard**

1. Continuer le dernier projet avec preview, branche, dernier run et action principale.
2. Runs Agent actifs ou récemment terminés.
3. Projets récents.
4. Déploiements, alertes et incidents nécessitant une action.
5. Résumé usage/coût compact.
6. Onboarding contextuel uniquement si une étape reste réellement incomplète.

Les textes tels que « Persistent projects loaded from API » ou « Billing state loaded from backend » doivent être remplacés par des résultats utilisateur : « 4 projets actifs », « Aucun dépassement prévu », « Dernière activité il y a 12 min ».

### 6.2 Création de projet

Le prompt-first est la bonne direction, mais le mobile expose trop tôt artefacts, provider, modèle, exemples et métadonnées. La page dépasse 3000 px de hauteur dans le scénario testé.

**Flux cible en trois étapes progressives**

1. Décrire le produit, joindre une référence et choisir éventuellement un type de sortie.
2. Confirmer le plan généré, les accès et la destination du projet.
3. Créer puis ouvrir immédiatement le run Agent, avec progression réelle.

Provider, modèle, région et budget doivent vivre dans `Options avancées`, avec valeurs par défaut administrables. Sur mobile, le carrousel d'artefacts doit afficher une amorce du prochain élément ou des flèches, jamais une coupure silencieuse.

### 6.3 Compte et préférences

- Le titre est dupliqué dans le header et le contenu.
- L'adresse e-mail est tronquée sans moyen évident de la lire complètement.
- Les onglets et champs observés mesurent environ 36 px.
- Le fuseau horaire en texte libre autorise les valeurs invalides.

**Cible** : sections non encartées, onglets scrollables de 44 px, e-mail copiable avec tooltip de valeur complète, sélecteur IANA, sauvegarde explicite avec état dirty/saved/error.

### 6.4 Billing et usage

Billing est une surface de confiance et doit être plus stricte que le reste du produit.

**Défauts critiques de contenu**

- affichage en euros mais noms accessibles parlant de dollars ;
- promesse contradictoire sur l'expiration des crédits ;
- clés techniques brutes ;
- descriptions centrées sur le backend ;
- quatre grandes cartes avant l'action financière utile sur mobile.

**Cible**

- Solde, coût prévu ce mois, budget et moyen de paiement dans le premier écran.
- Devise, taxes, dates et fuseau provenant d'une source de vérité unique.
- Chaque montant possède le même texte visible et accessible.
- Historique exportable, filtres, facture, reçu et détail par projet.
- Confirmation forte pour recharge, changement de plan et seuil de coupure.
- États de chargement, indisponibilité fournisseur, retry et preuve de succès explicites.

## 7. Architecture de navigation cible

### User area desktop

- Sidebar 240 px, repliable à 56 px.
- Organisation et environnement en tête de sidebar.
- Recherche globale et command palette dans le header.
- Navigation primaire : Home, Projects, Agent Runs, Deployments, Usage.
- Navigation secondaire : Team, Security, Integrations, Billing, Settings.
- Administration séparée et visible uniquement selon le rôle.

### User area tablette

- Rail de 72 px avec libellé actif et tooltips.
- Contenu à une ou deux colonnes selon orientation.
- Recherche, notifications et création toujours accessibles.
- Drawer pour navigation secondaire, avec focus trap et retour au déclencheur.

### User area mobile

- Header : marque, organisation active, recherche et notifications.
- Bottom navigation : Home, Projects, Create, Runs, Account.
- Paramètres et administration dans des pages dédiées, pas dans un menu surchargé.
- Action `Create` centrale, libellée et jamais représentée par un carré vide.

## 8. Parité Replit et Cursor

| Capacité de référence                | Replit/Cursor           | E-Code observé          | Ecart à fermer                                                  |
| ------------------------------------ | ----------------------- | ----------------------- | --------------------------------------------------------------- |
| Panneaux redimensionnables et splits | Replit Editor           | Bon sur desktop         | Conserver l'état et adapter sous 1280 px                        |
| Dock d'outils et recherche           | Replit Tools            | Présent                 | Ajouter récents, favoris et contexte actif                      |
| Preview responsive et DevTools       | Replit Preview          | Partiel                 | Réparer mobile, intégrer console/réseau et presets fiables      |
| Edition sur téléphone                | Replit mobile           | Présente                | Corriger focus, gutter, toolbar et recouvrements                |
| Mode tablette avec clavier           | Replit mobile           | Manquant                | Ajouter un vrai layout multipanneau tablette                    |
| Agents en arrière-plan multi-device  | Cursor web/mobile       | Partiel                 | Vue runs, reprise, notifications et synchronisation d'état      |
| Artefacts, screenshots et logs       | Cursor mobile           | Partiel                 | Rassembler dans le run Agent, avec statut et partage            |
| Revue de diff et PR sur mobile       | Cursor mobile           | Fonction dispersée      | Créer une vue Review dédiée et tactile                          |
| Handoff vers desktop                 | Cursor `Open in Cursor` | Non identifié           | `Open on desktop`, QR/deep link et reprise au même contexte     |
| Notifications de fin de run          | Replit/Cursor           | Partiel                 | Push/web notification, préférences et lien direct vers résultat |
| Gestion de plusieurs agents          | Cursor                  | Non surfacée clairement | Tableau des runs avec statut, coût, branche et propriétaire     |

L'objectif n'est pas de copier visuellement Replit ou Cursor. Il faut reprendre leurs modèles éprouvés : desktop multipanneau, tablette consciente du clavier, mobile orienté agent/review et continuité transparente entre appareils.

## 9. Design system cible

### Dimensions

| Elément              |          Desktop |                         Tactile |
| -------------------- | ---------------: | ------------------------------: |
| Bouton compact IDE   |            32 px |                           44 px |
| Champ standard       |            36 px |                      44 à 48 px |
| Onglet               |       36 à 40 px |                           44 px |
| Ligne de fichier     |       28 à 32 px |                           44 px |
| Barre de statut      |            24 px | Non interactive ou cibles 44 px |
| Rayon standard       |             6 px |                            6 px |
| Espacement de grille | Multiple de 4 px |                Multiple de 4 px |

### Typographie

- Interface : IBM Plex Sans, déjà cohérente avec le produit et le benchmark.
- Code : IBM Plex Mono.
- H1 page : 24 à 28 px desktop, 22 à 24 px mobile.
- H2 section : 18 à 20 px.
- Corps : 14 px desktop et 15 à 16 px pour les contenus mobiles longs.
- Labels IDE : 12 à 13 px uniquement quand le contexte et le contraste restent suffisants.
- Aucun changement de taille basé directement sur la largeur du viewport.

### Couleur et états

- Neutres gris équilibrés pour les surfaces ; éviter une lecture entièrement bleu nuit.
- Orange de marque réservé à l'action primaire, au focus et à l'identité.
- Vert, ambre, rouge et bleu sémantiques distincts pour succès, avertissement, erreur et information.
- Contraste WCAG AA pour texte, icônes informatives, bordures de champ et focus.
- L'état ne doit jamais dépendre uniquement de la couleur.

### Composants obligatoires

Chaque composant interactif doit documenter : default, hover, pressed, focus-visible, disabled, loading, success et error. Chaque surface asynchrone doit avoir : skeleton, vide, chargement long, erreur récupérable, erreur définitive et succès.

## 10. Résilience et accessibilité

### Constat technique

- Une error boundary globale existe dans `app/root.tsx`.
- `PanelBoundary` est une bonne base de récupération locale.
- L'inventaire statique compte environ 193 routes TSX, 102 routes avec loader asynchrone, 11 routes mentionnant une error boundary locale et 31 mentionnant un état skeleton/loading/pending.
- Ce comptage ne signifie pas que les autres routes n'ont aucune protection globale. Il montre que la récupération locale et les états de chargement explicites ne sont pas encore systématiques.

### Exigences

- Utiliser `inert` ou démonter les panneaux inactifs.
- Conserver le focus visible et dans le viewport lors des changements de panneau.
- Renvoyer le focus vers le déclencheur après fermeture d'un drawer ou modal.
- Supporter clavier seul, VoiceOver/TalkBack, zoom 200 % et `prefers-reduced-motion`.
- Aucun toast ne doit être la seule preuve d'un succès critique.
- Les erreurs réseau doivent expliquer l'impact, proposer retry et conserver la saisie.
- Les WebSockets doivent afficher connexion, reconnexion avec backoff, mode dégradé et dernière donnée connue.
- L'état du runtime doit provenir d'une machine d'état unique : `idle`, `starting`, `ready`, `degraded`, `reconnecting`, `stopped`, `failed`.

## 11. Roadmap recommandée

### Phase 0 - stabilisation, 3 à 5 jours

- Corriger les erreurs d'hydratation production.
- Rendre les panneaux mobiles inactifs non focusables.
- Corriger les recouvrements Files et Preview.
- Ajouter tests Playwright et captures de non-régression pour les quatre P0.
- Déployer puis confirmer sur la production réelle.

### Phase 1 - fondations responsive et confiance, 2 semaines

- Uniformiser toutes les cibles tactiles critiques à 44 px.
- Centraliser les états runtime et agent.
- Corriger toutes les troncatures aux tailles de référence.
- Revoir dashboard, Billing, usage et paramètres avec vocabulaire utilisateur.
- Corriger devise, labels accessibles, expiration et localisation.
- Généraliser skeleton/error/retry sur les panneaux critiques.

### Phase 2 - architecture tablette et mobile, 3 à 4 semaines

- Construire le shell tablette multipanneau avec mode clavier.
- Recomposer le mobile autour de Agent, Preview, Files et Review.
- Ajouter bottom navigation user area et hiérarchie mobile du dashboard.
- Simplifier le flux de création de projet.
- Ajouter reprise/handoff entre mobile, web et desktop.

### Phase 3 - finition enterprise, 4 à 6 semaines

- Runs Agent multi-projets, notifications et artefacts consolidés.
- Revue Git/PR mobile de niveau Cursor.
- Responsive Preview avec DevTools de niveau Replit.
- Audit complet WCAG 2.2 AA assisté et manuel.
- Budgets de performance, RUM, erreurs frontend et dashboards SLO.
- Régression visuelle dark/light sur toutes les routes prioritaires.

Ordre de grandeur réaliste : **6 à 10 semaines** avec deux ingénieurs frontend, un product designer et une capacité QA/accessibilité dédiée. La phase 0 peut être livrée indépendamment, mais le niveau Fortune 500 exige l'ensemble des phases 0 à 3 et une validation production.

## 12. Gate de validation « Fortune 500 »

Un point ne doit être considéré comme validé que si tous les critères concernés passent réellement.

### Qualité fonctionnelle

- Zéro erreur console sur login, dashboard, création, ouverture IDE, run, preview, Git, deploy, Billing et settings.
- Aucun écran blanc ; preview fonctionnelle ou erreur finie, explicite et récupérable.
- Etats loading, empty, error, retry et success testés.
- Deep links et retour après login restaurent le bon projet et le bon panneau.
- Aucun état contradictoire entre header, panneau et status bar.

### Responsive

- Tests réels à 320, 390, 430, 768, 834, 1024, 1194, 1280, 1440 et 1920 px.
- Portrait et paysage pour téléphone et tablette.
- Zoom 200 %, texte agrandi et clavier virtuel ouvert.
- Aucun recouvrement, débordement global, texte coupé sans alternative ou contrôle hors écran.
- Layout tablette multipanneau validé avec et sans clavier.

### Accessibilité

- Zéro violation axe critique ou sérieuse sur les parcours prioritaires.
- Tous les contrôles atteignables au clavier, ordre logique, focus toujours visible.
- Panneaux invisibles absents de l'arbre interactif.
- Cibles tactiles critiques de 44 px minimum.
- VoiceOver iOS et TalkBack Android testés manuellement.
- Mode clair, sombre, contraste élevé et réduction des animations vérifiés.

### Performance et fiabilité

- Au 75e percentile, LCP inférieur ou égal à 2,5 s, INP inférieur ou égal à 200 ms et CLS inférieur ou égal à 0,1, séparément mobile et desktop.
- Navigation IDE et changement de panneau sans déplacement de layout perceptible.
- Reconnexion WebSocket avec backoff et état dégradé compréhensible.
- Traces et correlation ID disponibles pour erreurs runtime, agent, preview et billing.

### Confiance et contenu

- Une seule langue active par session.
- Aucun libellé interne, clé brute ou détail d'implémentation exposé.
- Devise, taxes, seuils, dates et noms accessibles concordent.
- Toutes les actions irréversibles ou financières ont confirmation et preuve de résultat.

## 13. Matrice de recette prioritaire

Dans cette matrice, `Oui` indique une couverture obligatoire du scénario dans le gate final ; il ne signifie pas que le scénario passe déjà aujourd'hui.

| Parcours                             | Desktop | Tablette | Mobile | Dark/light | Clavier/SR | Erreur réseau |
| ------------------------------------ | :-----: | :------: | :----: | :--------: | :--------: | :-----------: |
| Login et retour URL                  |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Créer un projet                      |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Reprendre un projet                  |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Lancer et interrompre l'agent        |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Répondre à une permission/question   |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Editer et enregistrer un fichier     |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Preview et presets responsive        |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Revoir un diff et valider Git        |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Déployer et diagnostiquer un échec   |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Modifier budget et moyen de paiement |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |
| Changer thème, langue et timezone    |   Oui   |   Oui    |  Oui   |    Oui     |    Oui     |      Oui      |

## 14. Points d'ancrage dans le code

- Breakpoints et stratégie d'éditeur : `packages/editor/src/index.ts`.
- Bascule tablette vers shell mobile : `app/components/chat/BaseChat.tsx`.
- Styles du shell mobile et tailles de commandes : `app/styles/index.scss`.
- Arbre de fichiers mobile : `app/components/workbench/EditorPanel.tsx`.
- Shell et dashboard SaaS : `app/components/dashboard/SaaSLayout.tsx`.
- Billing et noms accessibles de devise : `app/routes/billing.tsx`.
- Création de projet : `app/routes/projects.new.tsx`.
- Hydratation, thème et boundary globale : `app/root.tsx`.
- Récupération locale : `app/components/ui/PanelBoundary.tsx`.

## 15. Sources de benchmark

- [Replit Mobile Apps](https://docs.replit.com/references/platforms/mobile-app)
- [Replit Editor and Tools](https://docs.replit.com/references/editor/editor-and-tools)
- [Replit Preview](https://docs.replit.com/references/editor/preview)
- [Cursor Web and Mobile](https://docs.cursor.com/en/background-agent/web-and-mobile)
- [Cursor Mobile](https://cursor.com/mobile)
- [Cursor iOS mobile app changelog](https://cursor.com/changelog/ios-mobile-app)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Nouveautés WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Web Vitals](https://web.dev/articles/vitals)

## 16. Décision recommandée

Ne pas lancer une refonte visuelle globale avant d'avoir fermé les quatre P0. Le meilleur chemin est : stabiliser le runtime et l'accessibilité, corriger la confiance du contenu, construire le vrai mode tablette, puis recomposer le mobile autour de l'agent et de la revue.

Après ces corrections, E-Code pourra dépasser une simple imitation de Replit/Cursor : conserver la puissance IDE sur desktop, offrir une tablette réellement productive et proposer sur mobile une expérience d'orchestration claire, sûre et continue.
