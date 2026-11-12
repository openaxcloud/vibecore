# MCP : dépendance corrigée et transport SSE protégé

Base indépendante : main `d9a23c1212208d353baa4fa8d48cce0af24a7d92`. Le lot xmldom PR907 est séparé.

## Exposition vérifiée

`MCPService` ouvre lui-même les transports des serveurs configurés, avec leurs en-têtes personnalisés. Le transport Streamable HTTP utilise le SDK MCP ; le transport SSE utilisait l'implémentation embarquée dans `ai` 4.3.16. Cette dernière appelle fetch sans politique de redirection : la mise à jour du SDK seule ne corrige donc pas le parcours SSE.

L'avis GHSA-6prh-2h8m-c8cw décrit la retransmission interorigine des en-têtes personnalisés et, sur 307/308, du corps. Il est pertinent pour ces transports. Les en-têtes Authorization sont déjà supprimés par les fetch récents lors d'un changement d'origine ; ne pas confondre cette protection avec celle des en-têtes X-API-Key ou mcp-session-id.

Aucun usage applicatif de McpServer, taskStore, requireBearerAuth ou authProvider SDK n'a été trouvé dans app/services/packages. Les avis serveur et OAuth SDK ne prouvent pas une exposition de ces fonctions ici. Les intégrations OAuth propres à l'API sont distinctes.

## Périmètre

- SDK MCP minimum1.32.0, version résolue1.32.2 ; dépendance et override racine. Lock régénéré par pnpm9.14.4, installation frozen réussie. Changement transitif raw-body3.0.2, déduplication json-schema-typed/http-errors déjà présents et métadonnée de dépréciation node-abort-controller ; aucun autre upgrade majeur.
- SSE utilise désormais le transport SDK, avec requestInit.headers pour les requêtes GET et POST ; aucun redirectPolicy:'follow'.
- Gardes URL de configuration et refus stdio conservés.
- Logs MCP : configuration complète, URL, arguments stdio/outils et erreurs brutes retirés ; métadonnées non sensibles et codes stables conservés. Les logs debug alimentent aussi la capture interne, même quand la console filtre le niveau, donc masquer seulement la console ne suffit pas.
- Aucune clé réelle, appel fournisseur payant, publication client ni action de production dans les tests.

## Validation

SDK1.29 : le test interorigine contrôlé échoue (1 rouge,2 témoins verts). SDK1.32.2 :5/5 tests StreamableHTTP passent, dont deux serveurs HTTP loopback avec fetch natif :307/308 refusés, collecteur0 requête, corps/header synthétiques observés uniquement à l'origine autorisée. Réponse normale et redirection même origine préservées.

Groupe MCP final :26/26 tests passent, incluant service SSE (handshake, outils, en-têtes, fermeture), gardes URL, absence de sentinelles sensibles dans les arguments logger, panneaux et i18n. Revue indépendante : le démarrage SSE rejeté pouvait laisser EventSource en reconnexion, car AI SDK conserve isClosed=true jusqu'à start réussi et son close est alors sans effet. Le service possède maintenant le transport et le ferme explicitement dans le catch, sans masquer l'erreur d'origine si close échoue. Régression dédiée réussie : fermeture appelée et aucune nouvelle requête après10secondes (horloge contrôlée). Le signal de la connexion ouverte est bien annulé ; pour un fetch déjà rejeté EventSource a effacé son contrôleur, donc son ancien signal n’est pas un témoin de fermeture fiable.

Le build web local est interrompu par exit137 pendant la transformation, avec heap par défaut puis4096MiB. Aucun succès de build local n'est revendiqué et les essais ne sont pas répétés indéfiniment. La CI exacte devra établir la compilation avant fusion. Typecheck global et lint ont passé (0 erreur,52 avertissements existants) ; les hooks normaux les rejouent sur le commit final. La résolution des noms DNS et une recette avec un serveur client réel ne sont pas revendiquées par ces tests.

## Audit candidat

282 findings : 94 high,149 moderate,39 low,0 critical ; aucune entrée SDK MCP. La référence main en avait288. Ce lot indépendant conserve les alertes xmldom de main jusqu'à intégration séparée de PR907. Ne pas comparer282 à267 du lot xmldom comme s'il s'agissait du même arbre. Le statut audit reste1, les autres dépendances ne sont pas déclarées sûres.
