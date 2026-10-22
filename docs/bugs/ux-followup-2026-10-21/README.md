# Recette locale du suivi #759 + #760 après #758

Base : `883af053f7c1b85bb472fa53c7fa87b4c8051c9b` (fusion manuelle #758).
Arbre compilé : `6328177594f4ed3df64d316c54a2a9960892b777`.

Ce lot reprend les blobs produit/tests de #759 `c1e6af9982986c7b177c41c88496f548e565f3ac`
et #760 `14a28b881edfbe171c6a1228eeecd8d8d4b13bdb`. Le seul fichier produit modifié
par rapport à main est `app/components/ui/Dialog.tsx`. Le geste mobile cible désormais
le Locator au moment du toucher, sans repli de coordonnées vers (0,0). Escape est traité
sur la confirmation effectivement ciblée ; événements déjà consommés et dialogues
imbriqués restent protégés. Aucun délai, seuil, assertion ou politique de retry n'est assoupli.

La fiche de provenance de déploiement conserve explicitement les états **historiques**
de main `6eb4bf42` pour le générateur. Ils ne décrivent pas l'état actuel du déploiement.
L'index réunit 465 entrées ; aucun changement de workflow, quota ou sécurité.

## Sources et compilation

`sources.json` contient uniquement chemins relatifs et empreintes des 9 163 fichiers
suivis avant ajout de ce dossier de preuves. Tous correspondaient à l'index Git lors
du build. `source-receipt.json` relie le manifeste à l'arbre compilé.
`compiled.json` décrit les 2 306 fichiers compilés, et `build-receipt.json` distingue
l'empreinte du manifeste de celle de l'archive locale `build.tar.gz`. L'archive lourde
reste locale ; aucune archive historique n'est présentée comme cette compilation.

## Banc réel local

Chromium système, serveur React Router compilé sur `127.0.0.1:5211`, API du même
checkout sur `127.0.0.1:3017`, PostgreSQL isolé sur loopback. Sessions et organisations
synthétiques uniquement ; les fichiers privés de préparation et connexions ne sont
pas publiés. Aucun accès fournisseur, courriel réel, restauration de snapshot ou
publication Internet n'est validé. Le cas publication conserve volontairement un
vrai déploiement local en attente/échec pour vérifier l'onboarding.

Configurations versionnées :
- `playwright.launch-journey.config.ts` : trois formats, neuf cas inscription/onboarding.
- `playwright.mobile-gate-audit.config.ts` : 45 cas IDE, profil standard Chromium.
- `playwright.combined-ux-audit.config.ts` : confirmation FR/EN et menu ; sélection
  de la confirmation pour ce suivi, trois formats, puis profil standard Chromium.

Exécution du serveur :
```sh
HOST=127.0.0.1 PORT=5211 NODE_ENV=production SAAS_API_URL=http://127.0.0.1:3017 \
  node_modules/.bin/react-router-serve ./build/server/index.js
```

Pour les tests, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5211` et
`SAAS_API_URL=http://127.0.0.1:3017`. Chromium est `/usr/bin/chromium`, fourni via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` pour journey et `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
pour les configurations d'audit. La recette IDE utilise le mécanisme existant
`UX_QA_AUTH_FILE` avec six fixtures locales, les confirmations créent leurs données
par l'API réelle. `UX_STANDARD_CONFIG=1 --project=chromium` sélectionne le profil
standard pour la seconde recette de confirmation. Retries locaux : zéro.

Les preuves avant/après du défaut Escape restent dans
`../ux-snapshot-escape-2026-10-21/` et ne sont pas réécrites par ce lot.
La réussite de ces parcours ne certifie pas un panneau entier ni la production.

### Limites des cas IDE existants

Le build, les gestes, l'API et PostgreSQL sont réels, mais certains cas de la suite
existante injectent explicitement des événements pour tester un état UI : moteur
SpeechRecognition factice (aucune preuve de microphone réel), flux IA synthétique
(aucune preuve fournisseur), réponse de messages retardée et chunk Workbench retenu
pour les courses de chargement. Ces mécanismes préexistants sont conservés, sans
ajout de temporisation ; leur réussite n'est pas une validation réelle de voix,
modèle ou réseau externe. Les résultats nommés du rapport permettent de distinguer
ces cas des actions API/SQL effectives.

## Résultats achevés sur le commit produit d7fd27fd

| Recette | Succès directs | Échecs | Retries | Skips |
| --- | ---: | ---: | ---: | ---: |
| IDE mobile/tablette, fichier complet | 45 | 0 | 0 | 0 |
| Inscription/onboarding, trois formats | 9 | 0 | 0 | 0 |
| Confirmation FR/EN, trois formats | 6 | 0 | 0 | 0 |
| Confirmation FR/EN, profil standard chromium | 2 | 0 | 0 | 0 |
| Unitaires ciblés, dix fichiers | 55 | 0 | 0 | 0 |

Les 62 cas navigateur et les 55 unitaires sont distincts. Les confirmations réalisent
160 cycles de réouverture/Escape sans requête de restauration. Les JSON `*-summary`
conservent le nom de chaque cas, son statut, sa durée et le numéro de tentative.
Les chemins absolus, environnement du runner et chemins d'artefacts privés sont
retirés ; aucune erreur n'est supprimée (zéro erreur globale dans les rapports).

Build et typage complet : succès. Lint : zéro erreur, 52 avertissements existants.
Hooks normaux exécutés. Gitleaks explicite sur le diff produit : zéro détection.
Voir `checks.json`. Les fichiers de cette recette ajoutés ensuite sont uniquement
documentaires ; le code compilé correspond au commit `d7fd27fdc2bdea60415a4f68746a0e72a1cf5772`.

Les captures `dialog-*-fr.png` montrent la confirmation et son focus Annuler ;
`cancel-*-fr.png` montrent le retour du focus. Sur mobile, la visite guidée reste
active et le bouton focalisé est visible au-dessus de sa carte : la visite n'a pas
été désactivée pour obtenir ce résultat. Ces captures ne prouvent pas une restauration
réelle, et la comparaison de snapshot peut encore être en chargement au moment de
la capture du dialogue.
