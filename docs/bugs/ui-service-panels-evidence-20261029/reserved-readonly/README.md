# Panneaux réservés — diagnostic passif du29octobre2026

Build local47b1e2e922 (arbre identique au lot validéf978), Chromium390/820/1280, API et runtime synthétiques. Aucune source du dépôt modifiée par cet audit. Tous les POST et toute origine externe sont bloqués dans la route du navigateur avant le harnaisruntime. Aucun OAuth, connexion fournisseur, publication, création/modification/suppression de domaine, DNS, scaffold, installation, copie ou révélation de secret, commit/push/pull Git. Seuls chargements GET, recherche locale du catalogue et reprises GET au clavier. Aucun backend réel, Safari physique, zoom200%, clavier virtuel ou production certifiés.

## Cartographie et propriétaires à préserver

- Git : `app/components/git/GitTab.tsx` (ligne1213 grilleprincipale,1568 grilleWorkingtree), `GitBranchDropdown` dans le même fichier ; GET `/api/projects/:id/ide-panel/git`. Route BFF `app/routes/api.projects.$projectId.ide-panel.$panel.ts`. Propriétaire Git/IDE ; aucun patch appliqué.
- Deployments : `app/components/chat/BaseChat.tsx`, `ProjectDeploymentsPanel` (23701), `app/components/deploy/PublicationReplit.tsx` et session/proxyDeploy. GET `/ide-panel/deployments`. Propriétaire Publish/Deploy, préservé.
- Domains : alias versDeploy→Domains, même `ProjectDomainsPanel` (BaseChat15280), `app/components/deploy/useProjectDomains.ts`. GET `/ide-panel/domains`. Propriétaire Domains/Deploy, préservé. Aucune vérificationDNS.
- Integrations : `ProjectIntegrationsPanel` (BaseChat21177), `AddAuthenticationCard` (21087), cataloguepassif seulement. GET `/ide-panel/integrations`. Propriétaire hub ; aucun modal métier, OAuth, formulaireAPIkey/webhook ou authentificationscaffold exercé.

## Recettes réellement effectuées

| Panneau | Formats | Résultat ciblé |
| --- | --- | --- |
| Git |390/820/1280| Vide3/3vert ;503→Refreshgitstatusauclavier3/3vert ; branche/cheminlongs390/820verts,1280débordementreproduitdeuxfois. |
| Deployments |390/820/1280| Vide3/3vert aprèsreprise1280 ; échecdéploiementlongsynthétique3/3vert ;503→RetryGET3/3vert. Aucune republication/réparation/run. |
| Domains |390/820/1280| Vide3/3vert aprèsreprise1280 ; domainependingetTXTsynthetiqueslongs3/3vert ;503→RefreshdomainsGET3/3vert. Aucun ajout/vérificationDNS. |
| Integrations |390/820/1280| Catalogue+recherchesansrésultatpuisrestauration3/3vert aprèsreprise1280 ;503→RetryGET3/3vert. Connexions métier nonexercées. |

Les textes de loading ont été observés pendant la réponse retenue et enregistrés dans chaque reçu ; ils ne constituent pas une certification de tous les états asynchrones. La géométrie vérifie le panneau réel (358/771/588px), son scrollWidth et absence de débordementglobal. Le catalogueIntegrations est statique : le scénario n'invente pas une preuve de données connectées longues.

## Défaut Git établi

`git-long/receipt.json` et `git-long-1280-diagnostic/receipt.json` : branche189caractères et chemin long autorisés, panneau587,66px/client588 mais scrollWidth1987. Cartebranche1382px ; Workingtree décalé et coupé. Capture1280-failure.png dans ces dossiers. Le texte de branche `.truncate` ne suffit pas lorsque les tracks grid gardent leur min-content. Mobile/tablette passent grâce aux contraintes compactes déjà présentes.

Contrepreuve DOM UNIQUEMENT, pas un correctif livré :
`.bolt-git-tab > .grid, .bolt-git-tab > .grid > .mx-auto.grid { grid-template-columns: minmax(0,1fr); min-width:0; }`

`git-long-1280-counterproof/receipt.json` ramène scrollWidth à588 avec la même fixture. Proposition au propriétaire : contraindre les deux grilles à une piste minmax(0,1fr), via classes ciblées dans GitTab (`grid-cols-1` et `min-w-0` à confirmer), puis vérifier textes/actions/diff et tousformats. Aucun patchsource préparé/appliqué et aucune affirmation de validation compilée aprèscorrectif.

## Reprises et limites conservées

- Premierbatch parallèle Deploy/Domains/Integrations1280 : aucunGETpanneau au bout de5s, shell «Loading publish»/montage. Chaque reprise1280séquentielle passe avec même seuil. Cause de lenteur nonétablie, ne pas transformer cette absence de reproduction en correction.
- Première recetteGit/Domains503 utilisait regex `Refresh status`, qui ne reconnaît pas les libellés réels `Refresh git status` et `Refresh domains`. Git pouvait ainsi viser un Retry extérieur transitoire ; ces essais ne prouvent pas un défaut de reprise produit. Les recettes `*-recovery-correct-label` utilisent les libellés réels et passent3/3. Traces initiales gardées.
- Le harnais bloque les mutations automatiques de coque aussi ; un statutruntime indisponible visible n'est pas une panneproduction démontrée. Aucun parcours runtime n'est validé ici.
- Aucun changement des assertions de dépôt ni téléchargement d'artefact distant. Pas de revue métier complète du hub et aucune modification des fichiers réservés.

Tous les navigateurs lancés sont fermés dansfinally. Les serveurs du parent restent intacts.
