# Contrat GET compilé du redirect Administration

Build `c3404050d2ae62a962a1b34abd693032bbca68d0`, bundle SHA256 et provenance des processus dans server-origin.json. Serveur local partagé 14199/API synthétique 7099. Aucun navigateur nécessaire pour ces contrats HTTP ; l’autre agent utilise le même serveur pour sa recette de grille.

Cinq requêtes GET HTTP au vrai serveur compilé, redirects non suivis, toutes réussies :

- Admin synthétique FR : `/admin?lang=fr&export=csv` →302 `/admin/overview?lang=fr`.
- Admin synthétique EN : `/admin?lang=en` →302 `/admin/overview?lang=en`.
- Admin synthétique sans langue : `/admin` →302 `/admin/overview`.
- Utilisateur synthétique non-admin : `/admin?lang=fr` →302 `/dashboard`.
- Anonyme : `/admin?lang=fr` →302 `/login?returnTo=%2Fadmin%3Flang%3Dfr`.

`admin-receipt.json` conserve les réponses ; `admin-get.cjs` impose ces contrats. Les marqueurs SYNTH_ADMIN/SYNTH_USER sont des valeurs de fixture locales, pas des identifiants réels ni de nouveaux accès persistants. La fixture GET /auth/me distingue uniquement ces valeurs et refuse toutes les mutations. Le guard SSR bloque tout autre origin et toute méthode non GET. Aucun compte, backend réel, permission ou export utilisé.

Cette recette confirme le redirect et ses refus, pas le rendu visuel de la destination, la réussite d’une authentification réelle ni toutes les langues/valeurs de query. Main/live restent faux. Aucun nouveau build, source, index ou push effectué par la recette.

Après signal de fermeture des navigateurs de public_ui_audit, les PID propres 217579/217578 ont été revalidés puis arrêtés. cleanup.json confirme leurs états Z sans RSS/cmdline et les ports14199/7099 refusés. Un port refusé seul n’est pas utilisé comme preuve de terminaison.

Le parent a exécuté le build commun et le typage web sur la source c3404050d2 : deux sorties0, journaux ui-next-grid-admin-build.log et ui-next-grid-admin-typecheck.log archivés. Aucun build supplémentaire exécuté ici.
