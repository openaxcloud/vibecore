# Extensions / Workflows — audit borné du 29 octobre2026

Build local10263a137, Chromium390/820/1280, API/runtime synthétiques isolés. Aucun fichier source modifié ; aucun install/enable/remove/save/run/schedule/prompt/permission envoyé. Studio volontairement hors lot de deux panneaux. Tous les navigateurs fermés via finally, serveurs root non touchés.

## Résultats

- Extensions :9/9recettes passent — chargement/vide,503→Retry clavier, catalogue/installé longs avec filtre sans résultat puis restauration et choix de domaine clavier aria-pressed. Pas de véritable extension installée/activée, backend réel non testé.
- Workflows : vide et503→Retry6/6 passent. Dépliage du workflow au clavier et détails du dernier run échoué synthétique, filtre sans résultat puis restauration :3/3échecs de géométrie en donnéeslongues.
- Le loading est vu sur les recettes initiales de chaque état aux trois formats. Une première contrepreuve1280 n'a pas observé le skeleton avant réponse ; ce résultat ne prouve pas son absence et n’est pas compté comme test négatif produit.

## Défaut Workflows établi

390/820 : la ligne de tâche est flex sans retour à la ligne ; inputcommande et Save se compressent/débordent (panneau358/771px, scrollWidth400/813px). Desktop1280, panneau588px : grid auto-min-content de l'historique amplifie la ligne de log longue et porte scrollWidth à3038px. Les champs input à défilement interne et pre à overflow:auto sont distincts d'un débordement du panneau.

Contrepreuve DOM isolée, aucune source appliquée : flex-wrap:wrap sur tâche ; flex-basis240px sur le formulaire de commande ; min-width0 sur details ; grid-template-columns:minmax(0,1fr) sur run-steps.3/3vert, scrollWidth panneau358/771/588. Aucune règle overflow:hidden, contenu tronqué ni suppression d'action.

La contrepreuve stricte finale `workflows-counterproof-preserved` ajoute l’égalité intégrale du texte du log et de la commande, et le défilement horizontal réel du pre : scrollLeft2446/2033/2463, overflowXauto.3/3vert. Les commandes n’ont jamais été exécutées.

## Livrables et prochaine recette

`workflows.patch` est un delta NON appliqué, app/styles/index.scss uniquement, quatre déclarations. Il peut être groupé au patch Collaborators indépendant. Pas encore de preuve compilée avec correctif.

Après build corrigé, lancer sans injectionCSS :
`PANEL=workflows MODE=long LABEL=compiled-workflows node /workspace/ui840-extra-panels/probe.cjs`

COUNTERPROOF=1 ne vaut qu'une contrepreuve DOM, jamais une validation du produit compilé. Les reçus JSON et captures d'échec sont conservés dans les sous-dossiers. Aucun Safari/appareil physique, zoom200%, claviervirtuel, safearea, production ou backend réel certifié. Pas de certification globale de panneau.

## Validation root finale

Correctif appliqué sur branche locale Collaborators/Workflows, après intégration du correctif canonique Storage10263. Buildclient/SSR réussi ;70gardesCSS et16tests inventaire passent. compiled-workflows.json :390/820/1280verts SANS COUNTERPROOF, texteintégral/commande/scrollhorizontal conservés. Revue indépendante favorable. AucunTypeScriptmodifié par ce complémentCSS ; typageweb10263 déjàvert, non réexécuté. Aucune publication/fusion/livraison de ce complément.
