---
id: BUG-IDE-GLOBAL-PALETTE-HANDOFF-001
---

# Palette globale disparue entre ouverture et saisie

## 📤 Dispatché

22 octobre 2026 : deux disparitions observées pendant la préparation de recettes de navigation de #763. Investigation ouverte ; ne pas attribuer ces erreurs aux reçus de navigation sans preuve. Le terme « handoff » de l’identifiant désigne une piste à vérifier, pas une cause établie.

## 💻 Codé

Non corrigé. Aucun correctif de palette livré dans ce lot. Pour isoler les recettes de déplacement, la préparation ultérieure ouvre Publish avec le bouton réel `ide-dock-deployments` au lieu de la palette ; cela ne corrige ni ne clôt cette fiche.

## ✅ Testé live

Reproductions locales Chromium, projets synthétiques, 22 octobre à 07:29:02 et 07:32:37 UTC : le clic sur All tools ouvre la palette et l’assertion de visibilité de `project-command-palette-search` passe. Le remplissage suivant ne retrouve plus le champ et termine au budget existant de 90 secondes, avant le geste de déplacement visé par le test. Le premier rapport contient cinq autres cas réussis et cette préparation échouée ; le second contient cette seule préparation échouée. Aucun retry ou skip dans ces exécutions.

Cause inconnue. La palette globale est portée par des `useState` locaux de `BaseChat`, contrairement aux palettes par panneau gérées par `IdePaletteProvider`. Le remplacement possible de `PendingComposerShell` par `ChatImpl` est une hypothèse à instrumenter ; aucun événement de remontage ni fermeture externe n’a encore été corrélé à ces erreurs. Il faut conserver les événements de montage, les gestes et l’état de la palette pour établir la cause avant correction. Aucune certification production.

Preuves : [navigation-echo](./ux-followup-2026-10-21/main-18cf-docking/navigation-echo/README.md), rapports `navigation-first-state-id.json` et `palette-preparation-second-red.json` avec empreintes des originaux locaux. Corps et en-têtes réseau, sessions et cookies exclus.

## Nouveau lot desktop — reproduction contrôlée

Base `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`, produit compilé identique au build attesté `edb558bc`. À1440×900, la vraie requête GET ide-state est retenue puis continuée sans réponse simulée : All tools ouvre la palette, la recherche Database est saisie, puis le témoin DOM de la coque disparaît et le champ de recherche disparaît pendant les5s de l’assertion, sans geste de fermeture. Captures avant/après inspectées. Le cas1024 a échoué à sa préparation par rail absent et ne prouve pas ce défaut à cette largeur ; la palette après montage passe clavier aux deux largeurs.

Correctif local en cours dans le fournisseur de palette déjà porté par la route : état global partagé entre coques, remis à zéro à la sortie de route ou au changement projet/fenêtre. Aucun changement au flux de patches #765. Pas encore de recette verte du nouveau build, pas de livraison revendiquée.

### Contre-épreuve du premier correctif — 22 octobre

Le build local `4f8e8b334` conserve la palette et sa recherche aux deux largeurs. Le parcours 1440 px passe entièrement. À 1024 px, Échap ferme la palette mais ne rend pas le focus au bouton : l’instrumentation observe que le bouton compact est absent lors du premier effet de la coque (`querySelector` renvoie null), puis un appel `focus` cible le champ de palette détaché. Le correctif suivant conserve la référence d’origine et résout le bouton équivalent lors de la fermeture. Assertion de focus et délai de 5 s inchangés ; nouvelle validation compilée requise.

### Validation locale du lot desktop — 22 octobre

Build `c382137ad72eeb983b40493e40bc296cd85e61c1`, arbre `f26a295f50a7ddb890f8f5800db457d563a70630` : cinq scénarios ciblés et deux scénarios tactiles passent directement, zéro retry et zéro omission. API et données synthétiques locales, interface compilée ; aucune certification production ni des actions métier non exercées. Voir [recette et limites](desktop-panels-2026-10-22/README.md). Les échecs antérieurs sont conservés.

### Revue : ouverture répétée au clavier — 22 octobre

Contre-épreuve à 1440 et 1024 px : déclencheur focalisé, Ctrl+Shift+P, saisie, Ctrl+Shift+P répété, Échap. La palette se ferme mais le focus reste sur body au lieu du déclencheur. Le symptôme est reproduit sur le baseline main187 et sur le build c382137ad : défaut préexistant, pas nouvelle régression démontrée. À 1024 px, tenter de cliquer le déclencheur sous le fond modal était une erreur de recette conservée séparément ; aucun clic forcé.

Correctif limité à openCommandPalette : conserver la cible de retour tant que la palette est ouverte. Six nouveaux cas couvrent répétition clavier, pointeur/cycle modal compact et navigation Database puis Retour avec palette ouverte. Les deux anciens tests restent inchangés. Validation compilée de cette correction encore en attente.

Sur le build d6c554ac2, les huit cas de palette et les deux cas Problems passent directement. Webview n’a pas été atteint : sa onzième inscription en 52 s répond HTTP 429 (plafond local 10/min). Ce rouge de préparation est conservé. Les six nouveaux tests utilisent désormais une identité réelle synthétique par largeur et trois projets distincts, chaque cas gardant un contexte navigateur neuf ; sept inscriptions attendues pour les onze cas sans redémarrage de worker. Aucune limite, assertion ou durée modifiée.

Sur `2a1c2bc3a843a8b8b97514d211170aebf97ac0ac` (arbre `59ed252fc5918f62671edc94395ef9fbbce173c7`), les onze scénarios ciblés et les deux tactiles passent directement. La comparaison complète des sources avec Git et l’asset servi sont joints dans la recette. Ce verdict local ne constitue ni certification Safari ni validation de toutes les actions métier.

### Intégration main 5de3fac6 et garde de montage

La CI d873 a révélé une garde unitaire rouge : le nouveau beforeAll imbriqué était extrait jusqu'à la fin du describe (3 594 caractères) et conservait implicitement le budget par défaut. Rouge reproduit localement, 1 échec et 5 succès. La préparation commune est remontée dans un describe de premier niveau ; son budget existant de 30 000 ms est explicite. La garde et son seuil restent inchangés, les six gestes/assertions et les deux anciens handoffs sont conservés. Garde corrigée : 6/6 verts. Le merge de main 5de3fac6 conserve AgentPatchReviewQueue et les gardes de propositions ; index régénéré en union à 475 fiches. Nouvelle compilation et recette combinée requises, aucun vert précédent transféré.

Validation de l’assemblage `838684f0` : 23/23 E2E directs, zéro retry/omission, 10 018 unitaires réussis/7 skips explicites ; build, typage et hooks verts. La CI de la tête publiée reste une vérification distincte obligatoire. Voir la recette main767-combined ; les échecs précédents ne sont pas supprimés.
