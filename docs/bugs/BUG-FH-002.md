---
id: BUG-FH-002
---

## Bug

**P3 — la pastille « non enregistré » de l'onglet persiste après une sauvegarde réussie.** Mesuré live le 20/08 sur `e-code.ai` (prod `924cc9c6`), projet réel, 1440 px : après clic sur « Enregistrer », la requête `PUT /api/runtime/workspaces/<ws>/files/write` répond **204**, le contenu est bien écrit (relu à 200 juste après, et l'historique du fichier enregistre la version), mais `.bolt-project-tab-save` reste présent avec son `●`. L'utilisateur croit donc avoir du travail non sauvegardé alors que tout est écrit — le symétrique exact de BUG-IDE (« statut menteur ») déjà corrigé ailleurs : ici le mensonge est pessimiste, mais c'est toujours un mensonge. ⚠️ À ne pas confondre avec un échec d'écriture : l'écriture RÉUSSIT.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

**Le code était JUSTE, et rien ne le tenait** — le cas exact que vise la règle 15. `saveFile()` retire bien le chemin de `unsavedFiles`, mais aucun test ne l'exigeait : un `return` anticipé ou une branche ajoutée au-dessus ramenait la pastille sans qu'une ligne ne rougisse. La garde manquante est écrite. ⚠️ Au premier jet mon propre test a rendu un FAUX rouge : le double d'éditeur ne rangeait pas le document, et `saveFile()` sort avant toute suppression quand le document est absent — j'ai failli conclure à un défaut produit.

## Preuve

☐ live iPhone

