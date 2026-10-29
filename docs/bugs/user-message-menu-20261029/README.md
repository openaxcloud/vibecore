# Recette locale du menu utilisateur

Base : main `63e66383055c632865b7ebd27df19aa1a6f6f37f`. Aucun projet client,
appel fournisseur, accès production, téléchargement SBOM ou déploiement.

Chromium système exécuté par Playwright sur serveur HTTP lié à 127.0.0.1.
UserMessage, MessageContextMenu, hook/positionnement et CSS compilés sont réels.
Le banc remplace Markdown par un paragraphe, la traduction par le catalogue FR
et les constantes de métadonnées ; le composeur et le changement de projet
sont des cibles synthétiques, pas une navigation de l'IDE complet.

- `before.json` : Maj+F10 n'ouvre rien sur le composant initial, aux largeurs
  1440/768/390 ; clic droit positif dans les trois cas.
- `keyboard.json` : douze parcours après correction, texte/tableau et courts/longs aux trois
  largeurs. Ouverture, bornes viewport, flèche, Échap et retour ligne, édition
  sans voler le focus du composeur, Tab, puis remplacement du message.
  Zéro exception page. Les prises de focus de la fixture sont stabilisées sur
  deux frames avant de simuler le raccourci.
- `touch.json` : événements tactiles Chromium via CDP, 390/768. Appui long,
  relâchement sans édition accidentelle, tap explicite sur l'action, puis
  réouverture et fermeture au défilement. Avant correction du touchend, le
  relâchement produisait mousedown/up/click sur Modifier et focalisait le composeur.
- PNG : menu ouvert sur message long, 390 et 1440. L'en-tête et le composeur
  minimalistes sont ceux du banc ; ce ne sont pas des captures de production.

Les tests durables sont `UserMessage.menu.spec.tsx`, `MessageContextMenu.spec.tsx`
et `message-context-menu.spec.ts`. Ce reçu ne certifie pas Safari iOS physique,
les technologies d'assistance, ni la recette complète après livraison.

La variante tableau conservait initialement le menu dans une bulle avec backdrop-filter ;
Chromium mesurait y=888 + hauteur58 pour viewport900. Le menu est maintenant
frère de la bulle, comme dans la branche texte.

## Rejouer le banc

Depuis la racine, après le build web, avec Chromium installé :

```sh
node docs/bugs/user-message-menu-20261029/harness/build.cjs
BEFORE=1 node docs/bugs/user-message-menu-20261029/harness/build.cjs
python -m http.server 18837 --bind 127.0.0.1 --directory /tmp/vibecore-user-menu-evidence
# Dans un second terminal :
node docs/bugs/user-message-menu-20261029/harness/before.cjs
node docs/bugs/user-message-menu-20261029/harness/check.cjs
node docs/bugs/user-message-menu-20261029/harness/touch.cjs
```

Les scripts n'appellent aucun backend. Les sorties sont limitées au dossier
`/tmp/vibecore-user-menu-evidence`. Le mode BEFORE lit les trois fichiers produit
du commit de base via git ; il ne remplace aucun fichier de travail.

Validation du lot final : 87 tests groupés, typage officiel complet, build
client/serveur et catalogues i18n verts ; lint complet sans erreur (52
avertissements existants). Revue indépendante favorable, y compris le listener
tactile et le déplacement du menu tableau. CI distante et recette production
restent des étapes séparées ; aucune fusion/livraison n'est réalisée par ce lot.
