# Revue visuelle indépendante — captures Support / Quota / Downgrade

Inspection seule des images fournies par agents sur environnement local11499, sans navigateur supplémentaire, requêteAPI ou mutation. Pas de certificationWCAG calculée ni de validation interactive déduite d'une pleinepage. Ce dossier ne modifie aucun fichier source/index ou worktreecoverage#797.

## Échantillon réellement inspecté

- Support `/tmp/ui-support-detail-next/{fr-light-320,fr-light-844,fr-light-1440,en-dark-320}.png` : visiteguidée active. Vrai sujet/conversation/formulaire rendus ; textes non sécables repliés. Tour masque des parties, donc ces captures ne justifient pas un verdict d'absence d'occlusion ni de contraste sidebar.
- Support sansTour `/tmp/ui-support-detail-next/no-tour/{en-dark-320,fr-light-844,en-dark-1440}.png` : sujet, deux messages, statut, dates, zone de réponse etbouton présents. Pas de texte coupé horizontalement visible sur cetéchantillon ; longueurs extrêmes augmentent normalement la page. La préférencelocale de tour a été injectée par l'agent avantmontage, pas une modification produit. Les textes synthétiques FR dans un écranEN sont du contenu de ticket, pas une fuite de traduction déduite de l'image.
- Quota `/tmp/ui-quota-downgrade/{quota-exceeded-320,quota-exceeded-1440}.png` : FRclair, consigne etdeuxactions présentes, texte entier. À1440 boutons visiblementpetits ; observation cohérente avec la hauteur34px mesurée séparément par ui_review. Objectiflocal44px, pas déclarationautomatique de violationWCAG.
- Quota `/tmp/ui-quota-downgrade/{quota-en-dark-1440-before,quota-en-dark-1440-counterproof}.png` : ENsombre, contenu/labels/navigationidentiques ; contrepreuveDOM augmente la cible sans tronquer le texte. Ce n'est pas encore un rendu compilé du correctif.
- Downgrade `/tmp/ui-quota-downgrade/downgrade-844.png` : FRclair paysage, sélecteurplan, comparaison deslimites, explicationduportail etCTA visibles dans la pleinepage. Aucun paiement/changementd'abonnement ni accèsauCTA parscroll n'est déduit de la capture.

## Remarques transmises

Revue statique favorable de proposed-quota-target.patch : uniqueclasse partagée localement parlesdeuxliens, min-h-11→min-h-[44px] ; destinations, texte, focusring, repli etbreakpointsconservés. Recette compilée aprèsapplication nécessaire.

Support ENsombre1440 sansTour montre des labels sidebar fortementatténués parrapport à QuotaENsombre1440, tandis que les icônes restent lisibles. Observation signalée au propriétaire pour distinguer étattransitoire/style/fixture ; aucune mesurecalculée, cause ou défautglobal affirmé ici. Focusclavier non certifié par des captures sansétatfocus explicite.

L'agentSupport rapporte séparément un brouillon perdu aprèsnavigationRetourassistance→Back ; aucune prétention de reproduction indépendante à partirdesimages. Ses quatre PATCHpréférencesTour ont été bloqués au navigateur : ne pas écrire « aucunPOST/PATCHtenté » pour l'ensemble de sarecette, mais aucune mutationbackend exécutée selonsonreçu.

Pas d'inspection exhaustive des88/44cas, pas toutescombinaisonsFR/ENthèmes parroute. Aucun Safari/Firefox, matériel/safeareas réelles, lecteurécran ouproduction. LescapturesSources restent archivées parleurs propriétaires ; cescheminstmp sont desréférencesdesession, pas une copie des reçus danscedossier.

Complément du propriétaireSupport : `no-tour-interactions/receipt.json` indique lienDashboard principal couleur rgb(194,200,204), opacity1, sans aria-disabled, etlabelopacity1 ; un deuxième lien d'une autre navigationresponsive a labelopacity0. Les ancêtres n'ont pas été mesurés. Ce complément ne suffit pas à attribuer l'atténuation observée à un contrasteintrinsèque : observation non qualifiée, aucuncorrectifcontraste demandé. Lesquatreparcours supplémentaires sansTour confirment le brouillon vide aprèsBack et n'ont tenté aucune mutation ; ce résultat reste celui de l'agentexécutant.


## Complément indépendant — build local final 11599

Six captures finales inspectées : Support `after/dialog-fr-light-320.png`, `dialog-fr-dark-320.png`, `dialog-fr-light-844.png`, `dialog-en-dark-844.png` dans `/tmp/ui-support-detail-next` ; Quota `after11599/quota-exceeded-320.png` et `quota-exceeded-1440.png` dans `/tmp/ui-quota-downgrade`. Aucun nouveau navigateur ni appel API lancé pour cette revue.

Avis visuel favorable sur cet échantillon : les quatre modales montrent leur titre, explication et deux actions entiers. En français à 320 px les actions se répartissent verticalement ; en paysage elles restent dans la fenêtre, sans découpe apparente. Le texte reste visuellement discernable en clair et sombre. Aucune mesure de ratio de contraste, validation de lecteur d’écran ou preuve de focus interactif n’est déduite des images.

Quota conserve le titre complet dans le contenu, les consignes et les deux liens : empilés à 320 px, côte à côte à 1440 px. Les cibles finales paraissent agrandies sans texte tronqué ; le reçu associé mesure bien 44 px sur ces deux captures. L’ellipse du titre de barre supérieure à 320 px ne masque pas le titre complet du contenu. Aucun nouveau blocage visuel constaté.

Les résultats interactifs restent attribués aux agents exécutants : le reçu Support `after/receipt.json` contient quatre groupes de navigation, quatre annulations de changement de langue, huit actions de formulaire synthétiques et un POST de document retournant 302 ; erreurs JavaScript vides. Il distingue neuf POST vers la fixture locale et quatre PATCH de préférences bloqués au navigateur. Il ne permet donc pas d’affirmer « aucune mutation tentée ». Le reçu Quota `after11599/receipt.json` couvre les 44 observations annoncées ; cette revue ne les transforme pas en 44 inspections visuelles indépendantes.

Pas de conclusion sur une version déployée, des données réelles, Safari/Firefox, clavier virtuel ou safe areas matérielles. Les preuves complètes et captures restent sous la responsabilité des dossiers d’archives des agents ; les chemins `/tmp` ci-dessus identifient précisément les fichiers examinés dans cette session.
