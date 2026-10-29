---
id: BUG-MOBILE-MODAL-KEYBOARD-CONTAINMENT-20261029
---

# Le clavier sort des feuilles mobiles déclarées modales

## État

📤 Dispatché : ☑ diagnostic local depuis main `fe7909242`.
💻 Codé : ☐ première version publiée dans #853 ; complément de focus local en validation, non publié ni intégré.
✅ Testé live : ☐ aucune recette de production.

## Reproduction

À 390 px, Panneaux, Outils et Onglets déclarent `aria-modal=true`, mais l’ouverture laisse le focus sur BODY. La première tabulation atteint un contrôle derrière la feuille. Depuis les limites de chaque dialogue, Maj+Tab atteint le backdrop ou le dock ; Tab quitte vers BODY. Échap ferme déjà correctement et restitue le focus. Trois témoins compilés par parcours, API et fichiers synthétiques, aucun projet client.

Le correctif local confine l’entrée et les tabulations à ces trois dialogues seulement. Il préserve le focus et la sélection restaurés lors du remplacement de coque, laisse les événements consommés et les dialogues enfants à leur propriétaire, et conserve la fermeture/restauration existante. La tabulation utilise le défilement natif du focus pour rendre les contrôles visibles.

## Validation et limites

Recette compilée : **5/5 formats et15 dialogues** à 390×844,820×900,1180×757,844×390 et 390×320. Entrée naturelle, premier Tab, confinement Tab/Maj+Tab, visibilité et hit-test des contrôles extrêmes, Escape et restitution du focus passent. Un témoin supplémentaire de remplacement de coque conserve query et focus (**1/1**).

Validation globale parent :59 tests (43 UI+16 inventaire), typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants, i18n et typage E2E verts. Revue indépendante modales18 tests et lecture statique E2E ; pas d’E2E complet backend réel local, CI encore à exécuter. Résultats synthétiques locaux, non publiés et non validés en production.

Incident distinct ouvert : Entrée peut arriver sur BODY pendant le montage d’une coque dont le nouveau chrome mobile n’existe pas encore. Aucune activation différée n’est rejouée par ce correctif. Les témoins de redimensionnement passent 4/4 avec 16 navigations au pointeur ; Search/navigation interrompue passent 4/4 à 390/768. Cela ne clôt pas les anciens incidents intermittents ni #834.

Preuves : [archive et manifeste](ui-responsive-recovery-evidence-20261029/README.md). Pas de Safari physique, backend réel ou certification des 31 panneaux.

## Garde CI et revue de la tranche protégée

La première tête publiée `78f28ed924` a révélé une garde AST non actualisée : 11261 tests réussis, 4 ignorés et une empreinte en échec. Comparaison indépendante à main `fe790924` après placement des hooks auprès des états : la tranche protégée contient exactement trois ajouts de deux lignes, `ref` et `tabIndex=-1`, sur les trois sections. Aucun texte, classe, enfant, callback Escape, Terminal ou dock ne change. Le cas 12 de la garde documente ce delta ; son assertion stricte est conservée et l'empreinte actualisée selon sa procédure. Les 56 tests ciblés incluant cette garde passent ensuite, sans reprise.

La même CI a rencontré séparément un port PostgreSQL 55432 occupé avant tout test de la tranche E2E 3. Ce défaut de préparation ne constitue pas une validation ni un échec produit. Le canari WebKit de cette première tête compte 19 succès et 3 tests ignorés ; il ne valide pas une version suivante ou Safari physique.

## Retour CI de #853 et correction du focus initial

La première tête publiée `78f28ed92` de [#853](https://github.com/openaxcloud/vibecore/pull/853) n’est pas validée globalement :

- Unitaires : 11261 réussis, 4 ignorés, 1 échec de garde d’empreinte. La revue indépendante confirme exactement six lignes ajoutées (`ref` et `tabIndex`) dans la tranche protégée. Le commit local `fca8125f2` actualise l’empreinte selon le cas 12 documenté, sans retirer la garde.
- E2E tranche 3 : port PostgreSQL 55432 occupé avant les tests ; blocage de préparation, pas échec produit ni validation.
- E2E tranche 2 : 7 échecs de `mobile-device-matrix` ligne 217, 133 réussis et 1 reprise liée au sélecteur d’onglets 1180 absent. Le champ de recherche Outils ne doit pas recevoir automatiquement le focus à l’ouverture pointeur : cette régression réelle n’était pas couverte par les premières recettes locales vertes.

Le nouveau correctif focalise le conteneur du dialogue plutôt que l’input. La première tabulation reste dans la modale ; le champ redevient focalisable volontairement. Le témoin rouge unitaire compte 3 échecs / 3 réussites, puis la revue indépendante 19 réussites. Validation finale : 57 tests ciblés réussis, build client/SSR et typage officiel complet réussis ; lint des fichiers modifiés sans erreur ni avertissement. Ces comptes se recouvrent et ne doivent pas être additionnés.

Les reçus `menus/final-container-matrix`, `final-container-handoff` et `final-pointer-seven` sont archivés : respectivement 5/5 formats (15 dialogues), 1/1 handoff query/focus, 7/7 profils pointeur. Verdicts terminaux confirmés par le propriétaire, tous sans reprise. Focus initial sur le conteneur exact, input Outils non focalisé, puis Tab atteint le premier contrôle ; bornes, hit-test et Escape passent. Le handoff détache l’ancien input 9 et restaure le focus Webview sur le nouvel input 12. Navigateurs fermés, aucun profil résiduel. Les profils sont des viewports Chromium émulés, pas des appareils physiques. Les anciens reçus restent inchangés et ne sont pas requalifiés comme validation du nouveau comportement.

Cette nouvelle révision reste locale, non publiée et non validée en production. #853 existe déjà ; cela ne signifie ni fusion ni livraison. La perte d’Enter pendant remplacement de coque, la reprise Tabs 1180, #834, la cause initiale d’import production et l’ouverture inline ambiguë restent ouvertes. Aucun E2E complet avec backend réel local exécuté pour ce complément ; nouvelle CI à obtenir après publication.
