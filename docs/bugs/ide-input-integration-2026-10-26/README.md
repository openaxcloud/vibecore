# Continuité de saisie IDE — validation d’intégration du 26 octobre 2026

Build unique de `cd0dd515e22772d37f1cbcb50c27dfd6cc26d48b`, incluant main et les correctifs locaux de continuité de saisie. **17 scénarios sur 17 passent au premier essai, sans retry automatique.** Aucun fichier produit n’a changé pendant le build ou les tests.

- 14 cas Chromium standard : composition stable, composition à travers un démarrage réellement retardé, clic extérieur vers Search, conservation du focus/caret et respect d’une intention extérieure, sortie/retour clavier Monaco, huit régressions de recherche/menu/focus mobiles.
- 2 cas Chromium au zoom natif 200 % : composition/handoff et clic extérieur vers Search. Le zoom est vérifié par CDP, pas simulé par CSS.
- 1 cas de saisie continue : chaîne de 62 caractères avec délai de 20 ms, libération du véritable GET de démarrage au milieu ; modèle final exact.

La composition utilise les commandes Chromium CDP : même textarea conservé pendant la composition, commit de `日本`, passage à ChatImpl puis frappe de `Z` donnant exactement `日本Z`. Cela ne constitue pas un test d’IME physique. Le cas extérieur effectue un vrai clic Search puis saisit `README` dans le champ resté focalisé ; le modèle d’éditeur hors vue n’est pas revendiqué inchangé.

Les fixtures sont synthétiques, mais la stack API/PostgreSQL et les réponses de démarrage sont réelles. Les attentes réseau retardent ces réponses sans les remplacer. Les mutations navigateur et appels externes sont bloqués dans ces tests ; les écritures de préparation restent dans la stack isolée. Aucun runtime fournisseur, publication de projet, DNS, compte client ou production n’a été testé.

Les anciennes tentatives du lot avant intégration avaient révélé deux défauts de harnais (sélecteur Search ambigu, puis journal demandant un éditeur visible après navigation). Leurs preuves restent conservées hors de ce dossier. Le présent run d’intégration utilise les versions corrigées et ses 17 cas passent au premier essai ; ne pas réécrire l’historique des lots précédents comme s’ils avaient également tous passé au premier essai.

## Pièces

- [Reçu expurgé](receipt.json) : résultats, version, limites et nettoyage.
- [Preuves comportementales](behavior.json) : modèles de fixtures, focus et mesures de zoom ; événements bruts omis.
- [Hashes de sources et build](source-hashes.json) : rattachement au commit testé.
- [Composition après handoff](composition-handoff-desktop.png) : `日本Z` dans l’éditeur, données de fixture uniquement.
- [Search au zoom natif 200 %](outside-search-native-200.png) : cible extérieure focalisée avec `README`.
- [Matrice des 31 entrées IDE](ide-31-functional-matrix.md) : périmètres mesurés, non testés et bloqués, sans prétention de validation complète des fonctions métier.

Les deux captures ont été inspectées : elles contiennent uniquement les noms/contenus des fixtures, sans token ni donnée client visible. Aucun log API, cookie, session ou trace Playwright brute n’est inclus. Les services et conteneurs de cette stack ont été arrêtés ; ports 5199/3018/55448/56388 fermés et service concurrent préservé. Aucun commit ou push effectué par la recette QA.
