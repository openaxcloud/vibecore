# Organisation: audit local synthétique, 25 octobre 2026

Baseline: build existant followup tête01006910d, serveur9399/API4399 indépendante. Aucun backend réel, invitation, rôle ou accès créé. Toutes mutations navigateur et API refusées; exports non activés; tiers bloqués (dont Google Fonts, police locale/fallback). Aucun changement dans le worktree #795.

Matrice matrix.json : 80 observations =5routes ×320/390/768/1440 ×FR/EN ×clair/sombre. organization-roles, roles-and-permissions, organization-invitations, invitations, audit-logs. Document contenu80/80, aucune erreur JS. Les quatre premières routes ont un nom de rôle synthétique non sécable coupé/débordant16/16 chacune; audit contient ses longs identifiants16/16. Captures avant320 des20variantes. Les résultats bruts incluent volontairement des éléments de navigation hors écran, sr-only, ellipses voulues et la matrice horizontalement scrollable: ne pas les compter comme défauts reproduits.

Contrepreuve DOM uniquement, FR clair320: organization-roles client262/scroll2547 devient262/262; roles-and-permissions232/2547 devient232/232; organization-invitations badge2561px devient260px contenu; invitations262/2190 devient262/262. counterproof.json et captures. Ce ne sont PAS des résultats du correctif compilé.

Parcours: interactions.json contient5groupes réussis (4formulaires: saisie brouillon,resize390→320,Tab,Escape,Back depuis audit; audit filtre choisi,resize768,pagination). recovery.json contient2groupes GET503 puis Recharger pouraudit/invitations. Le premier harness recovery cherchait erronément «Réessayer»; erreur de harness conservée dansinteractions.txt, corrigée puis vérifiée séparément. Fixture failures.json restaurée{}; aucunPOST effectué. Pas d'ouverture/confirmation de dialogue d'expiration niacceptationd'invitation. Back vérifie route retrouvée, pas persistance brouillon après rechargement.

Autorisation ultérieure parent: patch local appliqué UNIQUEMENT dans/workspace/vibecore-ui-org aux quatre fichiers de route. Noms de rôles: overflow-wrap:anywhere; badgeorganisation max-width100%; badgeinvitations enfant min-width0 pour corriger inline-flex. Aucun composant global/action/navigation changé. proposed-only.patch est la proposition initiale avant formatage. 33tests existants/3fichiers passent (tests.txt); ESLint4fichiers code0(lint.txt). Aucun test CSS miroir ajouté.

Source désormais gelée pour build/typage/revue indépendante du parent et recette compilée. Aucun index/commit/push/build par cet agent. Pas validation production, permissions backend, Electron, zoom200%, mobile paysage, clavier virtuel, contraste calculé ou formats supplémentaires dans ce lot. Les checkbox13px ne constituent pas seules une mesure de cible: le label associé n'a pas été audité comme cible dans ce complément. Les captures et mesures ne constituent pas une validation globale.

## Recette compilée terminée

Voir after/README.md: build9499,80observations et7parcours réussis, aucune erreurJS, noms de rôles contenus64/64 et audit16/16. Les contrepreuvesDOM restent séparées. Fixture restaurée{},navigateurs fermés. Pas de validationproduction.
