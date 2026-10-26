# Projet sans vignette — diagnostic local, 26 octobre 2026

Signal utilisateur : « Je vois pas le preview du site créé dans projets ». La carte décrite par le parent concerne un autre projet (Brouillon), pas le portfolio dont la preview IDE fonctionne. Aucun identifiant réel résolu, aucune lecture authentifiée du projet ni écriture client. La cause exacte de cette carte reste inconnue.

## Contrat capture → stockage → lecture

1. `app/components/workbench/Preview.tsx:1443` : lorsque activePreview.ready vaut true, POST local thumbnail/refresh une fois par baseUrl. La Set est remplie avant réponse ; réponses non2xx et rejet réseau ne produisent pas de retry. Même URL après nouvelle génération ne relance pas une capture dans ce montage. Fichier lu seulement, coordination requise avant correction.
2. `app/routes/api.projects.$projectId.thumbnail.refresh.ts` relaie l’URL vers l’API. `services/api/src/app.ts:36891` vérifie droit projects:write et URL ; stockage/screenshotter absents →202 enabled:false. Sinon scheduled:true signifie lancement best-effort, PAS fichier stocké.
3. `services/api/src/thumbnail-capture.ts` : POST screenshotter/capture, délai30s, debounce5min par projet/processus réservé avant tentative même en échec, PNG nonvide écrit à `thumbnails/preview.png`. Aucun statut de fin remonté à la carte. Échecs journalisés, pas de retry différé interne.
4. Piste backend distincte : capture automatique appelle putObject sans ensureBucket ; l’implémentation GCS `object-storage.ts:528` appelle file.save directement. Le parcours manuel upload-url, lui, appelle explicitement ensureBucket avant de signer. Un bucket inexistant peut donc empêcher la capture automatique. Provisioning ailleurs/nonexistence effective à confirmer par propriétaire backend ; aucun backend modifié ni test cloud exécuté.
5. Capture manuelle : `thumbnail-capture.ts` frontend utilise getDisplayMedia, puis POST upload-url et PUT signé ; permission navigateur indispensable, aucun appel de cette chaîne exécuté dans cette mission. Aucun signal de rafraîchissement des cartes depuis cette fonction.
6. API GET thumbnail : liste la clé puis signe URL ; bucket absent, objet absent, stockage désactivé ou deadline peuvent mener404. Proxy web transforme404 en204 no-store, autrement302 vers PNG. Auth/pannes conservent statut. Le même repli UI ne permet pas de distinguer toutes ces causes.
7. Dashboard et Projects._index attribuent une URL fixe `/api/projects/:id/thumbnail`. `ProjectPreviewMedia` affiche image lazy ; après15s le repli est réversible par onLoad, mais après onError l’image est supprimée définitivement pour cette identité d’URL.

## Défaut reproduit et delta local autorisé

`reproduction.json` : composant produit extrait et exécuté sous React/jsdom ; traduction et rendu du repli stubés, événement error synthétique, zéro réseau. Image initiale présente →error →absente ; re-render mêmeURL/nouvelle updatedAt reste sans image ; changementURL rétablit une image. C’est une preuve de récupération UI défaillante, pas une capture réelle ni une preuve de panne production.

Correctif uniquement dans `/workspace/vibecore-ui-ide-feedback` :
- `app/components/dashboard/SaaSLayout.tsx`, ProjectPreviewMedia et enfant local : trois nouvelles lectures après5/10/20s d’erreur, query thumbnailRetry distincte conservant query/hash, repli conservé pendant chargement jusqu’au vrai onLoad ; erreurs permanentes restent en repli. État isolé par projet+URL, timers nettoyés.
- `app/components/dashboard/ProjectPreviewMedia.spec.tsx` : bornage, succès, reset URL/projet et ancien événement, nettoyage unmount.

Pas de reset sur updatedAt : une modification métier ne prouve pas une nouvelle capture et provoquerait des rafales sur revalidations. La borne autorise une récupération de capture tardive/transitoire sans polling permanent. Après épuisement, un remontage/changementURL permet de retenter ; aucune promesse de récupération d’un fichier jamais capturé. Pas de correction de la mise à jour automatique à URL identique dans l’IDE : proposée au propriétaire séparément.

## Validation et limites

13 tests composants verts,11 tests proxies existants verts (logs). Revue indépendante demandée ; build/typecheck/recette compilée non exécutés par cet agent à ce stade. Aucun commit/push/index. Aucun mock produit ajouté. Backend, Preview.tsx, BaseChat/MobileOverlayFocus/routeIDE exclus des modifications. Une validation compilée synthétique devra servir204 puis une véritable image de fixture au GET de tentative, et vérifier récupération/bornage sans POST.

Pour établir la cause du projet utilisateur : reçu GET thumbnail (204/302/auth/panne), diagnostic API distinguant disabled/absent/unavailable, logs capture corrélés au projet et existence de l’objet. Aucun de ces diagnostics production n’a été exécuté ni présumé.

### Complément final de cette étape

Restriction supplémentaire après revue root : seules les URL relatives reconnues `/api/projects/{id}/thumbnail` sont retentées/cachebustées. URL signée externe conservée sans retry ; query et fragment préservés sur endpoint interne. 13 tests composants finaux verts (`tests-final2.log`),11 proxies verts, lint ciblé0 et Prettier0. Un test intermédiaire utilisait `/thumbnail-next` hors contrat désormais reconnu ; il a été corrigé vers une autre route réelle de vignette, sans élargir la regex (log rouge conservé). Revue indépendante final_review favorable sur bornage/fallback/isolation et portée ; timeout sansonError explicitement hors réparation.

`browser/receipt.json` : vrai Chromium, quatre cas320/390/820/1440, GET local204 puis véritable PNG200 au premier retry. Resize pendant attente, repli encore visible pendant requêtePNG retardée, puis image complete/naturalWidth320 et repli supprimé. Huit réponsesHTTP,0JS,0mutation. Huit captures avant/après. Le PNG est une fixture unie bleue, **pas une capture de projet ni une preuve de stockage**. Source des fonctions produit extraite inchangée et bundlée avec React ; adaptateurs traduction/icône et CSS minimaux du harness. Cela prouve le comportement de récupération du composant dans un navigateur, pas le rendu de la page Projets compilée ni une recette intégrée avec backend. Inspection visuelle ciblée after320 confirme l’image de fixture visible.

Navigateur fermé, seul serveur14399 identifié par PID/startTicks arrêté ; cleanup.json conserve état/port. Build global, typage et recette page réelle restent à la coordination root. Aucun commit ni index par cet agent.
