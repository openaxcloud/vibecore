# Focus toast — vrai hook React local

Worktree isolé vibecore-ui-ide-feedback-next, base #807. Source modifiée seulement useIdeToastLayout.ts et .spec.tsx ; autres modifications présentes appartiennent à ui_review. Aucun commit/push/index. Source-hashes.json identifie le code testé.

prepare.cjs extrait AppToastContainer de root.tsx et importe le VRAI useIdeToastLayout du worktree ; bundle esbuild, vraie bibliothèque React/Toastify. Styles toast compilés du harness final #807 inchangés. Aucune injection de réparation DOM dans cette recette ; notifications métier synthétiques, API absente. Ce n’est pas le build complet React Router ni une recette production.

receipt.json : dix étapes clair/sombre, 390→844 paysage→820→1440 bureau→390, mêmes trois IDs, focus détails conservé ; chaque étape compacte rend le contrôle intégralement visible. scrollY reste0. Deux contrôles supplémentaires de focus extérieur conservent focus et scrollTop après resize. Retour bureau inclus pour vérifier cleanup puis réinstallation du hook compact. Le fil réel n’est pas présent ; le code ne manipule que scrollTop du conteneur de notification, jamais page/fil.

Six tests hook verts (trois existants + trois tests comportements géométrie simulée/RAF coalescé/focus extérieur/borne/nettoyage). Journaux /tmp/ui-toast-focus-next/unit-final.log et lint-final.log. tsc --noEmit -p tsconfig.web.json exit0, journal typecheck.log au même endroit (lancé avant changements purement formatage/retour undefined). Aucun build complet supplémentaire lancé ; coordination root requise avant livraison.

Limites : aucune certification accessibilité, lecteur écran, Safari ou clavier virtuel/OS. Cible plus haute que liste ne peut être entièrement affichée. ResizeObserver suit la taille de la liste ; croissance interne sans changement de dimensions n’est pas garantie. Contrepreuve historique par injection séparée /tmp/ui-toast-focus-next, ne pas confondre les deux recettes.

cleanup.json : navigateur fermé, serveur fermé, PID absent et port refusé. Serveur éphémère uniquement, aucun processus tiers touché.
