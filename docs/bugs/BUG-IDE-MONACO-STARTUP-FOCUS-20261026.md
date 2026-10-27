---
id: BUG-IDE-MONACO-STARTUP-FOCUS-20261026
---

## Bug

Pendant le démarrage, un éditeur Monaco focalisé peut être remplacé par une instance non focalisée avant le premier Tab. La trace locale initiale établit le passage du contexte clavier 2 focalisé au contexte 3 non focalisé ; la sonde contrôlée suivante identifie le remplacement complet de BaseChat lorsque le vrai GET ide-state est libéré : interface temporaire sans historique vers ChatImpl prêt, conteneur et éditeur remplacés, langue anglaise inchangée. Ce défaut est distinct de la contribution native de sortie d'indentation corrigée dans dbc56e6d6.

## 📤 Dispatché

26/10/2026 — investigation et correction locales autorisées, sans publication avant coordination. Préserver le menu inférieur et les déplacements volontaires du focus vers un autre contrôle.

## 💻 Codé

☐ — correctif local validé, sans publication : transmettre uniquement l’intention de focus lors du démontage de BaseChat, avec identité panneau/fichier, portée projet/espace/fenêtre et annulation après interaction extérieure. Aucun autofocus global ajouté.

## ✅ Testé live

☐ — aucune validation production ou Safari matériel. 51 tests du package et 20 tests app/garde AST passent ; typechecks package/web et build package passent. Revue indépendante sans blocage identifié, après régression StrictMode reproduite puis corrigée. Recette finale sur application compilée et API locales, fixtures isolées : 13/13 verts sans retry (11 standards et 2 en zoom Chromium natif 200 %, écran physique 2880×1800, largeur CSS 1440). End avant remplacement puis frappe après donnent exactement `# Keyboard fixturehandoff`, sans refocalisation du test ; déplacement volontaire vers Library respecté, menu mobile et sortie clavier Monaco préservés. Captures avant/après dans `ide-startup-focus-2026-10-26/`. Sur le build témoin dbc56e6d6 : scénario focus éditeur rouge attendu, déplacement volontaire vers Library vert (pas de vol du focus). Données synthétiques isolées uniquement ; aucun accès fournisseur ni publication client.

## Garde sur la position de frappe

La première recette corrigée a détecté une restitution de focus avec curseur revenu au début : après End sur la première ligne, la frappe produisait `handoff# Keyboard fixture` au lieu de `# Keyboard fixturehandoff`. Ce résultat a bloqué la validation du correctif. La position de vue est maintenant transmise temporairement et restaurée avant le focus, seulement pour un panneau/fichier, une URI, un contenu de modèle et la valeur courante des props identiques. En cas de divergence, aucune reprise automatique de frappe.

## Portée de la garantie

La restitution concerne la position et le focus lorsque le nouvel éditeur est prêt. Les frappes pendant l’intervalle asynchrone ne sont pas mises en tampon ; une interaction pendant cet intervalle annule la restitution pour respecter la nouvelle intention de l’utilisateur. Aucune conservation de toutes les frappes continues pendant le chargement n’est revendiquée.
