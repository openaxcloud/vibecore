# Auth7 — contrats et plan de recette

Base isolée /workspace/vibecore-ui-auth-next :05c4e412e0ad21b77a36a26dad5091f7d7bf9bde (merge main3eb70894 + correctifs UI locaux). Dépendances existantes partagées par symlink, aucune installation. Les30 PR ouvertes ont été inspectées via leurs fichiers GitHub : aucun chevauchement avec Auth7, signup ou composantsauth, reçu open-pr-files.json. Aucune source modifiée.

| Route allouée | GET | POST / effets éventuels | Plan de fixture |
|---|---|---|---|
|/auth/oauth/:provider|GETAPI /auth/oauth/{google,github}/start, cookies state/link/return puis redirection fournisseur ; providerinvalide→login|Aucun actionlocal ; GETgénèreétatOAuth côtéAPI|Fixturestartreadyfalse/503 ; readyURLstrictlocalhost avec state littéral synthétique, redirection jamais tierce|
|/auth/oauth/:provider/callback|GETpeut effectuerPOSTAPI callback oulink après vérificationcode/statecookie ; posecookie session seulement si réponse token|Échange code contre session/lien dansbackendréel : interditici|Erreursprovider/code absent/stateinvalide sansPOST ; paire synthétique cohérente uniquement contrefixture6199, réponses rejet400/503 oumissingtoken ; aucune création/login réels|
|/forgot-password|Localelangue uniquement|POSTAPI /auth/password-reset/request : pourrait envoyeremail|Fixturelocale opt-in, réponses erreur400/503/succès{} sansemail ni token|
|/logout|Redirige/login sans effacer session|POSTAPI/auth/logout puisclearcookie mêmeenpanne|GET/POSTuniquement cookies factices ; fixturelogout ne révoque rienréel|
|/register|Réexportsignup ; redirectionhôtecanonique etsessiondéjàouverte, GETAPI/oauth/providers|POSTAPI/auth/register peutcréercompte/session/envoyeremail|Contexteanonyme ; validationsHTML/action puisfixtureerreur409/503. Succèscréation decompte ettoken réel NONexercés|
|/reset-password|Localelangue +champ prérempli tokenquery|Vérifie longueur/confirmation puisPOSTAPI/password-reset/confirm qui changeraitmotdepasse|Token littéral SYNTHETIC-INVALID, erreurs400/503 etsuccèsfactice sans modificationdonnées|
|/verify-email|Localelangue +champ prérempli tokenquery|POSTAPI/verify-email valideemail ; intentresend→POST/send-verification émetemail/token, cooldownclient|Fixtureerreurs400/503 etstatutssynthétiques ; aucunemail/tokenréel. Branchedevtoken nonnécessaire|

Dénominateur7 routes :4 pagesrendues (register réutilise signup mais URL réellementvisitée) +3routes protocole/redirection. Ne pas présenter comme7 écrans distincts ni donnercouverturehéritée automatique auxalias.

Prévu : géométrie des4pages aux5formats320/390/844×390paysage/820/1440, FR/EN clair/sombre =80 observations, plus parcoursclavier/Back/resizependantsaisie/validations etstatutserreurs. Les3routesprotocole seront testées parcontratsHTTP redirections/cookies/erreurs etleur destinationlocale, paspar80capturesfantômes.

Toutesdonnées/identifiants/motsdepasse/tokenlittéraux sont synthétiques, danscontexteséphémères. APIlocale distincte6199, app11999 envisagés aprèsvérificationports. Fixture refusepar défaut toutendpoint inconnu, toutauth/login réel, touteémissionemail oucréationcompte ; endpoints dePOSTautorisés renvoient seulementréponses préconfigurées. Navigateur bloque tiers etnonGET nonallowlist. ServeurAPI_URL strictlocalhost couvreégalementPOSTcaché dansloaderOAuthcallback. Aucunbackendréel/OAuthprovider/liveuser consulté. Aucunlogbody/password/token/cookie.

Composants partagés (AuthScreen, PasswordStrength, dictionnaires, root/styles) : aucuneédition sans coordination ; corriger seulement défautreproduit etrevue. Cette cartographie n'est pas une recette réussie.
