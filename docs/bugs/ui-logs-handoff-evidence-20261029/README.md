# Logs : conservation des contrôles au remplacement — verdict local final

Branche `diag/ide-logs-menu-847-20261029`, base `e03b3f856`. Correctif validé localement, non livré ; CI après publication encore attendue. Chromium et API/runtime synthétiques isolés, aucune donnée cliente, backend/production ou secret réel. Pas de profil/cache/log brut copié ; sources des reçus/scripts et SHA256 dans `sources.json`.

## Rouge établi et correction

`logs/gated-handoff/receipt.json` : System=true/3lignes avant libération du GETide-state ; ancien DOM détaché puis System=false/0ligne durant5s. Zéro erreurJS. Perte d’état réelle reproduite ; aucune traceCI ne prouve que cet ordre exact explique le retry historique Logs ligne108, lequel survient AVANTClear.

Le correctif conserve sept contrôles d’affichage via état de route isolé projet/panneau et provider de fenêtre/projet. Pas de lignes de logs, données ou credentials persistés. Les usages sans panneau gardent le fallback local. La suite composant réel couvre transfert, contrôles/Clear/Reload/pollingpause et isolation ; son stub de filtrage ne valide pas l’algorithme de filtre.

## Deux recettes compilées finales

`logs/final-1440/receipt.json` et `logs/final-1024/receipt.json` :2/2 premiers passages réussis, zéro erreurJS, script exact `logs/probe-final.cjs`.

- System=true/3lignes avant libération ; ancien nœud détaché ; System=true/3lignes après transfert.
- Clear→0ligne ; Reload retardé devient désactivé/occupé, puis3lignes/Systemtrue.
- Erreur de requête→alerte ; Retry→3lignes/Systemtrue SANS resélection. Le nom recoveryBeforeReselect reste uniquement pour comparer les reçus ; le script final n’effectue aucune resélection.
- Captures récupérées inspectées par l’agent : contrôles accessibles, navigation basse conservée à1024. Navigateurs fermés pendant la recette ; le parent a ensuite arrêté ses processus après vérification d’identité et confirmé les ports fermés.

Ancienne recette `clear-delay-error-recovery` conservée : pass global malgré Systemfalse après remount/avantresélection. Elle n’est pas requalifiée comme preuve de conservation. La nouvelle recette établit le changement.

## Validation et revue

Build client/SSR et commande officielle de typage COMPLET réussis ; lint0erreur/52avertissements préexistants ;42tests dans5fichiers réussis dont6Logs ;16tests inventaire réussis ; i18nvalidate et typageE2E réussis. Les sous-totaux se recouvrent et ne s’additionnent pas. Revue indépendante favorable : cinq tests exécutés indépendamment, sixième cas fallback relu favorablement. L’invocation secondaire directe tsc avait terminéOOM134 : conservée comme limite de cette invocation, pas utilisée comme verdict de typage ; la commande officielle a réussi.

Le testE2E existant garde le backend réel isolé, tient/libère GETide-state, vérifie le détachement et System aprèsRetry sans resélection. Assertions/budgets non affaiblis. Cette suite E2E complète backend n’a PAS été exécutée localement ; typageE2E et recettes synthétiques ne la remplacent pas. CI attendue après publication.

## États mobile et menus distincts

`states/mobile-initial` : parcours390 réussi avantcorrectif, loading→503/Retry→200, recherchevide/restauration, statutAPIempty distinct. Trois GET503 sont les reprises internes, pas trois recettes ; System sélectionné après stabilisation ne testait pas le handoff.

Menus :10cycles Enter/Escape/focus réussis dans5contextes390/1180, normal/CPU×4+archive500ms et témoin directEnter. Deux échecs supplémentaires de harnais Editor non ouvert restent dans `menus/bounded`; cycles principaux réussis. Incidents historiques390ligne92/1180ligne74 AVANTEscape toujours non reproduits, cause inconnue. DernièreCI847 sansretry et sans changementUI ne prouve pas leur résolution. Aucun seuil changé ni instrumentation source ajoutée.

Pas d’accès artefacts834/SBOM ou chemin alternatif.31/31 reste cartographie partielle ; pasSafari/appareil physique, recette production ou certification globale. Aucun statut de fusion/déploiement déduit de ce verdict local.
