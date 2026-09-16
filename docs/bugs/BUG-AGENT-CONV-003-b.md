---
id: BUG-AGENT-CONV-003
---

## Bug

**P2 — `GET .../ai/conversations/<cid>/transcript` rendait `{"message":"Unexpected Server Error"}`** — une erreur opaque qui n'appartient à aucune ligne du dépôt.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**CAUSE ÉTABLIE PAR MESURE DE BOUT EN BOUT, avec témoin positif dans la MÊME exécution** : deux routes miroir passées au vrai `createRequestHandler` du dépôt — celle qui n'a qu'une `action` rend `400 {"message":"Unexpected Server Error"}`, celle qui a `loader` + `action` rend `200`. Le banc mesure donc bien quelque chose (règle 14). **POURQUOI CE POINT TOURNAIT EN ROND** : la phrase ne vient d'aucune ligne du produit. Sans `loader`, React Router lève lui-même un 400 (« You made a GET request … but did not provide a `loader` »), puis `sanitizeError` du runtime serveur REMPLACE l'erreur par `new Error('Unexpected Server Error')` hors mode développement. Chercher la phrase dans le code ne rend rien. **DIVERGENCE HONNÊTE AVEC LE RELEVÉ D'ORIGINE** : l'inventaire annonçait HTTP 200 ; la mesure donne 400. Le corps correspond caractère pour caractère, le statut non — le 200 était soit un artefact de l'outil de mesure, soit une couche hors dépôt. Le DÉFAUT, lui, est confirmé. **CE QUE LE CORRECTIF N'EST PAS** (règle 10) : PAS un `loader` qui relaie le GET vers le serveur — celui-ci n'expose qu'un `PUT` sur ce chemin, aucun client ne le lit (la lecture du fil passe par `/messages`), et router vers un endpoint inexistant serait le correctif qui mène à un panneau vide. Le `loader` dit à GET et HEAD ce que l'`action` disait DÉJÀ à POST, DELETE et PATCH : 405 avec `Allow: PUT`. L'intention était écrite dans le fichier ; elle était défaite pour exactement les deux méthodes que React Router route vers `loader`. Contre-épreuve dans les deux sens (`loader` retiré → 3 rouges ; PUT refusé lui aussi, l'erreur du « je corrige tout » → 2 rouges ; état corrigé → 5 verts). épinglé par `app/routes/api.projects.ai.conversations.transcript.methodes.spec.ts`. ⚠️ **C'EST UNE CLASSE, PAS UNE OCCURRENCE** : 35 fichiers `app/routes/api.*.ts` exportent `action` sans `loader` et rendent le même corps opaque sur GET. Une garde de balayage rougirait sur les 35 — à introduire avec une liste d'exemptions décroissante, sinon elle sera désactivée le jour même. NON FAIT ici, et dit comme tel.

