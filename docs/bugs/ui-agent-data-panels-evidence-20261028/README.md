# Preuves locales — messages Agent et panneaux de données

Reçus Chromium sur vrais composants compilés et données API/runtime synthétiques isolées. Aucun prompt envoyé, compte créé, commande backend réelle, activation de stockage ou modification de projet client. Les fichiers JSON sont les reçus originaux reformatés sans suppression de champs ; `sources.json` contient leur provenance locale et le SHA256 des originaux. Captures et logs volumineux restent dans l’espace de travail, non dupliqués ici.

| Parcours | Preuve | Résultat / limites |
| --- | --- | --- |
| CodeBlock avant | code-before.json | Rouge géométrique : label/copie sur première ligne. |
| CodeBlock après | code-light.json, code-dark.json | Six recettes : clair390/820/1280/1536, sombre390/1280. Trois variantes chacune, copie synthétique erreur puis reprise, source exacte et clavier, header fixe lors du scroll du code. |
| Helper E2E exact | code-e2e-helper.json | Deux passages390tactile/1440, attente de coloration réelle puis géométrie stricte. Suite E2E complète non exécutée localement : fixture ne supporte pas son seed APIRequestContext ; aucun nouveau compte réel. |
| Activity avant / après | activity-before.json, activity-after.json | Défaut640px dans panneau588px à1280 ; cinq recettes corrigées390/820/1280/1536/1920, split réel et filtre conservé au resize. |
| Logs | logs.json | Trois entrées panelName=logs réussies390/820/1280 : lignes longues, filtre vide/reprise et clavier. Le même reçu conserve trois premiers essais Activity en échec de harness (libellé synthetic_event normalisé en synthetic event) ; ils ne sont pas présentés comme succès ni preuve produit. Le témoin Activity retenu est activity-before.json. |
| Database | database-empty.json | Trois états vides ; aucun clic Create ni SQL. |
| Storage avant | storage-before.json, storage-before-1280.json |503 masqué comme désactivation. Premier1280 expire sur visibilité ; essai isolé reproduit ensuite. Ce délai reste explicite. |
| Storage après | storage-recovery-disabled.json, storage-recovery-unprovisioned.json | Six recettes390/820/1280 : attente→503→Retry clavier→attente→200. Trois états disabled et trois enabled:true/provisioned:false ; ce dernier n’est pas un stockage provisionné. Enable jamais cliqué. |
| Overview | overview-long.json, overview-recovery.json, overview-empty.json | Trois longs + trois503/reprise réussis ; vide390/820 réussis, premier1280 timeout5s puis visible à capture. Cause inconnue, pas déclaré vert. |
| Monitoring | monitoring-long.json, monitoring-recovery.json | Trois longs + trois503/reprise réussis ; filtre24h Entrée/aria-pressed. |

Les preuves de correction CodeBlock, Activity et Storage sont issues des builds locaux corrigés, pas de simples overrides DOM. Les contre-preuves initiales DOM ne sont pas comptées comme validation finale. Les assertions et seuils existants ne sont pas affaiblis.

Validations ciblées rapportées avec ces correctifs : CodeBlock13tests ; Activity70gardes ; Storage28tests (sept nouveaux vrais composants extraits AST, six progression, sept AST, huit route), avec rouge six échecs/un succès avant puis sept succès après. Revues indépendantes favorables. Le root conserve les logs du build, typage et lint de l’assemblage ; leur état final doit être vérifié à chaque nouvelle modification, notamment celle de Search réalisée séparément.

Contraste mesuré uniquement sur le retour de copie : clair16,67–17,74:1 et sombre17,21–18,07:1. Aucune certification générale de contraste, Safari/appareil physique, zoom200%, clavier virtuel, safe areas ou production. Le retourB→A#834 et Search après Retour ne sont pas clos par ce dossier. Main reste bloquée par le gate SBOM ; ces nouveaux correctifs restent locaux, ni fusionnés ni déployés.
