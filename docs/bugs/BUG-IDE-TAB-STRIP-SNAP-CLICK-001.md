---
id: BUG-IDE-TAB-STRIP-SNAP-CLICK-001
---

# Le scroll snap détourne le clic de fermeture d’un onglet desktop

## 📤 Dispatché

22 octobre 2026 : défaut reproduit en recette locale de #763 après déplacement d’un onglet et désépinglage par le menu visible. Il est distinct de la duplication d’onglets liée au focus/URL et de la disparition de palette pendant préparation. Aucune fiche identique identifiée dans la recherche ciblée des bugs existants.

## 💻 Codé

Correctif desktop commité localement dans `d0ef2126`, publication #763 en préparation : désactiver uniquement `scroll-snap-type` sur `.bolt-project-tabs` à partir de 1024 px. Le défilement doux et le menu bas mobile sont conservés. Non intégré à main ; aucune validation de production revendiquée.

## ✅ Testé live

Diagnostic local Chromium sur le produit compilé `69592374`, 22 octobre 2026 : fermeture native sans effet. Les événements instrumentés montrent pointerdown/mousedown sur la bande d’onglets, pointerup/mouseup sur le bouton de fermeture et click sur la bande. Avec smooth désactivé seul, le défaut reste présent et `scrollLeft` passe de 137 à 172 px pendant le geste.

Essais A/B : produit initial rouge, observation des événements rouge, smooth désactivé seul rouge ; smooth et snap désactivés verts ; snap désactivé seul vert, smooth conservé. Chaque passage compte un cas, zéro retry et zéro skip. Les deux verts exercent la fermeture puis le Retour navigateur. **Ce sont des injections CSS de diagnostic : elles ne valent pas validation du futur build produit.** Aucune assertion ni délai augmenté, aucun force-click.

[Rapports expurgés et détail des variantes](./ux-followup-2026-10-21/main-18cf-docking/navigation-echo/tab-strip-snap/README.md). Les traces réseau brutes restent locales. Recette complète du correctif compilé, CI et production encore distinctes et non certifiées ici.

Build compilé `d0ef2126` : les sept scénarios navigation passent directement, dont fermeture puis Retour (5,901 s), sans injection CSS. Recette combinée **73/73**, zéro retry/omission ; 35 unitaires verts. [Manifeste et matrice](ux-followup-2026-10-21/main-18cf-docking/final-navigation-stable/README.md). CI exacte et revue encore nécessaires avant fusion.
