# Terminal — remplacement de coque

Chromium local, vrais composants compilés, données/API/runtime synthétiques. Aucune commande Shell réelle exécutée. Les mutations et accès externes sont bloqués ; le message « Could not start the managed shell » dans les captures est attendu dans cette recette et ne constitue pas une panne production observée.

Avant : 390/768/1280 échouent au focus du profil après détachement de l’ancien Terminal. Après correction complète : 3/3 réussis, zéro erreur JavaScript, ancien nœud détaché ; menu et profil conservés, Shift+Tab, Escape puis Tab natifs fonctionnels. Les captures menu-restored montrent le contrôle focalisé ; success montre l’état après fermeture.

Les builds intermédiaires ne sont pas qualifiés de corrigés : le transfert synchrone seul passait à1280 mais échouait sur mobile ; la réservation seule échouait encore tant que la route Terminal initialisait Agent. Le résultat final combine portée éphémère, réservation lazy et initialisation canonique de surface/onglet.

52 tests ciblés Terminal/startup passent, dont vrais initialiseurs extraits du TSX et contrôles Terminal réels avec transport simulé. Des tests permanents à390/768/1280 ont été ajoutés sans changer les trois scénarios clavier existants. Le build final et le typage web passent ; le typage complet a passé avant les derniers changements web. Pas de Safari physique, clavier virtuel ou validation runtime réelle.

Revue indépendante du transfert et du correctif CSS favorable. Navigation vers deux entrées historiques distinctes de même URL non spécifiquement exercée ; retour B→A #834 non déclaré corrigé.
