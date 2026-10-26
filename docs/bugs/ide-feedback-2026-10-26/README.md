# Retours IDE et vignettes — lot isolé

Trois défauts de présentation/récupération sont traités, sans modification d’orchestration, de décision QA, de retry backend ou d’OAuth. Base main951ceb8d5 ; les fichiers de #799 et du hub Intégrations restent intacts.

## Corrections

- Vignettes : après erreur, trois lectures supplémentaires bornées à5/10/20secondes, uniquement sur le proxy interne de vignette. Aucun POST ; URL externe signée inchangée. Repli honnête jusqu’au chargement réel, annulation lors du changement de projet/URL ou démontage.
- Agents parallèles : fin de tâche explicitement distinguée de validation globale ; consensus et erreurs conservés. Rapport JSON complet ou incomplet présenté avec détails originaux dépliables. Original accessible même pour un texte court tronqué ; ligne de44px constante pendant le flux.
- Notifications : correction du fond opaque d’ancienne notification empilée dont le contenu est invisible avec Toastify11. Sur IDE jusqu’à1023px, liste bornée avec messages et commandes conservés ; retour desktop sans perte de queue. Fermeture44px contrastée, corps traversable aux gestes. Aucun message réel supprimé ni backend modifié.

## Contrat agents consommé

`agentExecution.results[].{roleId,status,summary}`, `agentLaneStream.{roleId,status,summary,text}`, `isStreaming` et `consensus.{algorithm,outcome,agreementScore}`. Le statut final du backend reste prioritaire. Les nouveaux champs optionnels `outputState` et `emittedFiles` sont lus avec des gardes, sans dépendance à une interface non publiée. Les cinq états sont distincts ; un fichier émis n’est pas annoncé comme appliqué. Les anciens événements restent compatibles et ne valent jamais preuve de vérification. Le rôle QA et une déclaration « npm test passed » ne sont pas traités comme preuve d’exécution. Aucun changement du calcul de consensus ; le propriétaire backend corrige son contrat séparément. `agreedVerificationClaims` n’est pas consommé tant que son chemin exact n’est pas confirmé ; les `claimVotes` existants sont explicitement des déclarations non vérifiées.

## Preuves locales

| Surface | Tests et formats réellement exercés | Limites |
| --- | --- | --- |
| Vignette | 13 tests de composant et11 de proxies ; Chromium320/390/820/1440, huit GET204→PNG200, redimensionnement pendant attente. | Composant extrait avec CSS/traduction adaptés, image synthétique ; pas page Projets entière ni capture backend. |
| Rapport agent | 32 tests rendu/état/consensus ; Chromium320/390/820/1440×FR/EN, clavier et redimensionnement. Texte court→119caractères→long→JSON, puis métadonnées absentes→actions sans rapport→interruption : hauteur et scroll stables. | Vrai composant isolé, pas conversation complète ni génération réelle ; détails fermés pour mesure de stabilité. |
| Notifications | 4 E2E Chromium sans retry ; 10 étapes de resize dans deux thèmes et8 parcours fermeture/détails. 320/390/820/844paysage, retour1440 ; trois IDs conservés. | Vrai conteneur et CSS, données synthétiques. Un bouton déjà focalisé peut sortir de la fenêtre après rotation ; Tab/ShiftTab le ramène. Images utilisateur non téléchargées. |

Les preuves [vignettes](thumbnails/README.md), [contrat capture](thumbnails/BACKEND-CONTRACT.md), [rapports](agents/README.md) et [revue indépendante](agents/INDEPENDENT-REVIEW.md) sont conservées séparément. Le [point fonctionnel IDE](IDE-MATRIX.md) distingue processus locaux réels, CI et production.

## Validation intégrée finale

Build client/SSR réussi, typage web réussi,121tests dans14fichiers réussis ; lint global app :0erreur/52avertissements préexistants. Les11tests de proxies vignette et4E2E navigateur sont distincts du total121. Revues indépendantes favorables après correction de deux réserves : hauteur variable des rapports et positions résiduelles des toasts après resize. Gitleaks sur les changements indexés : aucune fuite. [Journaux et empreintes des sources](validation/).

Le premier build a été interrompu volontairement (exit130) après découverte du bouton blanc sur blanc ; il ne vaut pas validation. Un premier lint avait3erreurs de lignes blanches dans les nouveaux fichiers, corrigées. Le build et le lint finaux ci-dessus portent sur le lot corrigé. Les recettes composants ont leurs limites propres ; le build ne les transforme pas en recette complète de l’IDE.

360,1024,1280,1920 et ultralarge ne sont pas validés pour tous les composants de ce lot ; la recette notifications précise ses propres formats. Zoom200%, thèmes clair/sombre complets, Safari matériel, Firefox, clavier virtuel et safe areas physiques restent à vérifier. Aucune couverture globale déduite de ces composants.

## Blocages non résolus par ce lot

- OAuth réel : pas de session de production ni de transfert de connexion sécurisé ; navigateur local bloqué avant HTTP par ERR_TUNNEL_CONNECTION_FAILED. Aucun statut du POST authentifié obtenu.
- Capture backend : planification n’atteste pas stockage ni fraîcheur ; bucket/screenshotter/provisionnement réels non vérifiés. Une image jamais capturée ne sera pas créée par les retries GET.
- Orchestration : réponse vide, actions sans rapport et validation QA restent le périmètre du propriétaire backend. Les erreurs originales sont conservées.
- Aucune fusion ou livraison de ce lot ; priorité de livraison #799 maintenue. Aucun coût, credential, autorisation OAuth, projet client ou donnée réelle modifié.
