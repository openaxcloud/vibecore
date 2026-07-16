# AGENT_TOOL_BROKER_CONTRACT — broker d'outils Agent / MCP (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat du broker qui expose des outils à l'Agent (exécution réelle, MCP).

## Faits (cf. mémoire bolt-feature-matrix + agent-fixes + subagent-streaming)

- MCP **par requête** ; exécution d'outils RÉELLE (pas de mock). Pattern
  writer→`window` CustomEvent, `Chat.client` écoute.
- Modes agent (AGM) : Lite/Economy/Power routés SERVER-SIDE ; le modèle réel n'est
  jamais exposé dans l'UI ; log par appel `AgentCallLog` (mode, escalade, modèle
  réel, coût, marge, `routingCardVersion`).
- Streaming par sous-agent (lanes parallèles) ; plan-approval gate ;
  retry-with-model.

## Invariants

- **I-BRK-1 (autorisation serveur)** : chaque outil vérifie l'autorisation
  côté serveur ; un mode/interrupteur hors plan → 403 explicite, jamais un
  downgrade silencieux (prouvé E2E-AGM-E).
- **I-BRK-2 (aucun nom de modèle)** : le routage n'expose jamais le nom de modèle
  au client (prouvé E2E-AGM-A, DOM scanné 0 occurrence).
- **I-BRK-3 (coût tracé)** : tout appel routé stampe le coût + la version de carte
  de routage ; le classifieur n'est pas facturé (prouvé E2E-AGM-C).
- **I-BRK-4 (High effort borné)** : High effort n'escalade que sur tâche
  réellement dure (Economy/Power jamais Lite) ; sinon message « +0 crédit ».

## Preuves

- E2E-AGM-A/B/C/E/F PROVEN. E2E-AGM-C taggé `vertical: execute`.
