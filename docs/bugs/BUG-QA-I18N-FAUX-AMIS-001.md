---
id: BUG-QA-I18N-FAUX-AMIS-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P2 — quatre termes techniques de déploiement sont TRADUITS en français alors qu'ils doivent rester invariants, et le résultat est absurde à l'écran.** Ce ne sont pas des chaînes manquantes : ce sont des entrées de catalogue dont la valeur française est fausse, dans `app/lib/i18n/catalogs/chat.ts`. `Production` → **« Fabrication »** (sens : usine), `Extensions` → **« Rallonges »** (sens : rallonge électrique), `extension` → **« rallonge »**, `Staging` → **« Mise en scène »** (sens : théâtre). **Impact utilisateur mesuré** : sur le panneau **Variables d'environnement** en 390 px, « Fabrication » apparaît **5 fois sur un seul écran** — l'onglet d'environnement, le libellé « Rechercher des variables Fabrication », l'état vide « Aucune variable Fabrication », la phrase « Ajoutez une variable pour configurer l'environnement d'exécution Fabrication de ce projet » et le sélecteur « Portée ». Un utilisateur qui configure une variable de **production** ne lit jamais le mot « production ». Sur le panneau **Extensions**, le titre affiche « Extensions » et le sous-titre immédiatement en dessous affiche « **Rallonges** » — deux traductions contradictoires du même mot, à 30 px d'écart.

## 📤

☐

## 💻

☐

## ✅

✅ **01/09** mesuré au rendu + corrigé

## Preuve

**Preuve de rendu** : env d'audit (`web` `040dd2976d`), `/projects/<id>/ide?panel=env`, viewport 390×844, locale FR, thème clair → capture `docs/audit/evidence-2026-09-01/m3-env.png`, les 5 occurrences de « Fabrication » sont lisibles. Panneau Extensions : capture `m3-extensions.png`. **Preuve de source (paires EN/FR du même catalogue)** : `chat.copy.production_df70fc79` = `'Production'` ligne **677** / `'Fabrication'` ligne **2262** ; `chat.copy.extensions_656bcfe2` = `'Extensions'` **345** / `'Rallonges'` **1915** ; `chat.copy.extension_f9896101` = `'extension'` **343** / `'rallonge'` **1913** ; `chat.copy.staging_c9fb656c` = `'Staging'` **895** / `'Mise en scène'` **2488**. **Méthode de détection** : recoupement automatique des 2 551 entrées `chat.copy.*` — la clé encode le terme source anglais — contre une liste de termes techniques invariants. **Contrôle négatif indispensable** : la même sonde a levé 3 autres écarts qui sont du **français correct** et que je ne retiens pas — `cache` → « Mémoire cache », `runtime` → « Environnement d'exécution », `secrets` → « Variables secrètes ». Seuls les 4 ci-dessus sont des contresens. **Correctif appliqué** : les 4 valeurs FR ramenées au terme invariant. **Portes CI vérifiées après correctif** : `node scripts/i18n/validate-catalogs.mjs` → *i18n catalog validation clean* (204 fichiers, en=18608, fr=18608, matching=18608) ; `node scripts/i18n/scan-source.mjs` → *i18n source baseline clean*. Aucune règle n'exige qu'une valeur FR diffère de l'EN — vérifié avant de corriger, car c'était le risque évident de ce correctif.

