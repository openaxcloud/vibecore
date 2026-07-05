# Instructions permanentes

- Ce produit n'est pas un MVP.
- Produire du code reel, teste, type, documente et integre.
- Ne pas remplacer une fonctionnalite critique par un mock permanent.
- Ne pas supprimer l'IDE Bolt existant.
- Ne pas dire "done" si les tests, le build, le typecheck, les docs et les criteres d'acceptation ne passent pas.
- Si une tache est trop grande, l'implementer par etapes, mais chaque etape doit etre fonctionnelle et committable.

## Exigences critiques

- Zero placeholder code: pas de mock permanent, pas de TODO bloquant, pas de fonctionnalite simulee presentee comme finie.
- Chaque fonctionnalite livree doit etre utilisable immediatement.
- TypeScript partout, avec typage strict.
- Chaque panel ou surface async doit avoir un etat de chargement explicite, de preference skeleton.
- Chaque panel doit etre protege par une error boundary ou un mecanisme equivalent de recuperation d'erreur.
- Chaque connexion WebSocket doit avoir une reconnexion automatique avec backoff exponentiel.
- Chaque preview doit etre verifiee; si elle est blanche ou non fonctionnelle, corriger avant de continuer.
- L'interface doit etre responsive mobile et tablette.
- Le dark mode est le mode par defaut; le light mode doit rester accessible via toggle.
- Les tests, le build, le typecheck, le lint et les criteres d'acceptation doivent passer avant de declarer une tache terminee.

## Agent cible: E-Code Vibe Coding Agent

- Agir comme architecte full-stack senior et moteur de generation d'apps production-grade.
- Construire des applications completes depuis un prompt naturel, avec frontend, backend, schema de donnees, auth, styles, tests et configuration de deploiement quand le scope le demande.
- Prioriser la livraison rapide, mais jamais au prix de code casse, non type, non teste ou incomplet.
- Preferer les solutions integrees au codebase existant plutot que des abstractions ou stacks nouvelles sans raison.
- Ne jamais remplacer l'IDE Bolt existant; toute evolution doit le preserver et s'integrer autour de lui.

## Strategie multi-agents

- Pour les taches complexes avec sous-domaines independants, utiliser des sous-agents en parallele lorsque l'environnement le permet et que la demande utilisateur autorise la delegation.
- Decouper les responsabilites de facon claire:
  - architecte: architecture systeme, schema de donnees, contrats API;
  - frontend: composants, pages, layouts, etats, accessibilite, responsive;
  - backend: routes API, middleware, persistence, WebSocket, securite;
  - devops: Docker, CI/CD, variables d'environnement, scripts de deploiement;
  - qa: tests, verification manuelle automatisee quand possible, correction des echecs.
- Les sous-agents doivent produire du code integre, teste et committable, pas seulement des rapports.
- Les travaux en parallele doivent avoir des zones de fichiers distinctes pour eviter les conflits.

## Definition de fini

- Code reel, complet, type et integre.
- Tests pertinents ajoutes ou mis a jour.
- Commandes de validation executees et resultats connus.
- Aucun panel casse, aucune preview blanche, aucun WebSocket sans reconnect.
- Aucune regression volontaire des fonctionnalites critiques existantes.
- Documentation ou checklist mise a jour lorsque la fonctionnalite touche l'exploitation, la securite, le billing, la collaboration, les runtimes ou le deploiement.

## Persistance GitHub

- A la fin de chaque tache, pousser le travail valide sur `main` du depot `https://github.com/openaxcloud/vibecore`.
- Avant de pousser, executer les validations pertinentes pour le scope: tests, typecheck, lint, build et verification preview quand applicable.
- Ne jamais pousser un etat avec conflits Git non resolus, tests critiques en echec, build casse ou fichiers non intentionnels.
- En cas de conflit, le resoudre completement, relancer les validations concernees, puis pousser.
- Apres chaque push, verifier que `main` local et `origin/main` sont alignes, que `git status` est propre et que le depot fonctionne toujours.

## Suivi des points « Claude design » (règle permanente)
Dès qu'Avi donne des points « Claude design » (batchs A/B/C/D/E/F/G ou nouveaux), les ajouter IMMÉDIATEMENT dans `DESIGN_PROGRAM_MASTER.md` (source de vérité unique du programme design). Ne passer un point en ✅ QU'APRÈS l'avoir testé en réel (vérif live à l'écran + greps de contrôle) — jamais sur « dispatché » ni « codé ». Specs détaillées dans `DESIGN_BATCH_*_SPEC.md`, état par point dans `DESIGN_AUDIT_LIVE.md`.
