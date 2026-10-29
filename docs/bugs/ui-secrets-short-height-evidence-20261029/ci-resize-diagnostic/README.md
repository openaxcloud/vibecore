# Diagnostic CI845 exact resize — head7e2edb884

Séquence reproduite une fois dansChromium local : APISecrets synthétique SLACK_API_KEY préchargée,390×844, filtrezzz(pucecachée), filtreslack(pucevisible), viewport390×200, focusfiltre, Tab, focusclé, prédicatgéométrieidentiqueCI5s. Pascréation/copie/révélation/soumission, sourceinchangée, serveurroot21999préservé.

## Cause mesurée
`exact-sequence/receipt.json` : échecidentique pendanttouteslesmesures5s. Aprèsresize html[data-vc-clavier]='ouvert', dockmasquérectangle0×0. Cléfocusvrai, hit-testvrai, recty152→184, scroller48→200 : aucuneocclusion. Seuleconditionimpossible : scroller.bottom200 <= nav.top0.

Le focusdufiltre est concomitant, PAS la cause établie. BaseChat3110–3178 appelle memoriserHauteurDeRepos puis retrecissementDeLaVue ; visual-viewport-bottom.ts suivreHauteurDeRepos conserve hauteurmax àlargeuridentique.844→200 àlargeur390 donne rétrécissement644≥seuil150, classéclavierouvert sanscheckfocus. index.scss masquealorsnav commeprévu, correctifSecretsestexplicitementexclu danscetétat.

## Proposition sans modifier le produit ni affaiblir les assertions
Pour vérifierdockvisible : nouvellepage/contexte directement en390×200, assertclavierfermé/navvisibleavantprédicatgéométriqueinchangé. Garderchemin844→200 commeparcoursclaviersimulé distinct (navmasquée etcléaccessible), nepasforcerattributHTMLpourfairepasser. Pasdemodificationdumoteurclavieràpartirdeceseuléchec.

## Preuves et limites
`exact-sequence/390x200-final.jpg`,receiptJSON,script exact.cjs. Le local reproduitlaséquenceciblée etleprédicat, pasl'intégralitétestCIaveccréationinitiale ; contexteChromiumstandardzoom100/DPR1 (CIutiliseprofilmobiletouchDPR2). La cause repos/largeur etrectdock0 est directementmesurée ; aucuneexécutionCIrelancée. Tousnavigateursfermés etprofilsTESTcréésici supprimés. AucunartefactSBOM/834, permission, secret, publicationoumerge.

## Séquence corrigée à deux états, compilée sans mutation produit
`two-states/receipt.json`, `two-states.cjs` :1/1parcoursvert. Le cheminoriginal844→200 reste contrôlé : attributclavierouvert, navcachée, cléfocus+hit-test etcontenuezonevisible. Puis page.reloadà200 réinitialise naturellementréférencerepos,GETfixtureSecretsconservé, filtreslack→Tab : htmlclavierabsent, navvisible, clé90→122dansscroller48→128, navtop128, prédicatCIoriginalstricttrue (budget5sinchangé), clicktrialréussi. Retour844 conservefiltre, menuclavierEnter/Escape rendfocus. AucunattributHTML/CSSforcé. Capture `two-states/390x200-reloaded-dock.jpg`. ValidationfullCIprofilmobiletouchDPR2 resteauparent/reviewer. Navigateursfermés etprofilsTESTnettoyés.

## Profil CI mobile exact — confirmation complémentaire
`two-states-ci-profile/receipt.json` : **1/1 réussi dès l'unique exécution**, contexteChromium isMobile:true,hasTouch:true,deviceScaleFactor:2,viewport390×844. Métriques réelles390×844,DPR2,CSSzoom1. Mêmes assertions strictes : keyboardPass,dockPass,menuEscape tousvrais ; clé152→184 sansdock enétatclavier puis90→122 au-dessusnav128 aprèsreload200. PasforçageHTML/CSS, aucunseuilmodifié, pasappareilphysique ni exécutionworkflowCI. Contextefermé/profiltestsupprimé. PreuvesDPR1 précédentes restentdistinctes.
