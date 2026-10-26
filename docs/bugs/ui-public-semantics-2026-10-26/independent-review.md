# Revue indépendante — sémantique des navigations publiques

Revue en lecture seule de `/workspace/vibecore-ui-semantics-next`, le26octobre2026. Diff normal et diff ignorant les espaces relus pour les quatre composants ; nouveau test `public-navigation.spec.tsx` lu. Aucun test redondant, build ou modification exécuté par cette revue.

## Avis

**Favorable à la compilation et à la recette ciblée. Aucun blocage source identifié.** Le passage de douze paires `Link > Button` à `Button asChild > Link` retire l'interactivité imbriquée et le double arrêt de Tab. Les destinations `/register`, `/contact-sales`, `/dashboard`, `/pricing` et `/docs` restent identiques, avec les mêmes textes traduits et icônes. Les variants, tailles et classes propres aux actions sont conservés. Le correctif antérieur du hero Deployments (grille adaptative et `!min-h-[44px]` de l'action docs) est conservé.

Les wrappers `main` de Teams et Deployments entourent le contenu et les sections différées, sans englober Navbar/Footer. Bounties avait déjà son main. Aucun changement du routing, des données, des catalogues, du composant Button partagé ni de l'IDE.

## Support réel de asChild

`EcodeExactUi.tsx:135-147` utilise effectivement `React.cloneElement` lorsque asChild reçoit un enfant valide. Les props et classes du Button sont transférées au Link ; `cn` utilise tailwind-merge. Le Link local transmet ses props et rend un lien ReactRouter pour ces destinations internes. L'élément DOM interactif résultant est donc un lien unique, et non un Button simplement masqué. Les classes de largeur déjà portées par les Link Teams sont compatibles avec les classes identiques des boutons. Ces actions n'emploient pas de ref, disabled, type de soumission ou gestionnaire spécifique qui serait perdu par cette conversion.

## Tests et limites de la revue

Le nouveau test garde les vrais Link/Button et Router, remplace seulement la coque, attend les actions des sections lazy, vérifie les douze destinations par langue, l'absence de a/button imbriqués et le main unique hors navigation/footer. Les résultats6rouges→6verts et21tests catalogue sont rapportés par le propriétaire ; pas rejoués ici. La baseline archivée contient48observations/192actions sur les troisURLs, distinctes de toute validation après compilation.

Le lien devient directement un item flex `inline-flex` au lieu d'un wrapper contenant un bouton. Les mêmes classes ne garantissent donc pas une géométrie identique. La cascade peut aussi cibler différemment a etbutton. Recette compilée requise : largeur/hauteur calculées, Range des textes, icônes, contenus complets, un seul Tab par action, Enter/Back, 320/paysage/tablette/laptop FR/EN/thèmes. Ne pas déduire le minimum tactile44px de `min-h` face aux règles md ou partagées ; mesurer. Aucune certification visuelle, contraste, production ou opération métier n'est donnée par cette revue statique.
