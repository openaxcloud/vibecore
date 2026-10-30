---
id: BUG-MOBILE-MORE-FORCED-CLICK-20261030
---

# More options mobile — clic forcé pendant remplacement de coque

📤 Dispatché : ☑ ; 💻 Codé sur main : ☐ ; ✅ Testé live production : ☐.

Date : 2026-10-30. Base produit et build : `a9f8b02b737e775b68a34d29e33124e5662ec63c`.
Statut : diagnostic local et correction ciblée du test ; validation CI/livraison non attestée par cette fiche.

## Défaut observé et portée du changement

Le test `tests/e2e/mobile-device-matrix.spec.ts`, action More options vers la ligne 438, utilisait `click({ force: true })` après avoir vérifié la visibilité. Entre cette assertion et le clic, le démarrage peut remplacer le bouton. Le scénario local peu instrumenté reproduit trois échecs sur quatre profils : Playwright signale « Element is not visible ». Au relevé final, l'ancien nœud est détaché, le nouveau bouton mesure 44 × 44 px et l'attribut clavier est absent. Cela documente une course locale de remplacement ; cela ne prouve pas une disparition CSS du nouveau bouton ni une cause universelle des échecs CI de #866.

Le delta retire uniquement `force: true` pour cette action et ajoute un commentaire expliquant la course. Le locator peut ainsi effectuer ses contrôles d'actionnabilité sur le contrôle vivant. Les assertions de visibilité du menu, son contenu Publish/Settings et les délais restent inchangés. Aucun code produit, bouton, gestionnaire ou garde de handoff n'est modifié par ce correctif.

## Recettes réellement exécutées

Chromium local `/usr/bin/chromium`, composants et CSS compilés réels, API/runtime synthétiques isolés. Les noms de profils désignent de l'émulation, pas des appareils physiques ou Safari.

| Profil             | Viewport   |
| ------------------ | ---------- |
| iphone-se          | 375 × 667  |
| iphone-pro-max     | 430 × 932  |
| android-landscape  | 932 × 430  |
| ipad-mini-portrait | 768 × 1024 |

| Essai                                                        | Résultat                                             | Interprétation limitée                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Clic forcé, CPU ×4, `TRACE=0`, quiet-cpu4                    | 1/4 réussi, 3/4 échoués                              | Ancien nœud détaché au relevé final, nouveau bouton visible, clavier absent               |
| Trace continue initiale, CPU ×1 puis ×4                      | 8/8 réussis                                          | Instrumentation sensible au timing ; ces réussites ne réfutent pas l'intermittence        |
| Clic normal, CPU ×4                                          | 12/12 réussis sur trois exécutions de quatre profils | Contrôles d'actionnabilité conservés                                                      |
| Souris native, CPU ×4                                        | 4/4 réussis                                          | Parcours pointeur natif local                                                             |
| Tap, CPU ×4                                                  | 4/4 réussis                                          | Entrée tactile émulée                                                                     |
| Clic forcé avec événements légers, CPU ×4                    | 4/4 réussis                                          | L'échec forcé n'est pas déterministe                                                      |
| Trois répétitions forcées iphone-se                          | 3/3 réussies                                         | Contrepreuve d'intermittence, pas certification                                           |
| Pression native vérifiée pendant livraison ide-state, CPU ×4 | 4/4 réussies                                         | Vraie cible pointerdown connectée durant 150 ms, détachée après relâchement, menu visible |

Pour la dernière ligne, les champs `actualPressedAfterDown`, `actualPressedDuringHold`, `actualPressedAfterUp` et `actualPressedDetachedAfterRelease` suivent la cible du véritable `pointerdown`. Les champs historiques `detachedDuringPress`/`detachedAfterRelease` suivent un handle antérieur : ils ne sont **pas** la preuve de la garde. Les anciennes recettes `press-across` et `press-target` ne sont pas retenues comme preuve de protection pendant la pression.

Les deux suites existantes `useEditorCompositionHandoff.spec.tsx` et `useEditorCompositionHandoff.focus.spec.tsx` passent : **25/25**, aucun ignoré. Le build du main utilisé pour cette recette a été exécuté avec succès (`BASE.txt`, commande `pnpm run build`, exit 0). Le code produit reste inchangé dans le delta.

## Preuves et reproduction

Dossier : [ui-more-options-evidence-20261030](./ui-more-options-evidence-20261030/README.md). Il contient deux scripts de diagnostic `.cjs` hors découverte des suites, des reçus JSON réduits avec provenance SHA-256, une capture iphone-se d'échec, le résultat unitaire et un manifeste d'intégrité. Les reçus conservent les états utiles mais omettent le transport et les instantanés intermédiaires. Le relevé final ne prétend pas reconstruire chaque instant du clic échoué.

La capture montre l'écran synthétique après échec et la navigation visible ; elle ne suffit pas seule à établir la cause temporelle.

## Limites et étapes restantes

- Aucun test production, backend réel, appareil physique, Safari ou autre moteur validé ici.
- Aucun appel IA payant, mutation de projet client ou nouveau secret/accès.
- Le job interdit `124062762133` n'a pas été consulté ; son refus a été respecté. Aucune attribution de cause précise à ce job ni à tous les échecs de #866.
- Les répétitions `normal-cpu4-2` et `normal-cpu4-3` ajoutent 8/8 réussites aux 4/4 initiales, soit 12/12. Le lint et le typage ciblé E2E sont verts après exécution locale. La CI reste à vérifier sur la tête publiée ; ces recettes locales ne la remplacent pas.
- Maintenir toutes les assertions existantes ; vérifier la tête exacte après publication et suivre la validation normale. Cette fiche n'atteste ni fusion ni déploiement.
