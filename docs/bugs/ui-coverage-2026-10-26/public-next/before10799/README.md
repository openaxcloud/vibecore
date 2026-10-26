# Templates public anonyme et Docs — audit local10799

Build796 existant de vibecore-ui-major, aucun build ni modification source. App10799 et API5799 dédiées. Chaque contexte commence sans cookie ; seul ecode_theme est ajouté, jamais vc_session. Toutes les URL Templates visitées restent /templates (aucune redirection/dashboard). Catalogue fourni par le loader local existant ; le backend fixture refuse les accès anonymes et les mutations. Toute requête navigateur nonGET ou tierce est bloquée.

## Matrice réelle

32 observations : /templates et /docs ×320/390/768/1440 ×FR/EN ×clair/sombre, hauteur900. Les URL exactes sont dans receipt.json ; aucune preuve transférée à /marketplace/templates, /help ou /help-center.

8 parcours : quatre groupes langue/thème par route.

- Templates : recherche sans résultat et URL?q=, saisie conservée320→1440→390, Escape conserve la saisie (pas une promesse d’effacement), réinitialisation restaure catalogue, filtre au Space avec aria-pressed et URL?tag=, Tab, logo→Accueil→Retour. Aucun lien Use template, import, téléchargement ou création activé.
- Docs : aucune recherche disponible ; huit ancres internes, activation de la première au clavier, Escape, resize puis logo→Accueil→Retour. Les autres ancres ne sont pas toutes parcourues.

Aucune erreurJavaScript ni mutation tentée. Captures pleinepage320/1440 et captures rapprochées diagnostiques. Inspection visuelle ciblée de la première carteTemplatesEN320, première ancreDocsFR et écran503 ; pas d’inspectionpixel exhaustive de chaque capture.

## Défauts et propositions non appliquées

1. **Templates EN320, clair/sombre** :12cartes débordent àdroite jusqu’à366,81px ; liens Use template jusqu’à341,81, malgré document.scrollWidth320.99éléments de contenu signalés par cas. FR320 et les autreslargeurs n’ont pas de dépassement détecté. Cause : piste de grille implicite et groupes flex non repliables. Contrepreuve DOM ENclair320 : toutes les cartes x16→304, aucun bouton horsviewport après piste minmax(0,1fr), min-width0, titre sécable et repli header/métadonnées. Texte, badge, image et action restent présents. `proposed-templates.patch` vise seulement EcodePublicResourcePages.tsx, ses deux grillesTemplates et TemplateMarketingCard.
2. **Docs : première ancre masque le titre**, FR/EN clair/sombre à320 : sectiony≈24, titrey≈49, header111. Contrepreuve DOM FRclair : scrollMarginTop9rem, sectiony144 et titrey169. Proposition locale au FeatureSection, pas de styleglobal.
3. **Docs : instruction de développement visible** dans chaque légende : « Maquette… remplacez-la par une vraie capture dans /public/marketing/agent-mentions.png après la capture. » L’équivalentanglais est présent. Les assets nommés n’ont pas été trouvés au chemin public inspecté. La proposition conserve tous les schémas et étapes, les décrit honnêtement comme illustrations, retire uniquement l’instruction destinée au développeur et le chemin interne. Elle ne prétend pas ajouter de vraies captures ni valider les fonctions présentées.
4. **Docs : pas de h1**, premier titre h2 puis sections h3. ConstatDOM dans16cas, pas un test lecteurécran. Proposition h1 du guide, h2 des sections/prérequis, classes locales conservées ; taille calculée à mesurer après compilation car les styles globaux distinguent h2 et h3.

`proposed-docs.patch` vise AgentWalkthrough.tsx et son catalogue agent-walkthrough.ts. Il regroupe2–4. Toutes ces propositions restent /tmp, non appliquées, non construites ni validées sur un build. Aucun correctif déclaré livré.

## Panne GET synthétique distincte

Un GET navigateur `/templates.data?lang=fr&q=synthetic-503-recovery` a été remplacé par une réponse503texte, pour simuler une indisponibilité du flux de données ReactRouter. Ce n’est pas un appelbackend réel ni une soumission. Résultat : page d’erreur avec titre, explication et boutons tous nommés « Unavailable », shellanglais malgré URLfr. Capture templates-get503.png prise après retourenhaut, texte et URL dans proof.json. L’utilisateur ne peut pas comprendre les actions proposées par leurs libellés.

Après retrait de la panne et rechargement navigateur : retour au catalogue public, même URL/q et saisie, toujours sans vc_session. Aucun bouton à libellé indistinct activé. Ce défaut d’erreur/localisation est conservé séparément et **sans patch**, car sa cause peut relever de la frontière d’erreur/i18n commune ; accord de périmètre et diagnostic supplémentaires nécessaires. Pas de panne403 artificielle : ce catalogue estpublic et les deux loaders n’ont pas de dépendance distante nécessaire dans ce contexte anonyme.

## Processus et limites

api-process.json/server-process.json enregistrent PID enfant réel, heure, startTicks, port et log. Harness navigateur enregistrés dans browser-processes.json/proof-processes.json. Navigateurs fermés. Cleanup compare les startTicks avant signaler seulement les PIDpropriétaires ; closed-ports.json confirme connexionrefusée sur10799/5799. Aucune donnée ou session réelle utilisée.

Pas de zoom200%, paysage, contraste calculé, clavier virtuel/safeareas physiques, lecteurécran réel, Safari/Firefox, authentification, modèle téléchargé/importé ou backend réel. Les illustrations Docs et le catalogue affiché ne valident pas les moteurs décrits. Aucune certificationproduction ou couvertureglobale. Les matrices et diagnostics précédents restent séparés ; les reprises pour obtenir une capture503 correctement cadrée ne comptent pas comme nouveaux cas.
