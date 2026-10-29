# Menus et responsive — base fe7909242 après #852

Recettes Chromium locales, fixtures synthétiques uniquement, scripts hors dépôt. Les incidents historiques restent distincts ; aucune certification de leur résolution. Aucun code produit modifié par cet agent.

## Deux défauts établis
### Entrée perdue pendant le remplacement de coque
`resize-baseline/receipt.json`, cas panels820-to1180 et panels390-landscape, échec avant toute navigation.
Chronologie820 : focus ancien bouton1437ms ; ancienne coque retirée1605ms et nouvelle coque8 ajoutée ; keydownEnter1615ms puis keyup1631ms ciblent BODY, trigger/header introuvable ; nouveau bouton reprend le focus1656ms. Aucun click ni montage du menu. Ce n'est pas uniquement un focus sur BODY : le nouveau root est présent mais le contrôle cible n'existe pas encore.
Fichiers candidats en lecture seule : BaseChat clientHydrated=false puis useEffect(true), showMobileChrome ; Chat.client PendingComposerShell→ChatImpl ; routeIDE ClientOnly/Suspense ; MobileOverlayFocus restaure ensuite. Pas de correctif de rejeu différé d'action proposé. Le lien avec chaque ancien échecCI n'est pas certifié.
Les deux cas tabs de cette première recette échouent pour une autre raison : navigation préparatoire cherchait button-more dans headerAgent, qui ne propose pas ce bouton ; précondition de harnais, pas défaut produit. Reçus conservés.

### Dialogues modaux sans entrée/confinement du focus
`focus-modal-baseline/receipt.json` :390×844, ouverture par clic confirmée, trois surfaces aria-modal=true. Panels/Tools : ShiftTab depuis premiercontrôle va au backdrop ; Tabs va au boutonMore du dock. Tab depuis derniercontrôle va àBODY dans les trois cas. Escape ferme et rendfocus àl'ouvreur.
`focus-entry-baseline/receipt.json` : aucun focus forcé dans dialogue. Aprèsouvertureclic, activeElement=BODY pourles3 ; premierTab natif va derrièreoverlay vers mobile-editor-run-toggle(Panels),button-more(Tools),tab-preview(Tabs). TroisJPEG parrecette. Correctif focus confié au propriétaire parent, pas réalisé ici.

## Recette responsive complémentaire
`resize-pointer-navigation.cjs` utilise More du dock par clic pour la navigation préparatoire Files/Editor répétée, afin d'isoler le trouclavier initial sansprétendrelecorriger. Ouvertureclavier/largeurs/query/Escape ensuite inchangés. Verdict consigné séparément après exécution.

## Limites
Pas appareil physique, Safari, backend réel, IA, secret, connexionGitHub ou artefact834. Aucune action de copie/sauvegarde/publication. Profils de test supprimés automatiquement après fermeture de chaque contexte ; serveurs parent préservés. Les assertions ne sont pas assouplies.

### Verdict responsive avec navigation préparatoire au pointeur
`resize-pointer-navigation/receipt.json` :4/4verts,16transitionsFiles/Editor. Tabs390→820→390 conservequeryEditor ; Panels820→1180→820 et390→844×390paysage→390 restentbornésgéométriquement ; Tabs1180→1280 seferme commeprévu enmodeDesktop, retour1180 neréouvre pas spontanément et recherchevide àl'ouverturesuivante. Escape rendfocusdans4cas. PaspreuvequecourseEnterinitialeestcorrigée : l'ouverturepréparatoireauclicl'isolevolontairement.

### Recette future fixfocus préparée, non exécutée
`focus-matrix.cjs` :390/820/1180/paysage844×390,3dialogueschacun, entrée naturelle+premierTab+extrémitésTab/ShiftTab+Escape etqueryWebview/focus préservés lorsresize du sélecteur. Cette préparation a ensuite été exécutée : voir la validation finale dans le README parent.

## État final

La validation compilée est maintenant acquise ; résultats exacts et limites dans [le rapport commun](../README.md). Les observations rouges précédentes restent historiques et ne sont pas effacées. Publication et production non validées.
