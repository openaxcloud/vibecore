# Contrats d'observation de la livraison de l'agent

État de preuve : validations locales, sans recette production. Une PR ou une
CI verte ne vaut pas déploiement. Le raccordement de l'interface doit être
coordonné avant livraison.

## Fichiers

Quatre notions restent distinctes :

- `agentExecution.results[].files` : chemins annoncés dans le rapport du modèle.
- `emittedFiles` : actions de fichiers complètes observées dans le flux.
- `cheminsAttribuesParLesLanes(messageId)` : autorisations attribuées par l'arbitre.
- `cheminsEcritsParLesLanes(messageId)` : écritures appliquées puis confirmées
  par relecture du runtime, coordinateur et sous-agents inclus.

Le dernier lecteur renvoie `undefined` en l'absence d'observation (historique,
éviction ou changement de projet), et `[]` si le message a été observé sans
confirmation d'écriture. Il ne faut pas convertir `undefined` en zéro écrit.
Les chemins confirmés préservent la casse du runtime Linux ; l'arbitrage garde
sa normalisation conservatrice indépendante.

Le raccord strict couvre les propositions acceptées et les écritures finales du
chemin direct sans revue. Dans ce dernier, `ActionRunner` confirme immédiatement
par relecture le payload envoyé avec succès à `runtime.writeFile`, après
normalisation/réparation et avant la réconciliation des imports. Il conserve
uniquement des métadonnées temporaires, consommables une fois par
`consumeConfirmedFileWrite(actionId)` et bornées à 32 actions. Le contenu n'est
pas conservé dans ce registre. Le Workbench contrôle l'annulation, l'identité du
runtime, du projet et de sa liaison avant de publier la confirmation.

Un flux encore partiel, une fermeture de secours, une annulation ou une
confirmation incertaine ne produit pas de reçu. Une lecture incertaine ne rejoue
jamais l'écriture. Les placeholders et les écritures de réconciliation ne
deviennent pas des fichiers générés confirmés. Sans reçu strict, ce chemin reste
inconnu, jamais faussement « zéro écrit ». La preuve est historique : une
réconciliation ultérieure peut légitimement modifier le même fichier.
Une fermeture dédoublonnée après un fragment streaming identique ne requalifie
pas ce fragment en écriture finale confirmée : elle reste sans reçu.

L'interface peut s'abonner à l'atom `confirmationsEcritureVersion` pour recalculer
les compteurs après confirmation ou invalidation. Elle doit distinguer une
livraison encore en cours d'une livraison terminée avec des fichiers manquants :
le résultat des sous-agents peut arriver avant les écritures du coordinateur.

Le registre conserve au plus 32 messages. Un Undo utilise le même verrou par
fichier que l'application, refuse une proposition dépassée avant écriture et
n'invalide son reçu qu'après confirmation du contenu restauré. Une nouvelle
application du même identifiant de proposition est une nouvelle observation.

Une confirmation atteste l'application de la proposition acceptée, éventuellement
de certains hunks seulement. Elle ne garantit pas que le fichier ne sera plus
modifié, ni sa conformité complète au prompt, sa sauvegarde cloud ou sa compilation.

## Modèle sélectionné et sortie observée

`onModelDecision` et `basculeFournisseur` décrivent des décisions de routage.
Ils ne prouvent pas qu'un fournisseur ait commencé ou terminé une réponse.

Le callback `onModelOutput` publie une annotation additive :

```ts
{
  type: 'modelOutput';
  provider: string;
  model: string;
  evidence: 'text-delta';
  messageId?: string;
}
```

Chaque invocation du SDK publie au plus un reçu, après son premier delta textuel
non vide. Les continuations publient leurs propres reçus. Sélection seule,
raisonnement, outils, delta vide ou sortie tardive après annulation ne suffisent
pas. Le callback de flux existant reste appelé et attendu.

Le modèle est celui de l'appel configuré ayant émis du texte, après résolution
du modèle utilisable. Ce n'est ni une attestation de l'identité interne du modèle
du fournisseur, ni une preuve de réponse complète. L'interface doit lire le
dernier reçu pertinent et préserver l'état inconnu des anciennes conversations.

## QA et validation

`status: complete` reste un rapport valide. `verificationState: not_observed`
ne permet jamais d'afficher une exécution de tests comme vérifiée.

Validation du contrat initial : 145 tests ciblés, dont le SDK réel avec fournisseur simulé
sans réseau, les deux segments de la route réelle avec frontière modèle simulée,
le workbench et un vrai fichier temporaire via les handlers de l'agent. Build
web/SSR, typage officiel et lint réussis. Aucun appel AI payant ni changement
de projet client. Les causes du 503 de preview et du solde fournisseur historique
restent non établies.

Extension du chemin direct : 147 tests ciblés réussis, dont des fichiers
temporaires réellement écrits et relus, la divergence concurrente, les échecs
d'écriture, l'arrêt, le changement de runtime et l'exclusion des placeholders.
La réparation est simulée à sa frontière fournisseur, sans appel AI payant.
