# Complément de limites — aucune nouvelle couverture

Les deux fichiers css195-classification sont copiés sans modification depuis `/tmp/ui-p2-native-zoom/`, auteur public_ui_audit. Ils classent 16 contextes existants de quatre routes ; ce ne sont ni de nouveaux tests ni de nouveaux IDs couverts. Le reçu original qu’ils citent est `/tmp/ui-p2-native-zoom/receipt.json` ; cette copie de classification ne remplace pas ce reçu complet.

Ces contextes restent un backlog non certifié : zoom Chrome natif200 %, outerWidth500/innerWidth195. Ils ne représentent pas un téléphone physique390px. Ancêtres overflow, hit-test, défilement horizontal réellement atteignable et captures CSS195 manquent ; aucun défaut supplémentaire n’est déclaré corrigé. Aucun patch CSS195 demandé ni appliqué.

Limite complémentaire de la recette Observabilité après14199 : la capture à200 % ne montre pas la fin du paragraphe dans son cadre. La revue visuelle est donc partielle. Les mesures DOM Range attestent des bornes mesurées mais ne constituent pas une capture exhaustive de tout le contenu. Cette précision n’invalide pas les assertions ciblées ; elle interdit d’en déduire une validation visuelle globale.
