---
id: BUG-IDE-FEEDBACK-20261026
---

## Bug

Signalements utilisateur du 26 octobre 2026 : notifications de compilation et autres couches couvrant les actions sur iPhone ; résultats des agents affichés en JSON/anglais et coche QA pouvant être confondue avec une validation globale malgré un quorum partiel ; vignette absente dans Projets.

La carte signalée et le nouveau portfolio dont l’aperçu IDE fonctionne sont deux projets distincts. Aucune cause du projet client n’est attribuée à partir des seuls tests isolés.

## 📤 Dispatché

☑ 26/10 — présentation et vignettes, branche isolée depuis main 951ceb8d5653bee4df30b010753c859c0c4a44c0. Backend GitHub et orchestration des agents appartiennent à d’autres sessions ; fichiers de #799 préservés.

## 💻 Codé

☐ — corrections locales en cours ; aucune fusion ni livraison de ce lot.

## ✅ Testé live

☐ — aucune session de production disponible. Les captures ont été décrites précisément par le parent ; leur téléchargement Library dans cet environnement a échoué. Ne pas confondre ces descriptions avec une inspection locale des images.

## Constatations et limites

- Toast : l’émetteur Preview et les identifiants existants sont identifiés. Une déduplication existe déjà ; absence de déduplication non établie. Reproduction du rendu empilé en cours.
- Vignette : reproduction synthétique du composant : après onError, même URL et nouvelles données gardent le repli ; seule une URL différente rétablit une image. Cela ne vérifie ni le stockage ni le service de capture réel.
- Agents : conserver les erreurs, l’état interrompu et les résultats partiels ; aucune modification des contrats de retry sans coordination backend.
- OAuth : aucun cookie E-Code parmi 64 bases locales vérifiées uniquement par métadonnées, aucun navigateur actif. GET de connexion/dashboard échoue avant HTTP avec ERR_TUNNEL_CONNECTION_FAILED. Le POST authentifié /api/integrations/oauth/github/connect n’a pas été exécuté. Le message utilisateur ne permet pas de distinguer session/configuration/service ; aucune réparation OAuth revendiquée.
- Tests locaux réels séparés : PTY, fichiers, état de shell et deux cycles Node HTTP/arrêt/redémarrage réussis, /health 200 et route protégée 401 sans jeton. Ils ne valident pas le parcours IDE/API/projet/proxy ni la production. Tous les processus propres ont été arrêtés.

Les preuves détaillées de chaque correction et leurs formats seront ajoutées après validation. Aucune donnée cliente, autorisation OAuth, credential ou dépense créée.
