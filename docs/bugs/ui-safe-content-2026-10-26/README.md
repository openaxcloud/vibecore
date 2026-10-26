# AppShell : gouttières du contenu et safe areas

Lot local isolé /workspace/vibecore-ui-safecontent, base502a75737, branchefix/userarea-safe-content-20261026. #797 etworktreecoverage nonmodifiés. Seul fichierproduit concerné : SaaSLayout.tsx, classes de paddinghorizontal du wrappercontenu AppShell. Pas de navigation, action, header, styleglobal ni API modifié.

## Cause et contrepreuve avant application

Baseline11299 sert le buildcoverage existant correspondant au produit de base. PID/startticks consignés dans before/baseline-origin.json ; API5499 explicitement configurée, synthetic GET seulement. À844×390 avec insets latéraux47px, wrappercontenu padding21px etpaddinginterne22px donnent champSecurityx43, soit4px dans la zone réservée.

32 contrepreuvesDOM : FR/EN ×clair/sombre ×320×900/390×844/844×390/820×1180 ×insetsnuls/simulés. Padding max(gouttièreexistante,inset) donne47pxet champx69 en paysage. Les28autrescas (zéroinset ouportrait) conservent exactement leur géométrie ; aucun changementheader dans32cas,0JS. Sourceavant, captures, mesures dans before/. Ces résultats sont des contrepreuvesDOM, pas une compilationducorrectif.

Delta : remplace px4/sm:px6 par paddingsleft/right max(1rem/1.5rem,envsafeinset). Py6/lg:py8,maxwidth,contentClassName etstructure inchangés. Pas d'addition d'inset au paddinginterne. .vc-new-project-content conserve sonoverridepadding0 attendu, à vérifier compilé. Le correctif ne prétend pas fournir une safe-area globale à toute page personnalisée.

## Validation locale

37tests existants/4fichiers réussis (SaaSLayout20,Security7,Switcher4,SIEM6), lintciblé0, tscstrictweb0. Revueindépendante favorable avantbuild. Compilation et recette compilée terminées, détaillées ci-dessous ; aucun push/index effectué.

SimulationChromiumCDP uniquement, pas iOS physique, pas clavier virtuel réel. Fixtures synthétiques, tiers/mutationsbloqués, aucun secret/rôle/connexion/achat/projet créé. Les champs sont des brouillons locaux restaurés. Publication/main/déploiement de ce lot non exécutés.

## Recette compilée11399 terminée

Build complet code0, tscstrictweb0, ESLint0 et37tests existants verts. after11399/matrix.json :32cas réussis, géométries égales aux contrepreuves attendues,0JS. Quatre cas paysage àinsets47 corrigentchampx43→69 ; les28autrescas ne changent pas. Champ44px, headerinchangé, documentcontenu.

Quatre groupes FR/EN ×clair/sombre : brouillonSecurity focalisé, resizepaysage→portrait→paysage avecinsets correspondants, valeur/focusconservés etchamprestauré ; menuEscape, dialogueSwitcherEscape, retourSecurity réussis. after11399/interactions.json. Aucun enregistrement.

Gardes partagées : projects/new conservepadding0 à844×390 avec/sansinsets (exceptioncustomcontent préservée, pas une certificationsafearea de cette page). SIEM à320 conserve défilementhorizontal local àinsets0 etportraitsimulés, document320. Huit étatsdebarrelatérale :1024/1440 ×déployée/repliée ×insets0/47 ; contenucontenu, paddingmaxattendu, documentcontenu. after11399/shared-sidebars.json,0JS.

Un premier guardSIEM cherchait à faire défiler une table à844px oùelle tientdéjà : assertionharness inadéquate, pas un défautproduit. Seuls lesguards partagés ont été repris à320, les32cas et4parcours n'ont pas été rejoués. Le premier lancement navigateur précédait l'écoute du serveur11399 : refusconnexion consigné dans startup-before-ready.log, puisHTTP200synthvérifié avantrelance. Aucun deceséchecs n'est présentécommevalidationproduit.

Détailsversion : baseline11299=buildcoverageproduitbase502a, après11399=buildnouveauworktreesafecontent avec uniquedeltaAppShell. Empreintesaprès dans after11399/source-build.sha256. PreuvesDOMavant etbuildaprès clairement séparées.

Limitations : safeareasChromeCDP, pas matériel iOS, clavierOSouzoomnatif. Changementuniquementhorizontalduwrappernormal ; footer/bottom/top/customcontent ne sont pas nouvellement certifiés. Pas backendréel, aucune création/finance/invitation/connexionSIEM. Publication, index, main et déploiement non exécutés. #797worktreecoverageintact.

Serveurs propres arrêtés après recette : PID158383/port11299 etPID159444/port11399, startTicks comparés à leurs preuves d'origine avantSIGTERM. Les deux ports retournentECONNREFUSED (shutdown.json). Tous les navigateurs fermés. API5499 conservée, usage partagé possible. Aucun autre processus arrêté.

Revue finale indépendante : [final-review.md](final-review.md). Le champ focalisé après certains redimensionnements peut encore toucher le bas du viewport (390px) au lieu de la borne sûre369px ; le correctif est horizontal, sans garantie nouvelle de visibilité verticale du focus.

Lot conservé par un commit local séparé, sans publication ni modification de la tête #797. Gitleaks 8.21.2 complet réussi, sans nouvelle exception.
