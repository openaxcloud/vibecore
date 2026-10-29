# Menus après #847 — base e03b3f856

## Verdict borné
Les incidents historiques167fce ne sont pas reproduits ; ils restent ouverts. Aucun retry dans le run84740839894607 n'est une preuve de résolution globale.

Cinq contextes isolés, **10/10 cycles d'ouverture Enter/fermeture Escape et restaurationfocus réussis** :
- tabs390×900,hasTouchtrue,agent&lang=en,DOMContentLoaded,GETide-statemaintenuenattente : normal etCPU×4+archive500ms,2cycleschacun.
- panels1180×757,hasTouchfalse,editor,load : normal etCPU×4+archive500ms,2cycleschacun.
- témoin tabs390CPU×4 supplémentaire :aucunawaitsnapshotentrefocus etpage.keyboard.pressEnter ;2cyclesréussis. Ce témoin conserve leslistenerspassifs.

`bounded/receipt.json` contient quatre contextes, dont2panelsentièrementverts et2tabs marquéséchec UNIQUEMENT dans l'auditadditionnel de récupérationderecherchevide : il demandaitEditor alorsquegotoAgentn'ouvreaucunongletEditor. Leurs2cyclesprincipauxchacunavaientdéjàréussi. Ceséchecsrestentconservés.
`direct-enter/receipt.json` : témoinentièrementvert, étatvide surqueryintrouvable puisretourqueryvide restaurelesongletsouverts. Aucunseuil/timeoutchangé.

## Événements et chargement
Focusin/out,keydown/keyup/click en capture/bulle, identitésWeakMap desancres/coques/dialogues etMutationObserver. ChaqueEnterciblelebonbouton puis ouvrelemenu ; aucuneperted'événementobservée. Tabs :1remplacementdecoqueobservéparcontexte avantcycles ; panels :2, dontCPU×4 entrecycles, sanséchec. Zéroerreurpage.
Le témoin confirme GETide-state tenu etarchive61fichiers(README+60src)avec500ms deretard. Lesmenus restentutilisablesavantlibérationduGET :preuvechargementisolée,pasbackendréel. Lesmenus sontlocaux ; aucunétaterreurbackend spécifique n'aétéinjecté, ni prétenduvalidé.

## Limites
La portionexacteincidenttabs:92 est avantfillWebview/witness/release ; lespreuvesici couvrent cetteouverture etfermeture, PAS handofftranscriptcomplet. FixtureAPI etarchive synthétiques, pascréation/chargementd'unprojetclient, pasbackendCIréel. READMEconserve leslittéraux\\n présentsdanscreateProject du test source ; aucunavantageproduitdéduit de cettefixture.
Paséditionrepo/commit/publication/CIrerun/artefact834ouSBOM. Navigateursfermés,seulsprofilsTESTcréésici supprimés, serveursparentpréservés.

## Instrumentation proposée si nouvel échec
Installer avantnavigation le mêmejournalpassif danslestests concernés, limité1000–1500entrées etattachéUNIQUEMENT suréchec : timestamp,phasecapture/bulle,typeévénement,key,defaultPrevented,identitéWeakMap/testid/connected de cible+activeElement+shell+trigger+sheet etmutationsmontage/démontage. AjouterinstantanéseulAPRÈSpress,pasroundtripentrefocus/Enter. Ne jamaiscollecterinputvalue,contenumessages,cookies,tokens ni projetsréels. Conserverlesassertionsetbudgets5s, n'ajouteraucuneattente de«stabilité» qui cacherait lafenêtre. Cettepropositionrestehorsrepoetnonpubliée.
