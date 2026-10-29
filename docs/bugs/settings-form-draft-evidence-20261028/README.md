# Settings — six recettes compilées finales

Build52670 et typage42945 réussis, sources du worktree problems-layout gelées sur base6ee052210 avec delta local non encore commité ; empreintes dans source.json. Chromium /usr/bin/chromium, app20999/API8699 synthétiques, vrai rendu compilé. Aucune donnée cliente, aucun submit, aucune écriture backend : toutes requêtes externes et méthodes autres que GET/HEAD bloquées par contexte. L’état Runtime indisponible visible est une limite de la fixture.

| Recette | Parcours réellement exécuté | Résultat |
|---|---|---|
| FR1280×900 | Compte nom non enregistré ; Préférences77 ; aller/retour sous-pages ;390×900 puis1280 ; thème clic/focus ; smoke Usage et Memory | PASS |
| FR1920×900 | Même conservation Compte/Préférences et sous-page ;390×900 puis1920 ; thème clic/focus | PASS |
| EN1280×900 | Même parcours, UI anglaise et texte de brouillon français long | PASS |
| EN1920×900 | Même parcours, UI anglaise | PASS |
| Zoom natif200%, FR | Fenêtre2560×1800 donnant CSS1280×856 ; mêmes sous-pages et thème, smoke Usage/Memory ; pas de resize supplémentaire dans cette recette | PASS |
| Deux panneaux, FR1920 | Split droit natif, puis ajout Settings dans pane-main via tab-add ; deux hubs visibles simultanément, noms indépendants et seuil77 gauche/80 droite | PASS |

Les quatre premières recettes vérifient nom Compte après changement de sous-page ET retour de resize, seuil77 et sous-page Préférences conservés pendant390 puis retour. Six reçus au total dans quatre fichiers JSON ; zéro pageerror.

Panneau étroit à viewport1280 : hub587,66px, sidebar static, thème atteint directementSELECT (avantSPANsidebar). À1920 : hub1100,67px, sidebar sticky dans une vraie colonne séparée ; thème également atteignable. Zoom réel via chrome.settingsPrivate.setDefaultZoom(2), pas simple DPR ou CSSzoom : innerWidth1280, innerHeight856, DPR2, visualViewport.scale1.

SmokeUsage : tableau visible, focus clavier et défilement horizontal vérifié si nécessaire. SmokeMemory : brouillon long non enregistré, JSON complet ouvert, largeurhub bornée à clientWidth+1. Ces deux smokes sont exécutés FR1280 et au zoom200%.

Deux panneaux : navigation UI réelle, aucune injection de layout/store. Déplacer Settings vers pane puis rouvrir Settings dans pane-main conserve le premier brouillon et ne le transmet pas au nouveau panneau. Noms distincts vérifiés, puis seuils77/80 simultanément.

Couverture de ce passage : Compte/Préférences détaillés, Memory/Usage ciblés (4 sous-pages sur7). Projet/Sécurité/IA, changements sensibles, soumission ou récupération backend réels, dark theme, Safari/WebKit, appareils physiques, clavier virtuel et autres tailles fixes non recettés ici. Aucun certificat global UI/contraste ou déploiement revendiqué. Scripts de recette de session : /workspace/ui-settings-final-followup/{probe-final,zoom-final,two-panes}.cjs.
