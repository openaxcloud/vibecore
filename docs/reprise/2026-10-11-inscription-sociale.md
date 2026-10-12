# A-19 — disponibilité des connexions sociales à l’inscription

Fusion réelle de #394 sur main 80f1de14 sans conflit. Le chargeur interroge la disponibilité des fournisseurs et le rendu filtre chacun des liens selon la réponse. Le comportement de repli en cas d’indisponibilité de l’API reste identique à celui de la connexion : disponibilité inconnue, liens visibles ; un fournisseur explicitement non configuré est masqué.

Les gardes existantes lisent le mécanisme ; trois nouveaux tests appellent le vrai chargeur avec une réponse d’API puis rendent le vrai formulaire dans son routeur. Ils couvrent deux fournisseurs prêts, un seul prêt et aucun prêt. 23 tests passent dans trois suites ; remplacer uniquement signup.tsx par main rend les trois tests de comportement rouges. Les anciens tests de chargeur appelaient réellement un domaine de test pendant cinq secondes ; leurs réponses externes sont désormais isolées, et les assertions continuent à vérifier les données réelles du chargeur.

Lint des fichiers modifiés, types web et construction React Router passent. Ce relevé ne prouve aucune connexion sociale réelle en production et ne configure aucun fournisseur. Lot préparé, pas servi.
