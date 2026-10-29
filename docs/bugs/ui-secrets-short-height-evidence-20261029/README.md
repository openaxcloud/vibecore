# Secrets petite hauteur — preuves du lot local

## État actuel du lot — validation locale ciblée terminée

| Parcours | Verdict acquis | Limite conservée |
| --- | --- | --- |
| Secrets petites hauteurs |4/4 acceptance compilée +3/3 frontière450/451,resize,brouillon/focus,menuEscape +1/1 revue navigateur indépendante | ClavierHTML simulé uniquement ;40px utiles<44px à160CSS. |
| AideF1 après défilement automatique | Les deux séquences firstFocus etNativeTab passent1/1 chacune ; texte complet,End dernière ligne,Escape/focus et géométrie verts | Un cas natifFR820×400, pas certification de tous contextes. |
| Search sélection |4cas non reproducteurs,16tests existants réussis ; aucune source modifiée | CauseCI toujours inconnue, incident ouvert. |
| Assemblage | Build client/SSR final exit0,140tests,typage web,i18n et lint complet0erreur/52avertissements préexistants | Résultats locaux, aucune fusion/livraison ou recette production revendiquée. |

Le parent a ouvert et inspecté les deux captures originales de clé visible et de dernière ligne d’aide ; FIN_MARKER_844 est intégral. Les paragraphes datés/intermédiaires ci-dessous conservent la chronologie des attentes et échecs ; leur mention « en attente » ne décrit plus l’état actuel du lot.31/31 reste ciblé/partiel, pas Safari/appareil physique/backend/runtime réel. Les images synthétiques montrent des états différents, sans édition ni fausse comparaison pixel à pixel.


Base `3c61ac84e` (#844), branche `fix/ide-short-height-search-selection-20261029`. Chromium local natif100/200%, vraie surface compilée et fixturesAPI/runtime synthétiques. Aucun secret réel, révélation/copie, soumission, permission ou opération cliente. Aucun profil/cache ni log brut copié. Les scripts dépendent de cet environnement local, pas de la production ; manifesteSHA256 des originaux dans sources.json.

## Défaut et diagnostic

Scroller mobile jusqu’au bas du viewport, navigation fixe72px au-dessus : trois formats200% occultent le centre de la clé après focus et Tab natif (195×160,410×200,640×200CSS). Le contrôle390×320CSS à100% est accessible. Les `pass:true` des reçus de diagnostic signifient collecte terminée, PAS absence du défaut. Le paddingbottom réserve du scroll mais le scroll-padding ne représente pas la zone masquée ; scrollIntoViewIfNeeded considère l’ancre visible derrière la navigation.

Contre-preuve height seule rejetée : paddingvertical102–119px dépasse les40/80px disponibles. Height+padding-block4+scroll-padding-block4 rend les quatre Tab accessibles, mais certaines étapes de focus initial restent occultées avec cette injection. Ce sont des contre-preuves DOM, pas une recette du build corrigé.

Delta local ciblé : Secrets mobile uniquement, media max-height450, clavier virtuel fermé ; hauteur soustrait navigation/safearea, padding-block et scroll-padding-block4. Navigation basse/header/taille de cibles/handlers conservés. Garde structurelle1rouge avant/1verte après, lint/diffcheck verts. État de cette première étape : build/recette compilée encore attendus ; voir le verdict actuel ci-dessus et la preuve finale ci-dessous. Aucun correctif déclaré livré.

## Search distinct : non reproduit

Quatre cas390 : unCPU×4 avec lecture pré-release supplémentaire, puis troisCPU×1 sans cette lecture. Tous conservent[1,4,backward] ; trois traces prouvent identité du champ sélectionné/handle, détachement puis transfert au successeur. Zéro erreurJS.16/16 tests existants Search passent sans changement. Ni perte produit ni course de harnais établies ; échec CI avantRetour toujours ouvert. Ces cas n’exercent pas le Retour lui-même. Aucune source/test modifié et aucun patch spéculatif Search.

## Limites

À160CSS de hauteur, header48+nav72 laissent40px utiles : une cible44px ne peut pas être entièrement visible ; aucune certification globale ou réduction des contrôles. Safe areas/clavier virtuel réels, Safari/WebKit local, appareil physique, backend/runtime réel et production non validés.31/31 reste recettes ciblées partielles.834/README/menuCI restent distincts ; aucun artefact refusé ou chemin alternatif, SBOM, promotion, fusion ou déploiement. Les sourcesREADME sont des instantanés de diagnostic, toute validation ultérieure doit être ajoutée explicitement.

## Première validation compilée et contrôles encore attendus

`compiled-acceptance-harness-fixed/receipt.json` passe4/4 sur le build corrigé. La première recette `compiled-acceptance` avait quatre ReferenceError sur la variable target (zone temporelle morte), avant observations : erreur du harnais conservée, pas un rouge produit. Aucun résultat de cette première recette n’est présenté comme preuve de correction.

Validation parent : build client/SSR, typage complet, lint0erreur/52avertissements préexistants et90tests ciblés réussis. Le verdict final reste suspendu aux trois cas de frontière450/451, clavier simulé par attributHTML et redimensionnement, ainsi qu’à la revue indépendante. Cette simulation de clavier ne certifiera pas un clavier virtuel physique. Captures avant/après encore en préparation. Les4/4 ne valent pas clôture anticipée de ces contrôles.

Search reste non reproduit, sans changement source ; limite40px utiles<44px et absence de recette production/Safari demeurent. Aucun index ou statut de fusion/livraison modifié.

## Secrets validé, complément F1 en attente du second build

Secrets :4/4 acceptance compilée,3/3 frontière450/451/clavierHTMLsimulé/resizefocus-brouillon/menuEscape, plus1/1 recette indépendante sans injectionCSS. La revue visuelle parent confirme les clés au-dessus de la navigation. Les deux échecs de mesure immédiate du premier parcours frontière restent conservés : transition CSS `flex-basis,width,height`250ms observée ; la même assertion bornée attend la stabilisation dans le budget5s existant, sans élargir le seuil. Un défaut initial d’initialisation du harnais indépendant reste séparé du reçu final.

Le parcours de capture a ensuite atteint une limite distincte : clé visible, mais offre Lire absente après nouveaufocus/Tab ; F1/End/Escape non atteints, pas de reprise déclarée verte. `help-scroll/before/receipt.json` prouve deux échecs : focus→défilement automatique→offre masquée→F1 sans dialogue. Son pass final correspond à un quatrième focus sans nouveau scroll, PAS à une correction des deux échecs.

Correction locale complémentaire GlobalTooltip : reçu éphémère uniquement pour une aide réellement mesurée comme tronquée et son ancre focalisée. F1 après scroll peut l’utiliser si focus, connexion, chemin et texte correspondent et si l’ancre n’est ni hidden niRadix. Départfocus, activation, Enter/Space/Escape et invalidation effacent le reçu ; comportement pointeur/masquage au scroll inchangé. Un témoin rouge supplémentaire prouve que le focusA doit primer sur un tooltipB seulement survolé ; corrigé sans détourner F1 hors de sa cible.

Tests agent55 et revue41 réussis (recouvrement), parent140tests finaux réussis. **Second build et recette compilée F1 EN ATTENTE** : ne pas déduire le comportement navigateur de ces tests. Les preuves finales et captures seront ajoutées avant clôture. Limites40px<44px, clavier physique/safeareas non certifiés et Search non reproduit restent inchangées.31/31 demeure partiel ; pas de Safari/production ou mutation réelle.

## Verdict compilé final F1 confirmé

`help-scroll/final/receipt.json` confirme firstFocusF1=1 et nativeTabF1=1 contre0/0 avant correction. La clé réelle synthétique est focalisée après défilement automatique ; F1 ouvre désormais la lecture complète dès les deux séquences. Texte intégral égal à l’attribut, End atteint503px de scroll+133px visibles=636px, Escape ferme et rend le focus à l’ancre ; zéro erreurJS. Zoom natif820×400physiques→410×200CSS, DPR2/CSSzoom1. Ancre92..124 dans scroller48..128, navigation à128. Le navigateur de recette est fermé.

La capture originale `captures/820-fr-200-help-last-line.png` a été ouverte et inspectée par l’agent : FIN_MARKER_844 entièrement visible. La capture `820-fr-200-focus-after.jpg` montre séparément la clé au-dessus de la navigation ; son ancien parcours s’arrêtait avant l’aide et n’est pas requalifié rétroactivement. Les images synthétiques sont copiées sans édition, sans données clientes. États différents (focus de clé / lectureF1+End), pas une fausse comparaison pixel à pixel.

L’attente de la recette compilée F1 est clôturée par cette preuve ciblée, sans effacer les anciens rouges ni élargir la couverture : limite40px<44px, safeareas/clavier physique, Safari, backend réel et production restent non certifiés. Search non reproduit reste ouvert, sans modification source. Aucun statut de publication/fusion/livraison déduit de ce verdict local.

## Correction de la recette CI845 — deux états distincts, produit inchangé

Le rouge E2E de la tête7e2edb884 est conservé. La reproduction locale `ci-resize-diagnostic/exact-sequence/receipt.json` suit390×844→390×200 à largeur identique : la référence de hauteur au repos reste844, le rétrécissement644 dépasse le seuil150 et produit classe clavier-ouvert. La navigation est donc normalement masquée, rectangle0×0. Clé focalisée et hit-test réussissent, clé152..184 dans scroller48..200 ; seule la condition `scroller.bottom <= nav.top` échoue (200<=0). Le focus du filtre n’est pas établi comme cause : c’est la référence de hauteur conservée. Le produit n’est pas modifié pour contourner cet état attendu.

Le test corrigé conserve le redimensionnement clavier simulé et ses vérifications d’accessibilité, puis recharge à hauteur200 pour établir naturellement un nouveau repos sans clavier. La navigation devient visible, clé90..122 dans scroller48..128 au-dessus de nav128. Le prédicat strict du dock est conservé à l’identique, même budget5s, actions initiales et retour/menuEscape inchangés. Aucun attributHTML/CSS forcé, seuil ou assertion affaibli. Correction limitée au test.

Preuves locales distinctes : `two-states/receipt.json`1/1 en profil standardDPR1, puis `two-states-ci-profile/receipt.json`1/1 dès son unique exécution en profilCI exactChromium isMobile:true/hasTouch:true/deviceScaleFactor:2,viewport390×844. keyboardPass,dockPass,menuEscape vrais ; script exact copié sous `two-states-ci-profile.cjs`. Ce profil local émule les paramètresCI, mais N’EST PAS une exécution du workflowCI ni un appareil physique. La nouvelle CI de la correction reste à venir.

L’environnement auparavant bloqué est restauré ; cela ne transforme pas le rouge historique en succès. Aucun nouvelID, index, source produit, permission, artefact834/SBOM, commit ou publication dans cette mise à jour documentaire. Inventaire573 sous contrôle du parent. Les autres limites du lot, Search ouvert et31/31 partiels, restent inchangées.
