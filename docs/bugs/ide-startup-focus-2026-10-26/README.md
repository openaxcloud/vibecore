# Recette locale — focus et position Monaco au démarrage

Le vrai GET ide-state est retenu puis relâché. Il remplace l’interface temporaire BaseChat par ChatImpl. Les comptes, projets et fichiers sont des fixtures synthétiques créées via une API locale réelle et une base isolée. Les écritures depuis le navigateur et les requêtes fournisseurs sont bloquées.

## Résultats

- Baseline dbc56e6d6 : focus perdu vers BODY après remplacement ; le déplacement volontaire vers Library ne doit pas être annulé.
- Première correction : focus revenu, mais End avant remplacement puis frappe produisait `handoff# Keyboard fixture`. Ce résultat rouge a bloqué la validation.
- Correction finale : `# Keyboard fixturehandoff` obtenu exactement, sans refocalisation du test. Focus extérieur respecté, modèle inchangé dans ce cas.
- 13 scénarios navigateur réussis sans retry : 11 standards (2 nouveaux, 8 menu/recherche/focus mobile, 1 sortie clavier Monaco) et 2 nouveaux en Chromium natif 200 %. Écran physique 2880×1800, viewport CSS 1440×856,5.
- 51 tests package, 20 tests focus app/garde AST et 16 tests index passent. Typechecks package/web, build package strict et build application réussis ; lint ciblé, format et contrôle des secrets vérifiés.
- Revue indépendante favorable après correction des cas StrictMode, position et modèle partagé divergent. Aucun autofocus global ajouté.

## Preuves et limites

`final-behavior-evidence.json` conserve focus, modèle avant/après et métriques du zoom. `final-receipt.json` contient les empreintes des rapports originaux et le nettoyage. Les rapports complets, manifestes et traces restent dans `/tmp/ide-startup-focus-qa/` ; ces chemins sont locaux et ne désignent pas des artefacts CI publiés. Les captures avant/après sont jointes.

La restitution est limitée au même panneau/document et à un contenu inchangé. Les interactions pendant le chargement l’annulent ; aucune mise en tampon des frappes pendant cet intervalle n’est revendiquée. Aucun test production authentifiée, Safari matériel ou fournisseur. Stack isolée arrêtée, service concurrent préservé.

Lot local uniquement : aucun push, PR, fusion ni déploiement. Le commit dbc56e6d6 reste dans l’historique et #799 reste inchangée.
