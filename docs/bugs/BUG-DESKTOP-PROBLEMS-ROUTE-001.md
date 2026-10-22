---
id: BUG-DESKTOP-PROBLEMS-ROUTE-001
---

## Bug

Sur desktop, ouvrir un projet avec `?panel=problems` affiche l'éditeur README au lieu du panneau Problems. Le registre `IDE_WORKSPACE_PANELS` accepte cette route, mais `PROJECT_EDITOR_TOOLS` omet `problems` : le modèle des onglets normalise alors cet outil en `editor`.

La barre d'état desktop n'est pas défectueuse dans cette reproduction : son bouton Problems ouvre volontairement les diagnostics dans le tiroir inférieur, sans changer l'URL ni créer un onglet.

## 📤 Dispatché

☑ 22 octobre 2026 — diagnostic et correctif ciblé préparés dans le lot desktop, sur la base `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`.

## 💻 Codé

☐ — correctif local préparé, non commité et non intégré à main. Ajout de `problems` au modèle des outils et à son catalogue, avec régressions unitaires et navigateur.

## ✅ Testé live

☐ — défaut reproduit sur le build local compilé et attesté ; validation navigateur du build corrigé encore en attente. Aucun résultat de production ni certification mobile/tablette.

## Reproduction et preuves

Le 22 octobre, Chromium système utilise le build local sur `127.0.0.1:5221`, l'API locale sur le port 3017 et PostgreSQL dédié sur le port 55443. Le reçu `/workspace/ux-artifacts/desktop-panels/baseline-receipt.json` atteste la correspondance des 2 306 fichiers du build avec le manifeste `edb558bc` ; son delta vers la base `18745bd0` porte uniquement sur 22 fichiers documentaires.

Le test `tests/e2e/ide-problems-panel.spec.ts` crée une organisation et un projet synthétiques par la vraie API, puis importe un README. Aucune réponse API simulée n'est utilisée.

- Route Problems : échec attendu sur le build de référence, **0 onglet Problems reçu pour 1 attendu** ; la capture montre README dans l'éditeur.
- Barre d'état : succès sur ce même build ; le panneau Problems est visible dans le tiroir inférieur.
- Bilan navigateur de référence : **1 échec et 1 succès**, sans retry. Les preuves définitives sont dans `/workspace/ux-artifacts/desktop-panels/navigation/problems-baseline-final/`, avec le journal adjacent `problems-baseline-final.log`.

Les essais préliminaires comportaient un sélecteur de bouton incorrect, puis une attente d'URL inadaptée au tiroir desktop. Ils sont conservés séparément et ne sont pas comptés comme défauts produit.

## Correctif et validations locales

Le changement produit ajoute une entrée dans chacun de ces fichiers :

- `app/lib/project-editor-layout.ts` : identité `problems` reconnue par le moteur des onglets.
- `app/components/chat/project-editor-tool-catalog.ts` : descripteur Problems dans la catégorie runtime.

Le test de cohérence dans `app/lib/project-editor-layout.spec.ts` compare les outils aux panneaux adressables et vérifie leur conservation après normalisation. Avant correction : **1 échec et 62 succès**. Après correction, modèle, régressions RPL et catalogue : **68/68 succès**. ESLint ciblé et Prettier passent.

Le reçu `/workspace/ux-artifacts/desktop-panels/navigation/problems-fix-receipt.json` conserve les empreintes des quatre fichiers source et test concernés. Ces chemins désignent des preuves locales ; ils ne constituent pas des artefacts publiés ni une preuve CI.

## Validation restante

Attendre le build commun attesté, puis exécuter les deux tests navigateur sur ce build : ouverture par URL, maintien de l'onglet Problems après rechargement et ouverture du tiroir depuis la barre d'état. Conserver les captures après correction et les associer au SHA exact. Le rechargement n'a pas encore été atteint dans le scénario URL rouge.

Aucune modification de BaseChat, des stores, de la sécurité ou des délais et assertions existants. Aucun build, commit, push ou déploiement effectué par ce chantier. La sauvegarde runtime, les fournisseurs externes et l'ensemble des actions du panneau restent hors de cette validation.

### Validation locale du lot desktop — 22 octobre

Build `c382137ad72eeb983b40493e40bc296cd85e61c1`, arbre `f26a295f50a7ddb890f8f5800db457d563a70630` : cinq scénarios ciblés et deux scénarios tactiles passent directement, zéro retry et zéro omission. API et données synthétiques locales, interface compilée ; aucune certification production ni des actions métier non exercées. Voir [recette et limites](desktop-panels-2026-10-22/README.md). Les échecs antérieurs sont conservés.
