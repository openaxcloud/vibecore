# AGM — Agent modes + routage admin : preuves live (2026-07-16)

Mission : suppression du sélecteur de modèle (147 modèles) partout, 3 modes
(Lite / Economy défaut / Power) dans l'IDE uniquement, routage mode→modèle par
carte versionnée côté control plane, écran admin avec coût de revient + marge.

Commits : dc2d6c9d (billing+db) · d0b302fa/9ec04adf/fb79c0ec (api) ·
7abcb045 (app serveur) · 84c860b5 (UI) · fee92bd0 (admin SPA).

Preuves exigées :
- (a) DOM e-code.ai : plus aucun nom de modèle — `a-dom-*.txt`
- (b) 3 modes dans l'IDE — `b-ide-modes.png`
- (c) changer de mode change le modèle appelé (log) — `c-routed-*.json`
- (d) le coût diffère selon le mode — `d-calllog.json`
- (e) mode/switch non autorisé par le plan → refus — `e-refus-*.json`
- (f) marge affichée + alerte négative — `f-admin-*.png` / `f-409.json`
