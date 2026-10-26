# Formats exercés et lacunes explicites

Complément de la matrice par route de #802 : `ui-p2-coverage-2026-10-26/routes-evidence.json`. Les lignes suivantes ne fusionnent pas une baseline présentant un défaut avec la recette corrigée. Les tailles sont des largeurs CSS ; 844 désigne le téléphone paysage. Les tests sont locaux, Chromium et fixtures synthétiques. Aucun parcours authentifié de production, achat, invitation ou droit réel.

| Famille / phase | Formats exercés | Formats demandés sans preuve dans cette phase | État du code |
|---|---|---|---|
| Administration, baseline de 6 IDs | 320,390,844,820,1440 ; FR/EN clair/sombre | 360,768,1024,1280,1920,2560 | Baseline, aucune réparation implicite de toutes les sections |
| Admin Billing corrigé | 320,390,844,820,1440 ; 20 observations/4 parcours | 360,768,1024,1280,1920,2560 | #802 brouillon |
| Éditorial, baseline de 15 IDs | 320,390,844,820,1440 ; FR/EN clair/sombre | 360,768,1024,1280,1920,2560 | Cartes Blog et contrat Newsletter restent ouverts |
| Détail Blog corrigé | 320,390,844,820,1440 ; 20 observations/4 parcours | 360,768,1024,1280,1920,2560 ; tous les slugs et cartes non rejoués | #802 brouillon |
| Légal, 15 routes observées dont 4 corrigées | 320,360,390,844,768,820,1024,1280,1440,1920 ; FR/EN clair/sombre | 2560 ; tous les états dynamiques/formulaires ne sont pas couverts | #802 brouillon |
| Solutions/Produit, baseline de 29 états rendus et 1 alias | 320,360,390,844,768,820,1024,1280,1440,1920,2560 ; FR/EN clair/sombre | Pas de format manquant dans cette grille, mais uniquement les états et valeurs de routes documentés | Baseline partielle, pas certification fonctionnelle |
| Hero marketing Déploiements corrigé | Les 11 formats précédents ; 44 observations/8 groupes | Autres états, contenus futurs et clavier OS non couverts | #802 brouillon |
| Liens uniques et repères publics, correction sémantique | 320,768,1024,1440 ; 48 observations/192 CTA/48 Tab/12 Entrée-Retour | 360,390,844,820,1280,1920,2560 hors complément Hero séparé | #802 brouillon |
| Contraste de 2 liens Signalement | 320,1440 ; FR/EN clair/sombre, 16 mesures | Autres formats/contrôles ; fonds transparents ou dégradés non certifiés | #802 brouillon |
| Section observabilité corrigée | 320,1024,1440 à zoom natif100/200 ; 24 observations/4 parcours | 360,390,844,768,820,1280,1920,2560 après cette correction | Lot local suivant |
| Tris et menu Users corrigés | 320,390,820,1440 ; 16 contextes/64 cibles/320 hit-tests/16 parcours | 360,844,768,1024,1280,1920,2560 ; pagination active et bornes verticales du menu non assertées | Lot local suivant |
| Entrée Admin / langue / autorisation | 5 GET compilés : FR/EN/défaut/non-admin/anonyme | Test de contrat HTTP, ne donne aucune couverture de viewport | Lot local suivant |

## Zoom et environnements

Le supplément natif200% P2 a observé DPA, StudentDPA, un détail Blog, MarketingDeployments et MarketingTeams : 80 observations/20 parcours. Les dimensions réelles, DPR et échelles sont conservées dans ses reçus. Ce n'est pas un test de toutes les routes à200%. Les 16 contextes CSS195 sont un backlog de descendants débordants : outer500/inner195 sous zoom, pas un téléphone physique390. Ils manquent encore de captures, mesures d'ancêtres et hit-tests pour qualifier une coupure ou une impossibilité d'action. Ils ne sont pas clos par la réparation CSS320 de la grille.

Les compléments zoom natif de #800/#801 gardent leurs propres reçus ; ils ne confèrent pas de couverture aux lignes ci-dessus. Le canari WebKit CI de main #801 comporte17 réussites et3 cas ignorés sur son périmètre IDE/composer/register ; il ne certifie pas Safari physique ni les pages de cette matrice. Firefox, lecteur d'écran réel, clavier virtuel OS, safe areas physiques, toutes les combinaisons de zoom et redimensionnement restent non validés ici. Les fontes tierces étaient bloquées, avec rendu de repli.

Le dénominateur reste357 IDs :160 partiellement exercés,37 non exercés réservés à d'autres sessions,5 réservés historiques et155 hors UI. Aucun contrôle supplémentaire d'un même ID n'ajoute une route. La matrice par route fournit les URLs concrètes, alias, paramètres et phases ; aucune ligne ne vaut « toute la plateforme validée ».
