---
id: BUG-AGENT-EXPLICIT-MODEL-20261028
---

# Choix explicite affiché mais ignoré par la génération

📤 Dispatché : ☑ 28 octobre 2026.
💻 Codé : ☐ Correctif local, pas encore livré sur main.
✅ Testé live : ☐ Aucun appel fournisseur ni génération de production pour ce lot.

## Défaut et correction

La feuille des modes persistait son choix, mais Chat.client ne le transmettait pas ; la carte globale décidait encore du fournisseur. La requête lit maintenant le choix au moment de l'envoi. Auto conserve sa résolution habituelle. Un choix explicite incompatible est refusé, jamais remplacé silencieusement.

Le premier parcours borné autorise uniquement Lite / OpenAI `gpt-5.6-luna` / Standard, pour un projet accessible en écriture, une organisation non suspendue, un abonnement et une carte active admissibles, et l'intégration OpenAI existante activée. Aucune clé créée, copiée ou exposée. Aucun changement de carte globale. Il ne prouve pas que le compte fournisseur dispose de crédits.

La réservation persistante et atomique couvre un total prospectif de 20 USD par projet, fournisseur et tarif plateforme comptés séparément. Le run réserve avant tout appel ; le même identifiant ne peut pas être rejoué. Les réserves sont conservées après erreur, interruption ou absence de mesure fiable. Le plafond n'est ni un débit ni une recharge du portefeuille. La facturation active par crédits est refusée pour ce parcours, faute de garantie de son tarif de règlement ; Auto ne change pas.

La garde de taille de requête n'est pas un tokenizer certifié. Le budget réserve donc le pire cas documenté : 1 050 000 tokens d'entrée par appel, 8 192 de sortie incluant raisonnement, majorations longue fenêtre, écriture de cache et région. Les tarifs fournisseur réservés sont55/198 cents par million ; les prix de comptabilité normale restent distincts. Avec les tarifs Lite par défaut, 15,26 USD sont réservés pour deux appels maximum (génération et une continuation). Une carte différente peut autoriser de1 à8appels sous20USD. La limite entière n'est pas renouvelée par clic. Les appels historiques ne sont pas rétroactivement réconciliés par cette réserve.

Planner, lanes, résumé, sélection LLM de contexte, mémoire/embeddings, MCP, outils web et retries sont désactivés pour ce seul parcours. Les continuations partagent le même compteur. La requête finale impose l'endpoint OpenAI global, le modèle exact, `service_tier: default`, `max_completion_tokens:8192`, aucun outil/multimédia ni redirection. Aucun repli ou appel dynamique de découverte.

## Sources du modèle et du prix

- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/guides/fast-mode
- https://developers.openai.com/api/docs/pricing

Consultées le28octobre2026. Standard est forcé car l'absence de service_tier peut hériter d'un réglage Fast. Les noms affichés ne sont pas assimilés à des modèles historiques.

## Validation et limites

Tests de contrats avec transport isolé et vrai SDK : modèle/tier/sortie, refus avant réseau, compteur commun, aucune répétition, aucun auxiliaire en strict, Auto préservé. Tests API projet/plan/configuration/budget/rejeu et frontière transactionnelle Prisma simulée. Cette dernière ne remplace pas un test PostgreSQL réel. Aucun test sur données réelles ni preuve de génération financée, d'aperçu, GitHub, publication ou réouverture en production. La recette authentifiée reste à coordonner dans son budget total, incluant toute consommation antérieure indéterminée.
