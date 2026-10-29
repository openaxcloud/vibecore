# Collaborators — perte de brouillons au commit responsive

29 octobre2026. Build local47b1e2e922 (arbre identique au lot validé f978), Chromium, API et runtime synthétiques. Aucun fichier produit modifié. Aucun submit, invitation, commentaire, permission, sauvegarde ou appel IA. Tous les navigateurs fermés par finally ; serveur parent inchangé.

## Reproduction et preuve

`LABEL=committed-resize node /workspace/ui841-collab-draft/probe.cjs` effectue trois essais bornés. À1280px : panneau Collaborators chargé, sonde WebSocket stable, saisie de l’identifiant synthétique (18caractères) et du commentaire non envoyé (25caractères). Chaque champ vivant est vérifié avant redimensionnement. Passage à390px, attente explicite de la navigation mobile réellement rendue, puis deux requestAnimationFrame et du panneau/champ visibles. Aucun délai arbitraire ajouté à un test du dépôt.

`committed-resize/receipt.json` : **3/3 pertes reproduites sur le premier passage1280→390**. À la phase desktop, champs vivants identifiés1/2 de longueurs18/25. Après commit mobile, champs3/4 visibles de longueur0. URL, clé et routeur idle restent `?panel=collaborators`, aucun changement de projet ni de panneau demandé. Zéro erreur JavaScript, zéro POST collaboration. Les assertions de valeur échouent ; le retour1280 n’est donc PAS exécuté par ces essais, et n’est pas revendiqué comme testé.

Essais1/2 : les deux anciens handles sont connectés avant resize, détachés ensuite tout en gardant leurs valeurs18/25 ; preuve directe du remplacement des nœuds. Essai3 : le handle d’invitation obtenu avant fill avait déjà été détaché lors du chargement initial ; cette particularité de sonde ne sert pas de preuve d’identité. En revanche les champs vivants étaient vérifiés remplis avant resize et sont vides sur les nouveaux nœuds après commit. Les deux premiers essais suffisent à établir le mécanisme.

Cela corrige la limite des anciennes recettes `collaborators-draft-cross` : elles redimensionnaient aller-retour avant d’attendre un commit mobile et pouvaient garder les mêmes nœuds. Leur résultat vert ne contredit pas cette nouvelle preuve.

## Cause établie et périmètre

Dans `app/components/chat/BaseChat.tsx`, branche `ProjectIdePanelContent(panel === 'collaborators')`, les champs d’invitation `userId` et de commentaire `body` sont des `PanelInput` non contrôlés, sans valeur sauvegardée hors DOM. Le remontage responsive remplace ces nœuds ; leurs valeurs DOM ne sont donc pas transférées. Le snapshot collaboration ne contient pas ces brouillons et n’a aucun chemin affectant leurs valeurs : ce n’est pas une donnée serveur qui les remplace dans cette recette.

## Proposition de correctif, non appliquée

Extraire un composant Collaborators avec état de brouillon éphémère au-dessus de la surface qui se remonte, isolé par projet et paneId. Conserver explicitement les champs de formulaire non secrets (identifiant invitation, chemin/ligne/corps commentaire, et choix de formulaire si le scope est retenu), sans copier `terminalPermissions`, liens/tokens de partage ni état d’autorisation serveur. Aucun localStorage, aucune mutation automatique.

La remise à zéro doit correspondre uniquement à un envoi confirmé et à la version envoyée du même formulaire/panneau, pas à n’importe quel événement global `vibecore:ide-panel-action` (actuellement sans identifiant projet/pane). Ne pas effacer une saisie plus récente pendant une requête, ni les brouillons d’un autre panneau/projet. Les API existantes et leurs permissions restent inchangées. Le provider Settings existant illustre une frontière de durée de vie stable mais ne devrait pas être élargi aveuglément à des données de collaboration.

Fichiers probables : BaseChat.tsx (rendu Collaborators et raccord précis de remise à zéro), nouveau composant/provider de brouillons dédié, éventuellement wrapper stable dans IdePaletteState.tsx après coordination. Tests nécessaires : remontage desktop/mobile réel, sens inverse, panneaux/projets isolés, erreur503 conserve, succès confirmé consomme seulement la version envoyée, fermeture explicite/lifetime route. Aucun patch proposé tant que parent n’a pas validé ce périmètre partagé.

## Limites

Pas de production/backend réel, Safari physique, invitation/commentaire effectivement envoyé. Le sens inverse et les réponses serveur de soumission ne sont pas exécutés ici. Les captures d’échec et reçus sont synthétiques. Aucun lien causal avec le retour interprojet834 établi.

## Implémentation locale autorisée ensuite

Sources modifiées uniquement dans le périmètre coordonné : helper local CollaborationDraftForm et branche Collaborators de BaseChat.tsx ; captureSubmission dans useIdeSettingsFormDraft ; nouveau CollaborationDraftForm.spec.tsx. Aucun handler générique/API modifié. Le parent a explicitement autorisé la préservation complète des formulaires éphémères : identifiant + sélection de rôle UI ; corps de commentaire + chemin + ligne. Aucun droit serveur, token, lien de partage ou secret stocké.

Consommation après confirmation existante par reset du formulaire original, listener natif conservé pendant la promesse même si ancien nœud détaché. Le reset est annulé sur ces formulaires entièrement contrôlés : React efface atomiquement les champs uniquement si toutes leurs entrées correspondent encore à la version envoyée. Une édition récente/ABA conserve tout le contexte. Garde locale de soumission simultanée sur le même formulaire, cleanup finally sur erreur même synchrone ; aucun événement global non scopé utilisé.

Tests ciblés :13/13 composant réel extrait + vrai provider,10/10 SettingsFormDraft existants. Cas supplémentaire réellement rouge pendant implémentation : nativereset réinitialisait un select encore connecté Viewer→Member malgré état récent conservé ; preventDefault au reset confirmé et consommation React atomique rendent ce cas vert, sans changer l’assertion. Lint ciblé et gitdiffcheck passent.

Recette de validation compilée à lancer par root après build : `LABEL=compiled-full-form node /workspace/ui841-collab-draft/full-form-probe.cjs`. Elle conserve les assertions originales et ajoute Viewer/chemin/ligne, attend commitmobile puis retourdesktop, troisessais. Aucune soumission. Cette validation compilée et le typage/build restent à root ; les tests unitaires seuls ne valent pas preuve navigateur corrigé. Focus/caret du nouveau nœud et production ne sont pas certifiés par ce lot.
