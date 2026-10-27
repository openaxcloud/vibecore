# Saisie continue et composition pendant le chargement IDE

Le lot initial reste sur `62a072e97`. Cette correction est isolée dans la branche locale `fix/ide-composition-handoff-20261026`. Aucun push, PR, transition de #799, fusion ou déploiement.

## Conclusion de la reproduction

La saisie ordinaire est conservée exactement aux deux cadences essayées (80 ms, puis 62 caractères à 20 ms). Aucun buffer de touches n'a été ajouté. La fenêtre de remplacement observée n'a reçu aucun keydown dans ces essais ; ce résultat ne garantit pas tout matériel ni toute cadence.

Le contrôle de composition Chromium CDP conserve `日本Z`. Le remplacement pendant composition conservait seulement `日本`, perdait le focus vers BODY et ne recevait pas la continuation. Le document lui-même restait focalisé. C'est une reproduction sous protocole Chromium, pas une validation d'IME matériel.

## Correction et validation

Le signal natif Monaco de composition retarde uniquement l'adoption initiale de ChatImpl, jusqu'à la fin de composition et du geste pointeur éventuel. L'éditeur reste le même pendant la composition. Aucune capture globale, mise en tampon ou réinjection des touches. Après adoption, une nouvelle composition ne réactive pas la coquille.

- 54 tests package, 33 tests app/catalogues/AST et 16 tests index réussis.
- Typechecks web/package, build strict package, build application, lint ciblé et format réussis. Revue indépendante favorable.
- 17 scénarios navigateur couverts : 15 réussis au premier passage ; 2 cas de clic extérieur réussis après deux corrections ciblées du harnais. Les échecs initiaux restent dans les reçus : sélecteur ambigu, puis journal cherchant Monaco alors que Search l'avait remplacé. Aucun retry automatique et aucun changement produit pendant la recette.
- Composition stable, remplacement pendant composition puis frappe exacte `日本Z`, clic réel vers Search puis saisie README, continuité rapide ordinaire et régressions focus/menu mobile/sortie Monaco validés. Composition et clic extérieur également en zoom Chromium natif 200 %.

## Preuves et limites

Les reçus versionnés conservent les empreintes des rapports originaux dans `/tmp/ide-continuous-input-qa/`, ainsi que les différentes versions du test. Ces chemins désignent des preuves locales, pas des artefacts CI publiés. Captures avant/après jointes.

Fixtures synthétiques sur API et base locales réelles ; vraie réponse GET retardée, sans réponse de remplacement. Aucune donnée client, publication fournisseur ou modification de permissions. Aucun test production authentifiée, Safari matériel ou IME matériel. Les transitions plus précoces ClientOnly/Suspense restent hors de la preuve et du correctif ; le parcours couvert est l'arrivée de l'historique dans Chat.

Stack isolée arrêtée : processus et conteneurs dédiés supprimés, ports 5199/3018/55448/56388 fermés, service concurrent préservé.
