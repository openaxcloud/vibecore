---
id: BUG-QA-CONTRASTE-ACCENT-ORANGE-001
---

## Bug

**L'orange de marque échoue au niveau AA dans les DEUX sens : en texte sur fond clair, et en fond de bouton sous du texte blanc.** Une seule cause pour tous les cas retenus — la teinte d'accent (`#F26207` en clair, `#F97316` / `--vc-ide-accent-action` en sombre) n'a pas assez de luminance pour porter du texte de taille normale. **(a) Blanc sur orange — boutons et badges principaux** : `Choisir la formule Pro` et `Choisir la formule Team` (`/upgrade`, 14 px) et le badge `Recommandée` (12 px) → **2,8:1** contre **4,5** requis ; `Créer une clé` (`/api-keys`, 14 px) → **2,8:1** ; `Envoyer le message` (`/contact`, 14 px) → **3,22:1**. Fond réel vérifié : `rgb(249,115,22)`. **(b) Orange sur fond clair — liens et intitulés** : `Explorer` (`/explore`), `Galerie` (`/gallery`), `Modèles` et `De vraies bases de projet` (`/templates`), `Voir la page` (`/solutions`) → **3,22:1** sur blanc ; `Galerie de modèles` et `Autres modèles` → **3,03:1** sur `rgb(247,248,249)` ; `hello@e-code.ai` (`/contact`, 12 px) → **3,02:1**. Tous sous les 4,5 requis. **(c) Gris sur fond sombre — intitulés de tableaux, cas limite** : `rgb(125,133,144)` sur `rgb(26,32,48)` → **4,35:1** contre 4,5, soit **0,15 d'écart**. Concerne `Quota`, `Utilisé`, `Limite` (`/usage`) et `Action`, `Entrée` (`/dashboard`), tous à 12 px. **Portée** : ces textes sont des **actions primaires** (choisir une formule, créer une clé, envoyer un message) et des **liens de navigation** — pas de la décoration.

## 📤

☐

## 💻

☐

## ✅

✅ **30/08** mesuré sur 144 relevés, fonds réels vérifiés un par un

## Preuve

**Méthode** : ratio WCAG calculé sur les couleurs rendues, avec les seuils AA corrects (**4,5:1** en texte normal, **3:1** au-delà de 24 px ou 18,66 px gras). 24 routes × {390, 768, desktop} × {clair, sombre} = **144 mesures**. Données : `/tmp/qa-sweep/mob/finition-art/finition.json`. Captures : `docs/audit/evidence-2026-08-27/contraste-upgrade-dark.png`, `contraste-templates-light.png`. ⚠️ **FAUX POSITIF ÉCARTÉ, et il illustre le piège** : le badge `Brouillon` des cartes de projet (`/dashboard`, `/projects`) ressortait à **1:1** — blanc sur blanc. Vérification du fond réel : c'est un `<span class="absolute right-3 top-3 z-[2]">` au fond **`rgba(0,0,0,0.7)`**. Ma sonde n'acceptait un fond qu'à partir d'une opacité de 0,95 et avait donc sauté ce calque semi-transparent pour remonter jusqu'à la page blanche. **Le badge est parfaitement lisible ; ce n'est pas un défaut.** Un calcul de contraste par remontée du DOM ment dès qu'un calque absolu ou un dégradé s'intercale — chaque candidat retenu ci-dessus a vu son fond réel vérifié individuellement avant d'être consigné. ⚠️ **Non confirmé, donc non retenu** : 3 candidats à 1,09:1 sur `/contact` en clair (`Commencez à créer avec E-Code`, `Décrivez ce que vous voulez`, `Ouvrir le tableau de bord`). La contre-vérification n'a pas retrouvé ces éléments — probablement une section en dégradé, le même piège que ci-dessus. **Écartés faute de preuve**, à revérifier.

