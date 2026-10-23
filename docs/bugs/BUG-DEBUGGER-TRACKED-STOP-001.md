---
id: BUG-DEBUGGER-TRACKED-STOP-001
---

# Debugger : processus suivi et arrêt confirmé, sans faux pas-à-pas

## 📤 Dispatché

23 octobre 2026, préparation locale distincte de #778, base c988c2af60d058971afe72f057c6fa82a178fb21. Aucun push, nouvel accès, service Inspector exposé ou processus utilisateur touché. Périmètre autorisé : identité workspace/processus, résultat d’arrêt réel et indisponibilité explicite de l’adaptateur.

## 💻 Codé

Le lancement demande un processus enregistré à l’agent par le chemin de commande existant et mémorise son identifiant opaque, son workspace et le type tracked-runtime-command. L’agent répond au spawn, conserve son suivi et les bornes existantes de durée/sortie/processus, puis nettoie le registre à la fermeture. Le shell n’est plus détaché par nohup et son PID texte n’est plus pris pour une identité runtime. Le mode background requiert l’agent : son indisponibilité reste une erreur, sans simuler un lancement local.

Stop vérifie que le workspace de la session appartient au projet, utilise cette destination plutôt que le workspace du dashboard, et refuse les anciens PID non suivis. Les autorisations runtime workspaces:write, la révocation terminal et les gardes de commandes existantes restent en place. Aucun PID brut n’est transformé en cible de signal. L’agent et le fallback local attendent close après SIGTERM ; faute de confirmation sous 5 secondes, le résultat est un échec explicite, sans suppression optimiste du registre. L’API transmet killed:false au lieu du 204 inconditionnel ; le BFF ne persiste stopped qu’après killed:true et identité concordante. La réconciliation accepte les identifiants opaques tout en conservant les PID historiques et n’utilise pas la table d’un autre workspace.

Continue/Step restent désactivés, avec explication visible FR/EN : aucun adaptateur connecté. Le lancement est présenté comme exécution de processus, pas comme débogage fonctionnel. Les lancements générés Node/Python n’ouvrent plus automatiquement Inspector/debugpy ; attach et stopOnEntry sont refusés tant qu’un adaptateur manque. Les commandes personnalisées restent sur le chemin d’exécution déjà autorisé.

## ✅ Testé live

Preuves réelles et contrôlées séparées, dans `/workspace/ux-artifacts/debugger-tracked/` :

- Agent réel en injection HTTP locale, processus Node synthétique isolé : ID opaque présent dans le registre, PID brut refusé sans tuer l’enfant, jeton d’un autre workspace refusé, puis SIGTERM confirmé par close et disparition vérifiée avec signal 0 et liste des processus. Relancer Stop sur le même ID retourne killed:false. Commande inexistante : pas de running ; ID absent : pas de killed:true. Deux cas réels dans debugger-process.spec.ts.
- Deux autres cas du même fichier sont contrôlés : erreur de signal et signal accepté sans terminaison, avec horloge simulée pour la borne de 5 secondes. Ils ne prouvent pas un timeout réel du système.
- BFF à upstream contrôlé : 10 tests, tous rouges sur la source de base puis verts sur le correctif. Échec d’arrêt, killed:false, PID absent, workspace étranger, ancien PID, mauvaise confirmation, workspace de session, lancement opaque, lancement étranger et intention Step non supportée. Aucun shell exécuté par ces tests.
- API : vrais handlers extraits par AST avec autorisation/transport contrôlés, 4 rouges et 3 verts avant correction, puis 7 verts. Ces doubles vérifient la conservation des appels aux gardes ; ils ne remplacent pas une recette complète API/PostgreSQL/RBAC.
- Réconciliation : 12 tests ciblés, dont identité opaque et tables de workspaces distincts.
- Cinq régressions existantes de l’agent ciblent commandes synchrones, cwd autorisé/interdit, normalisation shell et garde anti-abus. Les autres cas du fichier sont volontairement non sélectionnés ; aucune couverture globale revendiquée.

## Limites restantes

Pas de nouvelle recette navigateur, déploiement, ni certification complète de toutes les combinaisons runtime. Les sessions anciennes basées sur un PID ne sont pas migrées en identités opaques : leur arrêt est refusé plutôt que de risquer une cible arbitraire. Une ancienne image d’agent sans mode background ne peut pas produire un faux running : la réponse est refusée. La confirmation concerne le processus enregistré ; un descendant qui s’échappe volontairement du groupe n’est pas certifié par cette recette.

Un debugger complet manque toujours : pont Inspector/DAP lié au workspace, négociation des capacités, événements paused/resumed, commandes Continue/Step, application réelle des points d’arrêt, pile et variables, reconnexion et arrêt de session. Aucune de ces fonctions n’est simulée ici. La configuration sauvegardée des points d’arrêt/expressions n’est pas une preuve d’application au runtime.
