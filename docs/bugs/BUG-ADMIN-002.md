---
id: BUG-ADMIN-002
---

## Bug

**P2 — le panneau « Fournisseurs d'IA » annonce « aucune cle » pour les 30 fournisseurs, y compris les 4 qui font tourner la plateforme.** C'est ce qui pousse un operateur a recopier une cle deja en place.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **OUVERT — mesure en prod 01/09**

## Preuve

**Cause** : le panneau lit `GET /admin/providers/fallback-order`, dont `keyConfigured` est calcule sur la **seule** colonne `ProviderConfig.apiKeyEnc` (`services/api/src/app.ts`), alors que `providerAdminView` et `/admin/provider-health` tiennent compte, eux, de la variable d'environnement. **Trois surfaces, trois reponses a la meme question.** **Mesure en base de production** : **0 ligne sur 30** porte une cle en base — les cles vivent dans le Secret Kubernetes `vibecore-platform-secrets`. Le panneau affiche donc `keyConfigured: false` partout.

