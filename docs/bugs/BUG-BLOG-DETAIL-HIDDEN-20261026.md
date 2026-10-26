# BUG-BLOG-DETAIL-HIDDEN-20261026 — un article affiche la liste

📤 Dispatché ☑ · 💻 Codé/main ☐ · ✅ Testé live production ☐

La route `/blog/introducing-e-code` répond200 et son loader charge un article publié, mais le parent `/blog` rend uniquement le composant de liste sans Outlet. Défaut reproduit FR/EN clair/sombre,20observations de détail sur5formats ; captures/reçus dans [l’audit éditorial](ui-editorial-2026-10-26/README.md).

Correction locale autorisée : `app/routes/blog.tsx` retourne useOutlet() ou la liste. Hooks inconditionnels, aucune nouvelle coquille, données/loaders inchangés. Deux tests DataRouter rouges avant, puis quatre tests verts avec suite i18n existante ; lint/format corrigés et vérifiés. Revue indépendante du parent favorable : vrais parent/enfant/loaders/Router, rendu visuel isolé, Request restauré et router.dispose. Aucun build isolé ; recette compilée attendue dans le build commun du parent.

Limites : les7liens Lire la suite retournant à la liste et le manque de correspondance des6cartes avec les3articles publiés restent des défauts distincts, documentés sans suppression ni contenu inventé. Aucun état main ou production coché par cette correction locale.
