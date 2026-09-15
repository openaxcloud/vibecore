-- Mesure la CASCADE avant tout nettoyage des messages d'assistant vides.
--
-- Contexte : 498 lignes d'assistant vides existent en production, sur 198
-- conversations. Elles polluent l'affichage — « Agent · 33 messages » avec des
-- blocs ne contenant que le mot « Agent ».
--
-- Un DELETE naïf n'est PAS sans conséquence. Le schéma déclare :
--
--     AiMessage.tokenUsage → AiTokenUsage (onDelete: Cascade)
--     AiMessage.toolCalls  → AiToolCall   (onDelete: Cascade)
--
-- et `AiTokenUsage` porte `estimatedCostCents`. Supprimer un message vide qui
-- en porte un effacerait donc un enregistrement de COÛT.
--
-- CE FICHIER NE SUPPRIME RIEN. Il compte, et il sépare ce qui est sûr de ce qui
-- ne l'est pas. À exécuter en lecture seule avant toute décision.

\echo '── Volume ─────────────────────────────────────────────'

SELECT
  count(*) FILTER (WHERE m.content = '')                     AS vides,
  count(*) FILTER (WHERE m.content <> '')                    AS pleins,
  count(DISTINCT m."conversationId") FILTER (WHERE m.content = '') AS conversations_touchees
FROM "AiMessage" m
WHERE m.role = 'assistant';

\echo '── Cascade de facturation ─────────────────────────────'

SELECT
  count(*) FILTER (WHERE u."messageId" IS NULL AND c.n = 0)  AS surs_a_supprimer,
  count(*) FILTER (WHERE u."messageId" IS NOT NULL)          AS portent_un_cout,
  coalesce(sum(u."estimatedCostCents"), 0)                   AS centimes_en_jeu,
  count(*) FILTER (WHERE u."messageId" IS NULL AND c.n > 0)  AS portent_des_outils
FROM "AiMessage" m
LEFT JOIN "AiTokenUsage" u ON u."messageId" = m.id
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM "AiToolCall" t WHERE t."messageId" = m.id
) c ON true
WHERE m.role = 'assistant' AND m.content = '';

\echo '── Lecture ────────────────────────────────────────────'
\echo 'surs_a_supprimer : ni coût ni outil — suppression sans perte.'
\echo 'portent_un_cout  : NE PAS supprimer la ligne. Si l’affichage doit être'
\echo '                   nettoyé, marquer le message plutôt que le détruire.'
\echo 'portent_des_outils : idem — la trace de ce que l’agent a fait est dedans.'
