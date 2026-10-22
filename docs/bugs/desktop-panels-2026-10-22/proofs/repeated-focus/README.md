# Palette réouverte : retour du focus et préparation des fixtures

## Symptôme antérieur au lot

Geste réel : focaliser le déclencheur → Ctrl+Shift+P → saisir Database → Ctrl+Shift+P à nouveau → Escape. La palette ferme mais le déclencheur reste inactif pendant les 5 secondes de l’assertion. Deux rouges directs à1440/1024 sur le produit c382137ad et les mêmes deux rouges sur le baseline edb558bc (produit identique àmain18745bd). Ce symptôme est donc préexistant ; ce n’est pas une nouvelle régression démontrée de #768. `baseline-and-c382-red.json` conserve statistiques, durées, focus tag/testid/role et empreintes des rapports privés, sans contenu de session.

Le contrôle clic répété1440 passe. À1024, le second clic initialement ciblé sous le backdrop modal échoue en préparation : geste invalide, pas preuve d’un nouveau défaut produit. La recette intégrée utilise fermeture par backdrop puis réouverture réelle. Navigation vers Database puis réouverture et Retour vers Preview pendant que la palette reste ouverte ont aussi été observées ; recherche Logs conservée et Escape rend le focus. Il s’agit d’ouverture UI, pas de requête SQL certifiée.

## Correction et verdict intermédiaire exact

Le produit d6c554ac2b9f94c3151ca1f27b052db56562039d ne remplace la référence de retour focus que si la palette était fermée. Une réouverture clavier pendant qu’elle est active conserve donc le déclencheur initial. Les six scénarios ajoutés et les deux handoffs passent dans le lot intermédiaire ; les captures `focus-after-*` montrent le focus visible après Escape aux deux largeurs.

Le rapport complet d6 est **10 succès directs / 1 échec, zéro retry et zéro omission**, pas11/11. L’échec Preview survient sur l’assertion registration.ok() avant tout geste UI. Le diagnostic API communiqué par le parent corrèle ce rouge à HTTP429 : onze inscriptions en environ52s pour une limite locale10/min. Le rapport Playwright expurgé ne contient pas lui-même ce code HTTP : cette distinction reste dans `d6-preparation-red.json`.

## Préparation réelle ajustée, sans exemption

Commit2a1c2bc3a843a8b8b97514d211170aebf97ac0ac, arbre59ed252fc5918f62671edc94395ef9fbbce173c7 : les six nouveaux cas partagent une identité synthétique par largeur via beforeAll, avec trois projets distincts et un contexte navigateur neuf par cas. Les deux anciens handoffs conservent leurs identités distinctes, leurs assertions et leurs délais. Sept inscriptions attendues pour onze cas directs sans redémarrage de worker. Un redémarrage peut réexécuter beforeAll ; ce compte n’est pas une garantie universelle.

Aucune limite locale/CI modifiée (valeur CI2000 préexistante), aucun délai artificiel, mock, force-click ou dispense. Le rouge429 reste conservé. La recette ciblée ultérieure est maintenant acquise : **11/11 succès directs, zéro retry, zéro omission**, en 58,4 s sur le build du commit2a1c2bc3 (`verified-green.json`). Les captures `focus-verified-*` inspectées montrent le focus rendu sur cette version. Les recettes tactiles et navigation complémentaires sont suivies séparément par le parent ; aucune réussite future ni production n’est anticipée. Le manifeste/build et le verdict final sont publiés séparément par le chantier principal.

## Confidentialité et limites

Six captures inspectées : données et noms synthétiques uniquement, pas de secret/donnée personnelle identifié. `images.json` contient provenance et empreintes. Aucune traceZIP, réponse API brute, storageState, cookie, token ou rapport Playwright complet copié. Les reçus utilisent une liste blanche de champs. Ces preuves n’attestent ni l’ensemble des31panneaux ni une sauvegarde/runtime distant, ni Safari. Les faux rouges de préparation ne sont pas requalifiés en défauts produit.

## Recette complémentaire achevée

Sur le même build 2a1c2bc3 : [tactile](touch-results.json) 2/2 et [docking/navigation](rpl-results.json) 9/9 directs, zéro retry/omission. Total réel local du complément : 22/22. Build, typage et hooks verts, 79/79 unitaires ; lint sans erreur, 52 avertissements existants. Le [reçu complet](build-receipt.json) compare 9 405 blobs Git et atteste 2 306 fichiers compilés. Safari reste bloqué (téléchargement WebKit403 non retenté).
