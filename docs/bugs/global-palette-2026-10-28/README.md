# Palette globale — durée de vie et retour du focus

Base intacte `58fa0702a2824015e879665e227228f8b4d8c76a` (#821). Reprise ciblée de la partie palette de #768 expressément autorisée le28octobre2026 ; aucun autre volet de ce lot repris. #822 garde son périmètre runtime, sans chevauchement produit.

Le provider déjà placé au-dessus des coques ClientOnly/Suspense conserve maintenant ouverture, mode, recherche, sélection et référence du déclencheur global. Le contexte reste isolé par projet/fenêtre et disparaît à la sortie de route. Fermeture explicite, clic extérieur et réouverture gardent leurs contrats. Le retour de focus différé est annulé au démontage, changement de portée ou réouverture. Pas de stockage global, localStorage ou écriture serveur ajouté.

## Preuves et matrice

| Recette Chromium locale | 320 | 390 | 768 | 1024 | 1280 | 1440 |
|---|---|---|---|---|---|---|
| Avant : ancien DOM détaché, palette et recherche perdues | non exécuté | non exécuté | non exécuté | reproduit | reproduit | reproduit |
| Après : ancien DOM détaché, recherche Database et focus conservés | passe | passe | passe | passe | passe | passe |
| Raccourci répété puis Escape et focus déclencheur | passe | passe | passe | passe | passe | passe |
| Clic extérieur, resize pendant saisie, Database, Retour, autre projet | passe | passe | passe | passe | passe | passe |

[Avant](before/receipt.json) et [après](after/receipt.json), captures et empreintes des sources accompagnent cette recette. Vrais builds web/SSR servis localement, API synthétique neutre et contrôlée ; aucun fournisseur, projet client ou secret utilisé. Réponse mémoire retenue puis libérée ; témoins DOM vérifient le remplacement réel de coque. Zéro erreur page dans la matrice finale. Requêtes externes et mutations bloquées, listées dans les reçus. Les écrans de preview en démarrage et l’absence de fichiers sont ceux de la fixture, pas une validation du runtime.

Une première assertion de recette attendait à tort un retour au déclencheur après clic extérieur. Le contrat existant laisse le focus à la cible cliquée : recette finale vérifie le textarea réellement cliqué sur desktop, et la fermeture sans vol de focus sur le backdrop mobile. L’ancien harness est conservé ; aucun changement produit n’a été fait pour cette attente erronée. Escape restitue bien le déclencheur dans tous les formats.

Le test historique `ide-panel-visibility.spec.ts:173` reste byte-identique. Le nouveau scénario permanent `ide-global-palette-handoff.spec.ts` couvre1280/1440/1024 sur backend de test isolé : réponse réelle retardée, remplacement de coque, recherche, Escape, Database, Retour et autre projet. Il est collecté et linté localement ; son exécution backend et celle du scénario historique restent à confirmer dans la CI de la tête publiée. La recette navigateur locale n’est pas présentée comme leur exécution.

## Validation locale

- Deux tests rouges de conservation d’état/référence avec le hook à durée de vie locale, puis17verts avec provider.
- Trois tests rouges de focus différé avant cleanup, puis23verts incluant les17précédents et6cas de focus.
- Suite ciblée finale :45tests verts, dont les6Escape de #820 ; index :16gardes vertes,539fiches.
- [Revue indépendante favorable](validation/independent-review.md),23tests réexécutés indépendamment (non ajoutés aux45).
- Typage officiel complet : web, scripts, helpers IDE, Electron et packages passent. Build client/SSR terminé sortie0. Lint global corrigé :0erreur,52avertissements préexistants ; première passe2erreurs d’espacement conservée dans les preuves locales, corrigées par une seule ligne blanche. Cette ligne blanche est postérieure au build de recette, sans changement d’AST produit ; la CI reconstruit la tête exacte.
- Tests, reçus et journaux ciblés sont dans [validation](validation/). Aucun délai, retry, assertion historique, waiver ou gate affaibli.

## Limites

Pas de Safari physique, de WebKit local, de zoom200%, de paysage téléphone ou de recette authentifiée production sur ce lot. Les six formats couvrent seulement les parcours indiqués, pas l’IDE entier. La trace CI initiale #821 n’a pas été téléchargée (HTTP403du proxy) ; la reproduction locale prouve le mécanisme sans attribuer tous les échecs CI au même événement. Aucun nouveau coût ni accès. Fusion et livraison non encore effectuées au moment de cette preuve locale.
