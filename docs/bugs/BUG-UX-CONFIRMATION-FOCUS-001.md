# Annuler une confirmation perd le focus clavier

## 📤 Dispatché

Lot UX du 21 octobre 2026, distinct de #750. Base : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`.
Périmètre produit : `app/components/ui/Dialog.tsx`, uniquement les consommateurs de `ConfirmationDialog`.
Dashboard/signup, Monaco, BaseChat et CI inchangés. Pas de fusion automatique.

## 💻 Codé

Correctif préparé sur `audit/panel-actions-20261021`, pas intégré sur main.
Une confirmation contrôlée n'a pas de `RadixDialog.Trigger`. À sa fermeture, Radix ne trouve donc aucun bouton auquel rendre le focus. Le dialogue mémorise désormais l'élément actif lors de son autofocus initial et le refocalise à la fermeture, s'il existe encore dans le document. Les autres types de dialogue conservent leur comportement.

## ✅ Testé live

Validation locale uniquement ; aucune validation production revendiquée. PostgreSQL dédié `vibecore_ux_20261021`, API réelle sur 3013, Chromium système, données synthétiques. Aucun appel fournisseur, aucun mock réseau.

### Reproduction avant correction

Sur le build de #750 (`e996671e600322a5c5df8f70f4ad8f4cfe766707`, le composant Dialog y est identique à main), ouvrir `/projects/:id/snapshots?lang=en`, focaliser « Restore UX cancellation checkpoint », Entrée, puis « Cancel » : `document.activeElement.tagName === 'BODY'`. Même résultat après Escape. La création préalable de l'instantané par le panneau IDE a réellement enregistré sept fichiers du projet synthétique.

La recette de non-régression crée un instantané par le formulaire réel, recharge la page pour vérifier sa persistance, ouvre sa confirmation au clavier, parcourt les deux boutons avec Shift+Tab/Tab, annule au clavier ou au toucher, puis vérifie le retour du focus. Elle répète la fermeture avec Escape et vérifie qu'aucune requête de restauration n'a été envoyée. Les assertions ne sont pas diminuées pour faire passer le correctif.

### Limites et dépendances

La route autonome Instantanés et le panneau IDE sont deux surfaces différentes. Le bouton Restaurer du panneau IDE utilise un formulaire direct dans BaseChat ; son éventuelle confirmation doit être auditée séparément et coordonnée avec le propriétaire de ce fichier. Cette correction ne prétend pas traiter cette surface.

L'audit ne certifie ni les restaurations effectives, ni les sauvegardes externes, ni les erreurs fournisseur, ni les lecteurs d'écran ou WebKit. Il ne certifie aucun panneau entier. Seuls les gestes d'Activité détaillés plus bas sont vérifiés. Les autres dialogues utilisant ConfirmationDialog bénéficient du correctif mais ne sont pas tous exercés.

### Essais intermédiaires

Une première construction a échoué sur une erreur de syntaxe pendant la réduction du diff ; corrigée avant la validation finale. Une tentative navigateur lancée pendant le remplacement du répertoire build s'est arrêtée sur l'écran de chargement ; ce n'est pas une preuve du comportement produit. Les builds avant/après doivent être conservés séparément pour éviter ce mélange.

Une passe sur l'organisation partagée a atteint son quota mensuel de cinq instantanés : HTTP 429 réel, message UI « Too many snapshot requests were sent. Wait a moment and try again. ». Le conseil d'attendre est inadapté à ce quota ; défaut transmis pour coordination, sans modifier les quotas ni répéter cette action refusée sur cette organisation. Les fixtures de la recette ont ensuite été isolées par scénario, chacune gardant les quotas normaux.

Une passe concurrente avec les contre-épreuves a rencontré des erreurs API 500 et des dépassements de délai avant le formulaire ; `/health` a dépassé cinq secondes. Après arrêt des anciens serveurs web et fin de la concurrence, `/health` est revenu à HTTP 200 en 70 ms. PostgreSQL ne montrait aucun verrou bloquant. Ces erreurs ne sont pas attribuées au correctif Dialog et ne valent pas validation.

### Résultats du correctif

Le build corrigé est construit depuis main avec le seul changement produit Dialog.tsx. Port 5197 ; manifeste et archives dans `ux-confirmation-2026-10-21/version.json`.

| Action réellement exercée | Bureau 1440×900 FR/EN | Tablette 768×1024 FR/EN | Mobile 390×844 FR/EN |
| --- | --- | --- | --- |
| Charger un instantané réellement persisté | Réussi | Réussi | Réussi |
| Ouvrir sa confirmation par Entrée | Réussi | Réussi | Réussi |
| Focus initial Annuler, boucle Shift+Tab/Tab | Réussi | Réussi | Réussi |
| Annuler et retrouver le bouton d'ouverture | Réussi, clavier | Réussi, toucher | Réussi, toucher |
| Rouvrir puis fermer par Escape, focus restitué | Réussi | Réussi | Réussi |
| Aucune requête de restauration envoyée | Vérifié | Vérifié | Vérifié |
| Pas de débordement horizontal du document | Vérifié | Vérifié | Vérifié |

Résultats structurés : [confirmation-existing.json](ux-confirmation-2026-10-21/confirmation-existing.json). Recette exécutée : [confirmation-recipe.cjs.txt](ux-confirmation-2026-10-21/confirmation-recipe.cjs.txt), Chromium système et sessions synthétiques locales, sans interception réseau. Les captures `after-dialog-*` et `after-cancel-*` couvrent les six combinaisons. La contre-épreuve desktop EN sur #750 échoue exactement sur le focus après annulation ; captures `before-*` et [journal](ux-confirmation-2026-10-21/counterexample.txt). L'essai de contre-épreuve FR a dépassé son délai avant d'atteindre cette assertion, et n'est donc pas une deuxième reproduction probante.

**La recette E2E complète création → rechargement → confirmation n'est pas entièrement verte en une passe.** La passe en série a réussi 4/6 cas ; desktop EN a ensuite réussi seul (10 s). Mobile FR a réellement obtenu un 201 à la création, puis dépassé les 30 s avant la fin du rechargement (GET initial 10,49 s, POST 13,28 s, GET suivant 4,16 s, plus le rendu). Le contrôle séparé de sa confirmation persistée a ensuite réussi. Les journaux `e2e-combined.txt`, `e2e-desktop-en.txt`, `e2e-mobile-fr-limit.txt` gardent ces distinctions. Aucun timeout augmenté, assertion retirée, quota exempté ou retry automatique.

Le journal API confirme des erreurs `API_ERROR: timeout exceeded when trying to connect` au pool PostgreSQL lors des passages en surcharge. Ce point reste à examiner avec le chantier serveur. Les validations de focus réussies ne certifient pas les performances ni la disponibilité de l'API.

### Compléments de #750, tête inchangée

Sur une reconstruction isolée du SHA `e996671e600322a5c5df8f70f4ad8f4cfe766707`, les trois gestes demandés par la revue ont réussi en FR et EN : clic extérieur dans le champ de l'agent, transfert du focus vers ce champ, Shift+Tab. Dans les deux premiers cas le menu se ferme et le champ conserve le focus ; Shift+Tab ferme le menu et atteint le bouton Historique des conversations. [Résultats](ux-confirmation-2026-10-21/menu-extra.json), [recette](ux-confirmation-2026-10-21/menu-extra-recipe.cjs.txt), captures `menu-extra-en.png` et `menu-extra-fr.png`. Aucun fichier de #750 ni son SHA n'a changé.

La première tentative utilisait un message de readiness qui n'était plus sélectionné dans l'état du chat ; la recette reprend donc la création d'un message utilisateur synthétique persisté déjà utilisée par #750. Un autre essai avait sélectionné le textarea de Monaco au lieu du champ de l'agent ; ce sélecteur est corrigé, sans conclure à un défaut produit. Aucun appel de modèle IA.

Les deux archives compilées et les manifestes détaillés sont conservés sous `/workspace/ux-artifacts/` : `confirmation-fixed-build.tar.gz`, `confirmation-fixed-manifest.json`, `menu-750-build.tar.gz`, `menu-750-manifest.json`. Le manifeste contient les empreintes de toutes les sources app/packages/services/public suivies ainsi que de chacun des 2304 fichiers compilés. La reconstruction de #750 a sa propre empreinte ; ce n'est pas l'artefact original de sa première recette.

### Validations statiques et complémentaires

Construction de production réussie. ESLint ciblé et formatage vérifiés. Dix tests ciblés des utilitaires de sélection, du dialogue de palette et des dialogues GitHub/GitLab passent ; seize tests du générateur d'inventaire passent. Ces tests de composants complètent les gestes navigateur, ils ne remplacent pas la preuve locale réelle. Le typecheck complet et le lint global seront exécutés par le hook obligatoire du commit.

### Activité : gestes locaux vérifiés, sans modification produit

Sur les trois formats, en français : chargement d'événements réels (100 dans la fixture), recherche d'une chaîne absente et affichage de l'état vide, effacement du filtre et retour des événements ; Entrée ouvre les métadonnées d'un événement et une seconde Entrée les referme. Le mode hors ligne de Chromium provoque ensuite l'échec réel de fetch ; « Réessayer » après retour en ligne recharge la vraie réponse API et réaffiche les événements. Aucun débordement horizontal du document constaté. [Résultats](ux-confirmation-2026-10-21/activity.json), [recette](ux-confirmation-2026-10-21/activity-recipe.cjs.txt), captures `activity-empty-*`, `activity-offline-*`, `activity-recovered-*`.

Il s'agit d'une coupure réseau côté navigateur, sans réponse substituée ; ce n'est pas une recette de panne serveur ou de production. Aucun événement n'est fabriqué dans la réponse API. Le premier essai attendait les lignes avant la réponse de rechargement et a échoué ; la recette attend désormais la réponse réelle après Réessayer, sans délai fixe ni extension de timeout. Les filtres par utilisateur/période, liens vers d'autres panneaux et droits d'accès restent non certifiés.
