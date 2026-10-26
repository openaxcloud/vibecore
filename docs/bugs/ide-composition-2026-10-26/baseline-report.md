# Saisie continue — baseline locale62a072e97

Build précédent vérifié inchangé, aucun rebuild ni modification produit. Fixtures synthétiques créées via API locale réelle et PostgreSQL isolé ; GET ide-state réel retenu puis relâché. Écritures navigateur et appels externes bloqués.

| Scénario | Résultat | Qualification |
|---|---|---|
|24 lettres,80ms, libération au keydown h|Vert, modèle exact|Intervalle de remplacement ~109ms observé ; aucun caractère dispatché dans ce gap sur cet essai.|
|Intention Library au milieu de chaîne|Vert|Préfixeabcdefgh conservé, aucun retour forcé dans Monaco.|
|62 caractères,20ms, libération au keydown h|Vert, modèle exact|Tous les keydown observés ciblent TEXTAREA ; ne démontre pas toute cadence/hardware.|
|CompositionCDP stable に→日本→commit→Z|Vert|Compositionend observé, modèle日本Z.|
|CompositionCDP à travers remplacement puis commit→Z|Rouge|Nouveau Monaco non focalisé, BODY ; modèle日本 sansZ. Aucun compositionend ni keydownZ après remplacement.|
|Diagnostic composition, touchez et focusdocument|Rouge|document.hasFocus=true avant/aprèscommit et aprèskeypress ; activeElementBODY. Aucun événementkeydownz consigné.|

Les premiers testsIME contrôlant seulement日本 étaient verts mais leur oracle insuffisant : la précomposition était déjà dans le modèle. Les preuves sont conservées, non présentées comme validation de continuationIME. Le défaut de focus est observé sous ChromiumCDP ; le protocole de composition interrompu ne permet pas d'affirmer une perte de touches sur un IME matériel. Aucun tampon clavier ni correctif produit ajouté. Un champ readonly/disabled n'est pas observé après remplacement ; l'éditeur réapparaît mais reste sans focus dans le scénarioIME. Les essais ordinaires ne reproduisent pas de perte de caractères.

Preuves : inside.json, outside.json, fast-control.json ; ime-resume-control.json, ime-resume-handoff.json, ime-focus.json. Captures et traces dans les répertoires correspondants *-results. Stack isolée encore disponible pour coordination ; aucune production ou Safari matériel testé.
