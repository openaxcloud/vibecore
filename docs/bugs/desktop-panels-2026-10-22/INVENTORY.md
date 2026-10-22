# Inventaire desktop des panneaux — 22 octobre 2026

Base inspectée : `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`, branche `fix/desktop-panels-audit-20261022`. Inventaire statique uniquement : aucun navigateur, test, endpoint ou geste produit exécuté pour ce document. **Tous les panneaux sont NON TESTÉ pour ce nouveau lot ; aucun panneau entièrement certifié.**

`AGENTS.md` lu. La seule compétence locale disponible, `.agents/skills/commit-helper/SKILL.md`, a été consultée ; elle ne s’applique pas à cette mission sans commit. Aucun produit, test ou index modifié. Réserves #765 : AgentPatchReviewQueue, stores files/workbench, runtime write, merge JSON/i18n. Aucune action #764.

## Périmètre exhaustif du registre

Source canonique : `app/lib/ide/panel-registry.ts` : **31 clés adressables = Agent + 5 surfaces workspace de base + 25 panneaux de gestion**. `files` est à la fois surface droite et workspace, comptée une seule fois. Le dock Agent n’est pas un onglet workspace. `panel-meta.ts` est une table d’icônes, pas un second registre de panneaux. Le menu bas mobile doit être conservé.

Dans le tableau, les actions sont un repérage du code, **pas une preuve d’accessibilité ou d’effet effectif**. Les actions conditionnelles dépendent des données, droits et runtime. Les recettes indiquées sont des candidats présents dans le dépôt, non exécutés ici ; leur présence ne vaut ni couverture complète ni validation réelle. Les noms E2E abrégés désignent `tests/e2e/<nom>.spec.ts` ; les tests `api.*` sont dans `app/routes/`, les composants dans BaseChat sauf chemin explicite. Les familles d’actions doivent être développées en cas atomiques lors de l’ouverture réelle de chaque panneau.

| Clé canonique | Composant / surface statique | Actions à inventorier par gestes | Recettes existantes à examiner | Risques / priorité | Statut lot |
| --- | --- | --- | --- | --- | --- |
| `agent` | Dock Agent / BaseChat, messages et compositeur | Saisie, envoi/arrêt, mode Agent/Économique, pièces jointes, menus et historique | agent-panel-states; agent-header-menu-keyboard; agent-menu-shell-handoff | P0 : focus, menu pendant hydratation, chargement et interruption ; aucune requête fournisseur réelle implicite | **NON TESTÉ** |
| `editor` | EditorAdapter / ProjectEditorToolbar / EditorHistoryOverlay | Sélection fichier, édition, sauvegarde, historique, changement de panneau | ide-file-tab-identity; ide-floating-file-tabs; ide-mobile-file-restore | P0 : association document/onglet, contenu non sauvegardé, actualisation même chemin ; fichiers réservés #765 | **NON TESTÉ** |
| `preview` | Preview | Navigation, rechargement, dimensions, outils et journaux Webview | preview-runtime; apercu-demarrage-coupures; rpl-ide-panels-proof | P0 : contenu réel, cadre blanc, croix/journaux et défilement après split | **NON TESTÉ** |
| `files` | ProjectFilesTool | Arbre, ouvrir/rechercher, menus fichiers, création/renommage/suppression selon droits | ide-mobile-file-restore; ide-file-tab-identity; rpl-ide-panels-proof | P0 : ne pas confondre ouverture et persistance ; stores/runtime réservés #765 | **NON TESTÉ** |
| `search` | Search (workbench) | Saisie, résultats, navigation vers occurrence, remplacement si proposé | rpl-ide-panels-proof; ide-mobile-chrome | P1 : clavier, résultat absent, fichier correspondant et annulation | **NON TESTÉ** |
| `locks` | LockManager | Lister et gérer les verrous proposés selon droits | ide-panel-routing; ide-mobile-chrome | P1 : états vide/erreur, conflit et reprise ; pas de changement de sécurité réel | **NON TESTÉ** |
| `overview` | ProjectOverviewPanel | Cartes, métriques, liens de navigation | ProjectOverviewPanel.spec.tsx; ide-panel-smoke | P1 : valeurs absentes, états de chargement, destination des liens | **NON TESTÉ** |
| `studio` | ProjectAgentStudioPanel | Onglets studio, données/consensus, rechargement, détails disponibles | ide-mobile-chrome; rpl-ide-panels-proof | P0 : « Mes données », titre/contenu et données API réellement présentes | **NON TESTÉ** |
| `problems` | ProjectProblemsPanel | Filtrer/lire diagnostics et ouvrir le fichier concerné | rpl-ide-panels-proof; ide-mobile-chrome | P1 : erreurs longues, liste vide et destination fichier | **NON TESTÉ** |
| `database` | ProjectDatabasePanel / DatabaseWorkbench | Connexion proposée, tables, requêtes et résultats, rechargement | database-loading-context; ide-db-setup-guard; ide-mobile-chrome | P0 : DATABASE_URL, connexion et table réelle ; lecture seule avant mutation SQL isolée autorisée | **NON TESTÉ** |
| `object-storage` | ProjectObjectStoragePanel | Navigation objets, actions de transfert/gestion exposées | api.projects.$projectId.ide-panel.object-storage.action.spec.ts; audit-ide-panels.mjs | P1 : progression, annulation, liste après action ; aucun objet réel supprimé | **NON TESTÉ** |
| `packages` | ProjectPackagesPanel | Installer paquet/tous, audit, dépendances obsolètes | audit-ide-panels.mjs; ide-mobile-chrome | P1 : progression et échec installation ; ne pas assimiler clic à installation effective | **NON TESTÉ** |
| `skills` | ProjectSkillsPanel | Liste et gestion des compétences proposées | api.projects.$projectId.ide-panel.skills.action.spec.ts; ide-panel-api-contract | P1 : activation/retour, liste vide ; effets du runtime à vérifier | **NON TESTÉ** |
| `monitoring` | ProjectMonitoringPanel | Actualiser, métriques, activité et chronologie déploiements | ide-mobile-chrome; rpl-ide-panels-proof | P1 : absence de données, chargement, graphes et erreurs | **NON TESTÉ** |
| `ports` | ProjectPortsPanel | Lister, ouvrir, port primaire, visibilité | api.projects.$projectId.ide-panel.terminal-ports-state.spec.ts; ide-mobile-chrome | P1 : lien réel et état après retour ; visibilité réservée à fixtures autorisées | **NON TESTÉ** |
| `extensions` | ProjectExtensionsPanel | Lister et actions installation/activation exposées | api.projects.$projectId.ide-panel.extensions.action.spec.ts; ide-mobile-chrome | P1 : progression, erreur et persistance ; permissions à respecter | **NON TESTÉ** |
| `integrations` | ProjectIntegrationsPanel | Connecteurs, synchronisation, webhooks, clés API, streams | api.projects.$projectId.ide-panel.integrations-sync.spec.ts; audit-ide-panels.mjs | P1 : tester lecture/annulation ; aucun nouveau credential ou accès permanent | **NON TESTÉ** |
| `workflows` | ProjectWorkflowsPanel | Configurations, lancement et lecture exécutions | api.projects.$projectId.ide-panel.workflows-run-button.spec.ts; ide-mobile-chrome | P1 : prévention double envoi, état terminal et journaux réels | **NON TESTÉ** |
| `debugger` | ProjectDebuggerPanel | Démarrer/arrêter session, configuration, points d’arrêt, watches | ide-mobile-chrome; audit-ide-panels.mjs | P1 : états sans runtime, focus formulaires et effet réel des actions | **NON TESTÉ** |
| `deployments` | ProjectDeploymentsPanel | Configuration publication, déclenchement et actions déploiement | deploiement-sans-republier; publier-pied-colle-barre; dashboard-publication-readiness | P0 : bouton accessible, requête/état final distingués ; ne pas relancer livraison active | **NON TESTÉ** |
| `security` | ProjectSecurityPanel | Scan, résultats, export rapport, réglages et actions vulnérabilités | securite-titres-lisibles; ide-mobile-chrome | P0 : lecture/erreur/annulation ; modifications sécurité soumises à confirmation | **NON TESTÉ** |
| `env` | ProjectEnvPanel | Lire, filtrer, ajouter/modifier/supprimer variable par scope | audit-ide-panels.mjs; ide-panel-api-contract | P1 : isolation, masquage et relecture ; aucune valeur secrète dans preuve | **NON TESTÉ** |
| `secrets` | ProjectSecretsPanel (chat) | Liste, ajout/modification, révélation confirmée et suppression proposées | audit-ide-panels.mjs; ide-panel-api-contract | P1 : masquage, annulation et focus ; uniquement valeurs synthétiques autorisées | **NON TESTÉ** |
| `git` | GitTab | Statut/diff, branches, commit et parcours PR proposés | git-commit-reel; ide-mobile-chrome | P0 : source PR absente, données API/BFF, retour ; pas de publication distante implicite | **NON TESTÉ** |
| `activity` | ProjectActivityPanel | Filtrer et actualiser activité, ouvrir détails | ide-mobile-chrome; ide-panel-smoke | P1 : ordre, absence de données, filtres et chargement | **NON TESTÉ** |
| `terminal` | ProjectInteractiveTerminalPanel / ProjectTerminalPanel | Session interactive, scripts/processus, actions workspace et SSH proposées | ide-mobile-chrome; api.projects.$projectId.ide-panel.terminal-env-writes.spec.ts | P0 : saisir une commande inoffensive et constater sortie réelle ; aucun nouveau SSH/credential | **NON TESTÉ** |
| `logs` | ProjectLogsPanel | Recherche/regex, niveaux, suivi direct, split et commandes proposées | ide-mobile-chrome; rpl-ide-panels-proof | P0 : fermeture, lignes longues, défilement et focus ; distinguer logs de Webview | **NON TESTÉ** |
| `collaborators` | Branche ProjectIdePanelContent | Présences, invitations, permissions terminal, commentaires, partage | ide-collaborateurs-bureau; audit-ide-panels.mjs | P1 : lecture/annulation d’abord ; pas d’invitation réelle ni changement de droits sans autorisation | **NON TESTÉ** |
| `domains` | ProjectDomainsPanel | Lire domaine, vérifier/configurer | audit-ide-panels.mjs; ide-panel-api-contract | P1 : validation et retour ; aucun achat ni DNS/ressource réel modifié | **NON TESTÉ** |
| `snapshots` | Branche ProjectIdePanelContent + Dialog | Créer, lister, ouvrir confirmation restauration, annuler/Escape | snapshot-cancel-focus; api.projects.$projectId.ide-panel.snapshot-restore.action.spec.ts | P0 : focus visible, ProductTour, quota/erreur ; pas de restauration production | **NON TESTÉ** |
| `settings` | ProjectSettingsPanel | Profil, préférences, raccourcis, notifications ; formulaires compte/IA/sessions | dashboard; ide-panel-api-contract; audit-ide-panels.mjs | P0 : montage, annulation/validation, persistance préférences ; actions compte/credential/sécurité hors autorisation | **NON TESTÉ** |

## Navigation commune et compatibilité des liens

Toutes les clés s’adressent par `/projects/<projet>/ide?panel=<clé>`. Vérifier URL directe, rechargement, ouverture depuis rail/palette, sélection, re-clic, fermeture, menu contextuel, épinglage/désépinglage, split/déplacement, fenêtre flottante/docking et Retour/Avance avec document et sélection cohérents. Une liste visible ou une capture ne valide pas ces gestes.

Alias historiques à préserver, sans en faire de nouveaux panneaux : `chat/actions/assistant→agent`, `deploy/publishing→deployments`, `debug/developer→debugger`, `multiplayer/collaboration/collaborate→collaborators`, `checkpoints→snapshots`, `kv-store→database`, `storage/app-storage→object-storage`, `console/shell→terminal`, `history→activity`, `auth→settings`, `web→preview`. `tools` et les clés `MOBILE_TOOL_ACTIONS` sont des outils/gestes non adressables. Une clé inconnue doit être distinguée d’un alias ; ne pas déduire une suppression de doublon de libellés proches.

Hôtes à inspecter : `BaseChat.tsx` (`ProjectIdeServicePanel`, `ProjectIdeApiServicePanel`, `ProjectIdePanelContent`, `renderWorkspacePanel`), `PanelPrimitives.tsx`, `FloatingPaneFrame.tsx`, `Dialog`, palette et `ProductTour`. Chargement/skeleton, frontière d’erreur/reprise, vide, erreur et bouton occupé doivent être observés pour chaque surface asynchrone ; aucun de ces mécanismes n’est certifié par cet inventaire.

Recettes transversales repérées : `ide-panel-routing`, `ide-panel-smoke`, `ide-panel-api-contract`, `rpl-ide-panels-proof`, `ide-mobile-chrome`, `ide-floating-viewport`, `ide-floating-file-tabs`, `ide-palette-handoff`, `responsive-ide`. `scripts/audit-ide-panels.mjs` et `scripts/validate-ide-panel-audit-report.mjs` existent. `docs/IDE_PANEL_AUDIT.md` décrit un audit historique 81 contrôles ; ses chiffres ne doivent pas être transférés au présent SHA. Les mocks/interceptions, quotas, droits et effets externes de chaque recette doivent être lus avant exécution. Un test de rendu ou de contrat BFF ne certifie pas une action réelle bout en bout.

## Quatre intermittences CI connues sur cette base

Source de coordination : reçu expurgé `ci-main-18745bd/flaky-failures-redacted.json` (artefact local, non recopié ici). Ce sont des succès après retry, pas des défauts résolus. Les cas tablette restent des risques de navigation commune, pas des reproductions desktop.

| Cas | Observation exacte | Résultat historique | Statut lot |
| --- | --- | --- | --- |
| `dashboard.spec.ts:1252` → assertion1242 appelée1314 | Shell IDE Settings absent après deux navigations/60s ; assertion couleur non atteinte | Réussit retry1 | NON TESTÉ |
| `ide-mobile-file-restore.spec.ts:513`,768px →543 | `.cm-content` absent pendant5s après Retour | Initial10,5s rouge, retry1 7,8s vert | NON TESTÉ |
| `ide-mobile-file-restore.spec.ts:561`,768px →621 | README temporaire attendu ; contenu projet B puis élément absent pendant5s après Retour | Initial14,5s rouge, retry1 13,7s vert | NON TESTÉ |
| `rpl-ide-panels-proof.spec.ts:408` →488 | Après Retour, URL reste deployments au lieu de preview pendant5s ; sélection non encore vérifiée | Initial11,9s et retry1 18,2s rouges ; retry2 8s vert | NON TESTÉ |

Le dernier cas a une fenêtre à instrumenter : l’URL deployments était déjà vraie avant le clic annulant Preview ; sélection synchrone et requestfailed(Preview) ne prouvent pas la fin de la navigation de remplacement. Observer clés/index historiques, push/replace/pop, destinations appliquées/en attente et durées réseau avant d’attribuer la cause. Aucun délai à rallonger, assertion à réduire ou retry à considérer comme résolution.

Autres limites conservées : disparition intermittente de palette globale pendant préparation (cause non établie) ; ancienne incohérence B→A non expliquée par un vert isolé ; tests flottants avec interception de runtime/sauvegarde ne certifiant pas la persistance distante. Ne pas confondre avec la panne du projet réel utilisateur non diagnostiquée.

## Ordre concret proposé au chantier principal

1. **P0 navigation et montage** : Settings à froid puis aller/retour, documents A→B→A, Preview déplacé puis navigation interrompue. Instrumenter sans changer les assertions ; préserver toute preuve rouge.
2. **P0 actions visibles et menus** : Agent clavier/souris, menu onglets, fermeture Logs/Webview après split, palette, dialogues Snapshot/annulation et ProductTour. Tester focus visible, Tab/Shift+Tab/Escape, clic extérieur, scroll ; captures avant/après et effet DOM/API distincts.
3. **P0 panneaux dépendant de données** : Git/Sécurité, Database et Studio. Enregistrer requête/réponse/état affiché et action ; séparer absence de données, 429/code quota, erreur serveur, chargement et disposition.
4. **P1 couverture des 31 surfaces** : chaque famille restante avec un chemin heureux autorisé et les états vide/erreur/annulation ; effets persistants revérifiés après réouverture/rechargement quand pertinent. Opérations destructives, accès nouveaux, sécurité et publication externe restent soumises aux autorisations applicables.

Banc proposé : build exact attesté, sessions et données synthétiques locales isolées, desktop étroit et large, zoom/clavier, thèmes sombre/clair, FR/EN. À chaque action ajouter SHA/arbre/build, configuration, préconditions, geste, effet attendu/observé, requête corrélée expurgée si pertinente, durée/verdict/retry/skip, capture et limite. Ce plan n’est pas une recette déjà effectuée et ne remplace pas les validations tablette/mobile.
