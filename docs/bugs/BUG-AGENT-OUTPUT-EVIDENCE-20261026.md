---
id: BUG-AGENT-OUTPUT-EVIDENCE-20261026
section: "Génération et orchestration"
---

# Rapports des sous-agents : sortie, interruption et preuves de vérification

## Constats reproduits

Sur la base `951ceb8d5653bee4df30b010753c859c0c4a44c0`, les exécuteurs réels du
gateway, alimentés par des fixtures fournisseur sans réseau, confondaient une
sortie vide et des actions de fichiers sans rapport final : même état `partial`
et message « The agent returned an empty response. ». Un JSON sans `summary`
était affiché comme résumé brut. Une simple déclaration QA de tests réussis
pouvait aboutir à `complete` puis à `acceptedVerification`, sans exécution de test.

Ces reproductions n'attribuent pas les captures à un projet ou une session en
particulier. Le 503 réel reste non diagnostiqué. Le ratio de progression à 67 %
provient d'annotations terminées, pas d'une mesure de l'IDE réalisé. Le toast de
démarrage ne constitue pas une preuve de compilation réussie.

## Contrat transmis à la session UI

`AgentRunResult`, `AgentExecutionResult`, les résultats d'`agentExecution` et la
fin de voie `agentLaneStream` transportent les champs optionnels suivants :

```ts
outputState?: 'empty' | 'actions_without_report' | 'report' | 'invalid_report' | 'interrupted';
emittedFiles?: string[];
verificationState?: 'not_observed';
```

- `status: complete` signifie qu'un rapport valide a été reçu, jamais qu'un test
  a été exécuté ou que toute la tâche est terminée.
- Vide, actions sans rapport et rapport invalide restent partiels : aucun échec
  fatal n'est inventé pour ces états incertains.
- `emittedFiles` contient uniquement les chemins observés dans des actions
  `file` complètes. Il ne prouve ni sauvegarde, ni exécution, ni qualité des fichiers.
- `verification` est une liste de déclarations. Le gateway n'exécute pas les
  tests et fixe toujours `verificationState: 'not_observed'`, même si le modèle
  fournit des propriétés prétendant le contraire.
- `consensus.consolidated.agreedVerificationClaims` conserve les déclarations
  ayant obtenu un accord. `acceptedVerification` reste vide : aucune déclaration
  textuelle n'est promue en preuve d'exécution. L'accord et son ratio restent
  inchangés, notamment un quorum partiel à 25 %.

Les anciens événements sans ces champs ne valent pas succès vérifié. La lecture
web normalise leurs résultats et déplace les anciennes déclarations
`acceptedVerification` vers `agreedVerificationClaims`, sans modifier l'objet
source ni les lignes historiques en base. Le contexte fourni au générateur
principal précise également que ces vérifications ne sont pas observées.

## Interruption et conservation du travail utile

Une erreur de fournisseur après émission conserve les chemins de fichiers
observés, un statut partiel et `outputState: interrupted`. Sans sortie utile,
l'erreur reste un échec explicite.

Le transport web conserve les voies ayant émis des deltas avant une coupure SSE,
même si `lane-done` n'est pas arrivé. Il peut ainsi rendre un résultat partiel
au lieu de relancer et refacturer l'ensemble des voies. Le texte conservé pour
extraire les métadonnées est borné à 1 048 576 caractères JavaScript par voie ;
les fichiers au-delà de ce préfixe sont omis, jamais inventés. Cette limite ne
prétend pas borner tout le tampon SSE préexistant. Le garde contre la relance
reste actif même après saturation de ce préfixe.

L'arrêt explicite de l'utilisateur doit toujours être propagé, y compris si le
flux se ferme proprement ou contient déjà sa trame finale. Il ne devient pas
un résultat partiel présenté comme une reprise réussie.

## Validation et limites

Les tests couvrent les exécuteurs réel stream/agrégat avec frontières fournisseur
synthétiques, les fichiers et commandes sans rapport, les rapports invalides,
les propriétés de preuve forgées, les erreurs avant/après émission, la coupure
SSE, les anciens événements et les trois algorithmes de consensus. Les tests
avant correction échouent ; les assertions sont conservées après correction.

Résultats locaux : 43/43 tests de transport web et 150 tests gateway réussis
(2 tests préexistants ignorés), build web/SSR réussi, typage strict du gateway,
du web et du fichier de tests web réussi. La commande officielle `pnpm typecheck`
passe sur tous ses volets et `pnpm lint` termine sans erreur (52 avertissements
préexistants). Un premier essai du typage global rencontrait deux clients Prisma
résolus dans deux worktrees : correction des seuls liens locaux `node_modules`,
puis nouvelle validation verte, sans changement de source ni installation.
La revue indépendante est favorable,
après reproduction rouge puis verte de trois courses arrêt/EOF/trame finale.
Les fixtures fournisseur restent synthétiques ; aucun résultat de production
n'est déduit de ces tests.

Aucune commande QA n'a été exécutée par le modèle, aucun appel fournisseur
payant ni accès à un projet client n'a été effectué. La session UI possède les
cartes, détails et couleurs ; ce lot fournit leurs interfaces et producteurs.
La langue de la requête d'orchestration et la cause du 503 ne sont pas corrigées
ici. Aucun `app.ts`, permission, quota ou pipeline n'est modifié.

Lot séparé de #806. Le seul raccordement de `api.chat.ts` concerne les nouveaux
champs d'une annotation de fin de voie, pas la sélection du portfolio.

## 💻 Codé

Contrat de sortie et preuves distinctes ; PR #809 en validation, non déployée.

## ✅ Testé live

Non : tests isolés uniquement pour ce correctif. Le 503 production reste non diagnostiqué.
