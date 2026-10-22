---
id: BUG-AGENT-PATCH-FAILURE-START-001
---

## Bug

**P1 — une proposition IA échouée perd sa cause et ne bloque pas le démarrage différé.** Sur la base `18cf74fd7abcd59620f0994b44ac1411e97fcf93`, `acceptAgentPatchProposal` remplace toutes les exceptions par une phrase générique et `#maybeRunDeferredStart` ignore l'état `failed`. Le navigateur utilisateur a observé Vite démarré mais `/src/main.tsx` absent, avec deux propositions échouées. Ces observations ne prouvent pas la cause de l'échec d'écriture du projet.

## 📤 Dispatché

☑ 22/10 — lot distinct du démarrage i18n et de la PR #763.

## 💻 Codé

☐ — candidat en branche ; aucune fusion dans main revendiquée.

## ✅ Testé live

☐ — pas de modification ni de réparation du projet utilisateur ; pas de validation Kubernetes complète.

## Correctif et limites

- Le diagnostic affiche l'étape d'application et une classification fixe. Les messages, corps, URLs et codes arbitraires des exceptions ne sont pas exposés.
- L'action de fichier est marquée échouée ; sa correction réussie la rétablit. Un échec ne vaut pas rejet explicite.
- Le démarrage différé attend l'acceptation ou le rejet explicite des propositions. La fermeture d'artefact conserve une reprise différée lorsque les propositions ne sont pas résolues.
- Les configurations JSONC connues sont analysées intégralement, commentaires et virgules finales compris. La réconciliation ne retient plus un préfixe JSON valide avant le premier commentaire. Le contenu distant concurrent reste fusionné ; un JSONC invalide ne devient pas un ancien stub présenté comme succès. `package.json` conserve sa validation JSON stricte.
- Une acceptation n'est confirmée qu'après relecture du contenu exact écrit. Une lecture transitoire peut être réessayée une fois ; aucune écriture n'est rejouée lorsque sa confirmation échoue. Un contenu différent conserve l'état échoué et le démarrage bloqué.
- En application automatique, les erreurs techniques restent visibles dans un résumé simple, avec détails et nouvelle tentative disponibles. Une modification conflictuelle, tronquée ou relue de la base conserve la revue explicite. Aucun conflit n'est accepté automatiquement.
- La sauvegarde retourne son contenu effectivement réconcilié, sans seconde écriture de la proposition antérieure. Elle conserve son runtime et son contexte avant la file asynchrone ; un changement de workspace interrompt la continuation sans réinjecter un ancien état. Les écritures et relectures distantes restent sujettes à une course inter-client en l’absence de comparaison atomique côté serveur : aucune garantie générale de synchronisation atomique n’est revendiquée.

La récupération d'un fichier présent dans l'éditeur mais absent du runtime est préparée séparément, pas livrée ici : `originalContent === ''` ne prouve pas une création et pourrait désigner un fichier vide supprimé volontairement. Une provenance explicite est nécessaire avant d'utiliser la création exclusive existante. Les essais locaux du workspace-agent prouvent le refus atomique d'une collision et la conservation du travail concurrent ; ils ne prouvent ni l'API gateway ni Kubernetes ni la cause production.

## Validation

Tests comportementaux du store : échec d'écriture, diagnostic sans secret, action échouée, démarrage non lancé, correction puis reprise ; fermeture sans action start, acceptation/rejet explicite et isolation entre artefacts. Tests de classification et garde-fous de sauvegarde distante conservés. Les fixtures de store sont des tests de logique et ne sont pas présentées comme une génération ou publication réelle. Résultats finaux et commandes consignés dans le descriptif de PR après exécution.
