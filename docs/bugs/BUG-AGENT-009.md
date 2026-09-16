---
id: BUG-AGENT-009
---

## Bug

**DOUBLON de la cause traitee par #312 — mon diagnostic initial etait FAUX.** ⚠️ Cette entree portait l identifiant BUG-AGENT-006, DEJA PRIS par un bug different (« le workspace ne devient jamais pret, 425 Too Early », plus bas dans ce fichier). Collision corrigee le 2026-09-01 : renumerotee en BUG-AGENT-009, le premier libre. Ce n etait pas un doublon a fusionner mais un identifiant a liberer. Corrige le 2026-09-01 apres mesure.

## 📤 Dispatché

☐

## 💻 Codé

☑ #312 mergee `c6197a2251`

## ✅ Testé live

☐ **preuve live en attente de deploiement**

## Preuve

**Ce que j'avais ecrit** : « l'agent reemet le MEME message toutes les ~48 s ». **Ce que la mesure montre** : le message repete est de **longueur 0** — une chaine VIDE. Ce n'est pas une reemission, c'est une ecriture de message vide. **Mesure en base de production, 2026-09-01** : sur 843 messages d'assistant, **457 sont vides — 54,2 %**. Cote utilisateur : **0 sur 390**. La chaine vide apparait dans **163 conversations distinctes** ; le dernier message vide a ete ecrit a `04:43:33Z` le jour meme. **Cause racine** (trouvee par #312, pas par moi) : `extractContent()` dans `services/ai-gateway/src/gateway.ts` rendait `''` pour toute forme de reponse non reconnue. La chaine vide traversait passerelle -> API -> base -> rendu **sans qu'aucune couche ne la conteste**, car indistinguable d'une reponse legitimement vide. **Correctif** : `extractContent` leve desormais une erreur au lieu de rendre `''` ; l'utilisateur voit une erreur au lieu d'une bulle muette, et le cas devient observable. **Lien avec le nettoyage des doublons du 01/09** : les lignes de `cmr308a86000e0o9wqitcgtwj` (73 pour 5 distinctes) ont ete deliberement epargnees — a raison : ce sont de vrais messages vides ecrits un a un, pas des copies de reouverture.

