---
id: BUG-QA-I18N-COUNT-002
---

## Bug

**Le défaut d'espace/pluriel des compteurs est systémique, pas isolé.** Même famille que `BUG-QA-I18N-COUNT-001`, confirmée sur plusieurs surfaces indépendantes : Bibliothèque « **8fichiers** » / « **1fichiers** » ; panneau Compétences « **Projet4** », « **Espace de travail0** », « **Communauté12** ». S'y ajoutent deux variantes : le repli `(s)` non résolu dans Paquets — « **1 fichier(s) de verrouillage détecté(s)** » — et un titre de panneau resté en anglais, « **Secrets** », alors que la navigation affiche « Variables secrètes ».

## 📤

☐

## 💻

☐

## ✅

✅ **12/08** reproduit live

## Preuve

Relevés sur `react-saas-mspwdodf` (8 fichiers) et `cr-e-une-page-d-accueil` (1 fichier), build `web:c3636dad2b`. Cause commune : compteur et nom juxtaposés en deux nœuds texte JSX (`{count} files`), la couche i18n normalisant le nœud traduit fait disparaître l'espace de tête et n'applique aucune règle de pluriel. **Correctif attendu** : clés i18n à interpolation avec `count` (`t('files.count', {count})`) sur **toutes** ces surfaces, et traduction du titre du panneau Secrets.

