---
id: BUG-IDE-LOGS-STREAM-HANDOFF-20261029
---

# Logs perd le flux System choisi lors du remplacement de surface

## Preuve et correction

Base locale `e03b3f856` : System=true/3lignes, libérationGETide-state, ancien DOM détaché puis System=false/0ligne pendant5s. Correction : contrôles de vue conservés dans état de route isolé projet/panneau/fenêtre, fallback local horsprovider/pane ; aucun log, secret ou credential persisté. Le retryCI historique ligne108 était avantClear ; mécanisme local prouvé, attribution exacte de ce retry non prouvée.

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic reproduit | ☑ Validé localement, CI après publication attendue | ☐ Non fusionné | ☐ Non testé |

## Verdict local final

Deux recettes compilées1440/1024 réussissent dès premierpassage : Systemtrue/3lignes avant/après détachement et aprèsRetry SANSresélection ; Clear0, Reload retardéoccupé puis3. Zéro erreurJS. Build client/SSR, typage officiel complet, lint0/52préexistants,42tests/5fichiers dont6Logs,16inventaire,i18nvalidate et typageE2E réussis. Revue indépendante favorable :5exécutés,6ecasfallback relu. Totaux recouvrants non additionnés.

Ancien tsc directOOM134 conservé, pas verdict officiel. E2Ecomplet avec backend réel non exécuté localement ; aucune production. [Reçus/scripts/limites](ui-logs-handoff-evidence-20261029/README.md). Les preuves rouges restent conservées.

Menus390/1180 restent distincts et non reproduits :10cycles verts, deux erreurs de harnais Editorabsent conservées. Pas de résolution déduite de CI sansretry. Aucun artefact834/SBOM, backend client ou certification générale ;31/31 reste partiel.
