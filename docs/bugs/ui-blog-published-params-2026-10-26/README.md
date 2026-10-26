# Articles publiés — paramètres supplémentaires, 26 octobre 2026

Recette Chromium locale, build existant cc5574d, SHA256 vérifié dans build.json. Aucun rebuild ou changement de source ; le helper de détection linguistique hors runtime n’est pas assimilé à un changement de bundle. Trois paramètres réellement publiés dans marketing-blog-detail.ts :

- /blog/introducing-e-code (référence déjà couverte)
- /blog/building-at-scale-how-we-handle-10m-requests (nouveau paramètre)
- /blog/getting-started-with-e-code-in-5-minutes (nouveau paramètre)

Une seule route dynamique blog.$slug demeure dans le dénominateur ; zéro nouvelle route promue. Les autres cartes Blog ne sont pas présentées comme articles publiés.

## Résultats

132 observations = 3 slugs × 11 formats × FR/EN × clair/sombre. HTTP200 partout, titres et contenu distincts. Formats CSS :320×740,360×800,390×844,844×390,768×1024,820×1180,1024×768,1280×800,1440×900,1920×1080,2560×1440. Sections parcourues verticalement avant mesure. Aucun débordement signalé des h1/h2/h3/p/li/a/button dans main, ni document plus large que le viewport ; aucune erreur JavaScript.

12 groupes d’interaction = 3 slugs × FR/EN × thèmes : focus du lien Retour au blog, resize320portrait→844paysage conservant le focus, Escape, Enter vers /blog, Retour navigateur vers le slug exact, puis Tab. Tous réussis. Pas une affirmation que chaque interaction a été rejouée à chaque format. Aucun champ de saisie dans le parcours testé.

text-check.json compare chaque ligne de contenu du catalogue (après retrait des marqueurs Markdown et normalisation d’espaces) au texte main des22observations par slug/langue : aucune ligne manquante. Notamment « Utiliser des files d’attente pour les traitements longs » est bien français et présent ; aucun recours au faux positif du helper CI. Ceci vérifie la présence textuelle, pas l’exactitude éditoriale des affirmations de l’article.

Neuf captures pleinepage FR clair : chaque slug à320/844/1440. Inspection visuelle ciblée effectuée sur building-at-scale à320 : titre, paragraphes, liste et actions se replient sans coupe latérale apparente. Les autres captures sont des preuves conservées, pas revendiquées toutes inspectées visuellement.

## Limites et sécurité

Chromium uniquement, zoom100% de cette recette (pas nouvelle preuve200%). Thèmes demandés par cookie ecode_theme, langue par query. Géométrie des boîtes et scrollWidth, sans mesure exhaustive Range de chaque texte/contraste/WCAG ; pas clavier virtuel, pas écran physique ni production. Liens de documentation, comptes, formulaire Newsletter et autres tiers non activés. Requête réseau GET locale seulement ; tous domaines tiers et méthodes nonGET bloqués. Aucun nonGET tenté, aucune mutation réelle, aucun backend réel. Polices externes bloquées : rendu avec polices de repli. Les articles viennent du catalogue produit réel, pas de contenu injecté en fixture. API7199 anonyme et GET-only, aucun accès persistant créé.

Navigateurs fermés en finally. Serveur14299/API7199 arrêtés après vérification PID/startTicks, descendants recherchés ; ports refusés. cleanup.json distingue états finaux Z (processus terminés non encore récoltés) d’une absence de PID. Aucun serveur tiers touché. Pas de défaut nouveau établi dans ce périmètre ; les défauts antérieurs des cartes Blog/Newsletter ne sont ni corrigés ni effacés par ce résultat.

Revue visuelle root supplémentaire : captures320 des articles building-at-scale et getting-started inspectées ; titres et contenu visibles sans coupure horizontale repérée. Inspection ciblée, pas inspection exhaustive des neuf captures ni des132 observations.
