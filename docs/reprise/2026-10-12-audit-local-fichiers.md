# Audit local ciblé — utilisateur et fichiers IDE, 12 octobre 2026

Base : main `30fb463710f2c75429e29cae8aefb76bfc5194d0`. Branche propre à cette tâche : `codex/audit-local-files-20261012`. Aucune publication ni PR avant relecture du parent. Aucun changement de dérogation ou des branches des autres sessions.

## Matrice des mesures

| Action | Résultat réel local | Preuve / limite |
| --- | --- | --- |
| Connexion par formulaire | Réussie, arrivée `/dashboard` | Compte synthétique créé par l'API, puis saisie email/mot de passe dans Chromium |
| Création vide via API | Réussie ; fichiers de départ persistés | POST organisation/projets ; aucune génération |
| Création depuis un modèle dans l'interface | Réussie ; arrivée dans l'IDE du modèle React SaaS | Clic réel « Use template », capture `template.png` ; route `from-template`, aucun modèle IA appelé |
| Création par prompt | Non exercée | Formulaire exigeant au moins trois mots ; génération exclue du périmètre |
| Import local de deux fichiers ZIP | Réussi | API réelle, noms et tailles restitués par GET fichiers |
| Bibliothèque responsive | Affichée à 390, 768, 1440 px | Captures `files-390.png`, `files-768.png`, `files-1440.png` inspectées |
| Ouverture `audit.txt` | Contenu initial affiché ; **deux onglets pour un clic** | Reproduit avec et sans redimensionnement ; contre-épreuve automatisée rouge avant patch |
| Modification du texte puis Save | Échec explicite attendu sans runtime ; texte modifié conservé dans le buffer avec marque non enregistré | `save-failure.png` inspectée ; toast erreur, aucun succès affiché |
| Création/enregistrement de fichier via runtime, preview | Bloqués | Runtime distant indisponible, aucun gestionnaire configuré ; pas de succès simulé |
| Stockage ZIP, modification et relecture API | Octets originaux puis modifiés vérifiés exactement, révision changée | `storage-roundtrip.json` ; ceci ne valide pas Save dans l’IDE |
| Export après échec Save | Octets originaux conservés exactement | ZIP réel relu et comparé, `persistence-final2.log` |
| Réouverture IDE et sélection du fichier | Non validée : contenu README affiché sous le chemin audit.txt | Capture `reopen-actual.png` ; même symptôme que le défaut Monaco à froid |

L'inspection source distingue les routes de stockage local (import/export ZIP) des mutations depuis l'éditeur, qui exigent un runtime. L'affichage du contenu importé est prouvé, mais il ne suffit pas à déclarer la sauvegarde IDE fonctionnelle.

## Correctif borné

Premier défaut confirmé : [onglet générique doublonné](../bugs/BUG-IDE-ONGLET-GENERIQUE-DOUBLON-001.md). `BaseChat.openWorkspacePanel` délègue l'ouverture au moteur existant `openTabInPane`. Aucune assertion assouplie ; test E2E ajouté couvrant première ouverture, clic répété et remplacement d'un preview.

## Environnement et preuves

Une seule pile Compose locale : pgvector/pgvector:pg16, redis:7-alpine, axllent/mailpit:v1.24. Mémoire avant démarrage : environ 1,2 Gio utilisés, 16 Gio de plafond cgroup. Healthcheck Mailpit local avec proxy désactivé uniquement pour la requête loopback, conformément à l'autorisation antérieure ; aucun réglage réseau global modifié.

Installation exacte `pnpm@9.14.4 install --frozen-lockfile --ignore-scripts`, store existant ; aucun changement de lockfile. Node 24.19.0, au lieu de Node 22 CI. Build `VITE_RUNTIME_MODE=remote-kubernetes`, API et web exclusivement loopback, aucun secret fournisseur ni gestionnaire de workspace configuré. Requêtes runtime du navigateur interrompues ; aucun retour runtime positif fabriqué, aucun modèle ni ressource cloud facturée.

Navigateur système Chromium 154.0.8037.57 : téléchargement du navigateur Playwright attendu toujours bloqué dans cette configuration, sans contournement. Ces résultats ne certifient donc pas Chromium CI 147, Safari/iPhone ni la production. Le test ajouté force explicitement le profil desktop ; les captures aux trois largeurs sont une mesure locale distincte.

Preuves temporaires locales : `/tmp/files-audit-evidence/` ; harnais `/tmp/files-audit-harness/`. Elles ne contiennent pas de token d'authentification dans le rapport. La capture de mémoire avant patch est antérieure à sa mise à jour après clic et n'établit pas l'état persistant après ouverture.

## Validation

- Build du main avant modification : réussi.
- Contre-épreuve avant patch : échec attendu, deux onglets au lieu d'un.
- Moteur de layout : 37 tests unitaires réussis.
- Build corrigé : réussi.
- Première série corrigée : 2/3 verts ; l'autre exécution échoue AVANT le compte d'onglets, car Monaco affiche le README sous le chemin audit.txt. Échec conservé, aucun retry.
- Test borné avec précondition observable « README initial effectivement rendu » : 3/3 verts, un worker, zéro retry (25,3 s). Première ouverture, clic répété et remplacement du preview contrôlés ; capture corrigée inspectée.
- Typecheck de l'application web (`tsc -p tsconfig.web.json --noEmit`) : réussi. Pas de typecheck des autres workspaces, hors périmètre.
- ESLint des deux fichiers de code concernés, Prettier et `git diff --check` : réussis.
- Relecture indépendante : pas d'objection au patch produit ; périmètre desktop et précondition de chargement explicités. Aucune validation CI ou production.

## Anomalie supplémentaire conservée

[Contenu Monaco initial incohérent](../bugs/BUG-IDE-MONACO-CONTENU-INITIAL-001.md), non corrigé dans ce patch borné. La trace confirme l'état sélectionné audit.txt, alors que l'éditeur affiche le README. La même incohérence bloque la validation de réouverture. Attendre le README initial avant le test de duplication ne constitue pas un correctif de ce défaut.

Les autres panneaux projet, navigation retour exhaustive et parcours de sauvegarde avec runtime fonctionnel n'ont pas été validés. L'audit s'arrête au premier correctif confirmé et aux limites documentées, sans annoncer la plateforme achevée.

Le correctif est conservé dans un commit local de la branche dédiée, non poussé et sans PR, pour relecture du parent. Les captures et traces restent locales.

Fin de session : API/web et les trois conteneurs arrêtés, ports locaux contrôlés fermés ; volumes et preuves conservés.

Relecture indépendante finale : avis favorable pour soumission au parent, aucune objection bloquante au lot borné (patch, test et rapport relus).
