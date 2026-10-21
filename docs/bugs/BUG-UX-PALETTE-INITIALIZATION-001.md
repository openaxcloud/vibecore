---
id: BUG-UX-PALETTE-INITIALIZATION-001
---

# La palette du composeur disparaît au remplacement de la coquille initiale

## 📤 Dispatché

Recette UX sur main fc8a687e + #750 + #753 : disparition observée à 820 px. La sonde locale `design-palette-shell-handoff.spec.ts` maintient le vrai GET ide-state en attente, ouvre la palette, clique Typography puis libère la réponse. La palette reste présente avant la libération ; l'ancien nœud du composeur disparaît ensuite et l'assertion de palette échoue. Trois tentatives échouent. Cette sonde démontre la perte au démontage pour ce scénario, sans attribuer tous les échecs UX à cette cause.

## 💻 Codé

Correctif local : `ComposerToolsProvider` garde l'ouverture du menu, la palette, sa section et son brouillon au-dessus des coquilles. Les scopes projet, workspace et fenêtre réinitialisent ces interactions. Une fermeture explicite reste fermée ; rouvrir une palette abandonnée relit le design enregistré. Les composants UI conservent leurs gestes et contrôles existants.

## ✅ Testé live

Recette navigateur du correctif en attente. Aucune certification production ni résolution de l'ensemble du démarrage IDE revendiquée. Les délais et assertions existants ne sont pas assouplis.

Recette navigateur locale : quatre cas EN/FR, ouvert/fermé, à 820 px passent directement. Ancien nœud réellement retiré, palette ouverte avec section Typographie et brouillon de couleur conservés ; fermeture explicite respectée. Build aced48d + patch166daa38 (commentaire GitHub6314488603), traces `initialization-handoff`. Pas de certification de tous les formats ni de production.

## Diagnostic antérieur conservé depuis #753 cef42091

Les résultats ci-dessous précèdent le correctif #749 ; ils restent historiques.

# La palette du composeur disparaît pendant l’initialisation sur tablette

## 📤 Dispatché

Recette combinée main fc8a687e + #750 e996671 + #753 f06923ff. Dépendance au chantier éditeur/BaseChat ; ne pas modifier ses chemins en parallèle.

## 💻 Codé

Non corrigé. Ne pas remplacer le geste par un force-click ou attendre arbitrairement plus longtemps. La disparition/remontée du composeur pendant la vérification de session est une piste à instrumenter avec le propriétaire de BaseChat, pas une cause démontrée.

## ✅ Testé live

Reproduit localement dans le cas du menu ••• à 820 px : après l’ouverture de Design palette et un appui à l’intérieur, la surface disparaît. La capture DOM montre Checking the active session et Loading E-Code, avec un composeur sans bouton Envoyer. Le même cas passait au premier passage combiné. La couleur du micro est un défaut de synchronisation de test distinct, corrigé séparément sans modifier ce geste.

Voir [la recette et le contexte d’échec](ux-combined-fc8a687e-2026-10-21/README.md). Cette surface reste non certifiée ; aucune validation production.
