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
