# Validation locale composition et handoff

17 scénarios couverts :15 verts au premier passage,2 scénarios outside verts après deux corrections du harnais. Aucune relance automatique, aucun second build. Échecs conservés : sélecteur aria-label partagé par Search files/Filter files ; puis journal exigeant un Monaco visible alors que le panneau Search avait correctement remplacé l’éditeur. Les assertions clic, frappeREADME, focuscible et anciennœuddétaché sont conservées. Les trois versions du test sont hashées dans test-provenance-final.json ; la première correspond exactement à la source embarquée dans la trace.

Le scénarioCDP de composition attend le véritable historique reçu, vérifie le maintien du même textarea pendant composition, commit日本, puis vérifie ChatImpl et saisieZ donnant exactement日本Z. Le contrôle stable passe. Le scénarioextérieur clique réellement Search puis saisitREADME dans la recherche focalisée ; le modèleéditeur horsvue n’est pas revendiqué inchangé (valeurjournalnull). Les deux scénarioshandoff/extérieurs passent aussi au zoom Chromium natif200% (1440CSS depuis2880physiques), sans zoomCSS.

Régressions couvertes : handofffocus/caret2, sortieclavierMonaco1, mobilesquery/focus8, saisieordinairecontinue20ms1. Sourcesproduit identiques au manifeste prébuild ; build terminé0. ESLint/Prettier du test final verts. Fixture synthétique surAPI et PostgreSQL locaux réels, GETstartup réellement retardé puis libéré ; aucune réponse métier remplacée. Écritures navigateur et destinationsexternes bloquées. Aucune validation IMEmatériel, Safari matériel ou production.

Preuves : final-receipt.json, final-behavior-evidence.json, captures dans final-targeted-results, composition-native-results, outside-verified-results et outside-native-verified-results. BaselineIMErouge conservée dans ime-resume-results et ime-focus-results.

Nettoyage :WEB214251/API210082+210047 absents ; conteneurside-continuous supprimés ; ports5199/3018/55448/56388 fermés ; serviceconcurrent96853 préservé. Aucun commit/push par le sous-agentQA.
