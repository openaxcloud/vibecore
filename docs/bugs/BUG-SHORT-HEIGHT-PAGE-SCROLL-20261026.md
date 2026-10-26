---
id: BUG-SHORT-HEIGHT-PAGE-SCROLL-20261026
---

## Bug

À faible hauteur, le verrou de défilement destiné à l'IDE s'applique aussi aux pages publiques et utilisateur.

Sur `/account-inactivity` à844×390, FR/EN et clair/sombre : molette600 et PageDown ne déplacent pas la page. Le dernier titre reste horsviewport à744,75px. Le contenu existe : scrollIntoView déplace le BODY566px. Cause identifiée dans `app/styles/index.scss:23349` : `@media(max-height:499px)` impose globalement `html, body { overflow:hidden; }`. Le cas Security est diagnostiqué séparément par ui_remaining ; les mêmes preuves ne sont pas comptées deux fois.

## 📤 Dispatché

☑ 26/10/2026 — Audit UI local demandé, cause et proposition partagées avec le parent et ui_remaining. Vérification des PR concurrentes rapportée par le parent : #559/#424 touchent le fichier mais aucun hunk de cette règle ; aucune opération précédemment refusée retentée.

## 💻 Codé

☐ Sur main. Correctif local appliqué et compilé par le parent, union de deux sélecteurs seulement ; pas encore déclaré sur main par cette fiche. La proposition initiale et les preuves avant sont conservées.

Proposition : limiter les sélecteurs html/body aux descendants `.bolt-project-ide-shell` ou `.bolt-responsive-ide` dans la règle existante. Le premier couvre le fallback SSR de la route projet, le second BaseChat monté et legacy ; overflow:hidden IDE reste inchangé. Aucun override public séparé ni modification de navigation.

## ✅ Testé live

☐ En production. Aucun compte, suppression/désactivation ou backend réel utilisé. Fusion de #796 rapportée séparément par coordination ; elle ne livre pas cette proposition nouvelle.

## Validation locale

Avant10899 :20 observations Account Inactivity,4 parcours focus/Retour et4 diagnostics paysage reproduisent le verrou. Contrepreuves DOM conservées séparément.

Après11099, union CSS compilée réelle :4 groupes Account Inactivity FR/EN ×clair/sombre à844×390. Huit gestes wheel/PageDown déplacent le contenu ; petits gestes de molette rendent le dernier paragraphe accessible sans scrollIntoView. Menu Radix : fond verrouillé à l’ouverture, Escape rend le focus et permet de défiler à nouveau. Focus mailto conservé au resize, mais parfois hors viewport/sous header : limite distincte non corrigée.

Security11099 FR clair paysage : molette/PageDown et récupération du champ après resize rétablis, brouillon conservé ; limite horizontale x43<47 encore présente. Sur vraie route IDE synthétique montée, HTML/BODY restent hidden et navigation basse72px visible ; aucun DOM IDE injecté. Legacy /chat renvoie302 vers/, donc pas de recette interactive legacy revendiquée.

Nouveau guard dans la suite E2E existante : rouge11199 sans correction, vert11099 avec wheel260 et PageDown,1 test,0 retry ; poll en lecture seule après un geste, pas de hack de scroll. [Guard rouge/vert](ui-coverage-2026-10-26/scroll-regression/README.md), [Account Inactivity11099](ui-coverage-2026-10-26/account-inactivity/after11099/README.md), [Security et IDE11099](ui-coverage-2026-10-26/safeareas/after11099/README.md). Aucun backend réel ni extrapolation à tous les layouts.

## Preuves et limites

[Recette, scripts, captures et mesures](ui-coverage-2026-10-26/account-inactivity/README.md). Focus mailto conservé au resize mais horsviewport avant correction ; aucune promesse de focus visible. Pas de Safari/Firefox, zoom200%, clavier virtuel OS, safeareas matérielles ou lecteurécran. Aucune recette exhaustive de tous les layouts/modales. La préservation compilée du verrou IDE et du menu est attestée dans Validation locale, sans couvrir toutes les modales.

Complément reçu ensuite : [contrepreuve sur vrai IDE monté](ui-coverage-2026-10-26/safeareas/after10999/ide-selector-scoped-counterproof.json) relue indépendamment. L'union appliquée à une seule règle CSSOM conserve hidden sur HTML/BODY et la navigation basse à844×390 (top318, hauteur72), avec coqueSSR et BaseChat réellement présents. Pas de source appliquée ni recette compilée à ce stade ; le legacy reste vérifié par source uniquement.

## Recette compilée après correction

[Account Inactivity11099](ui-coverage-2026-10-26/account-inactivity/after11099/README.md) :4groupes FR/EN×thèmes paysage,8gestes wheel/PageDown déplacent réellement le texte ; dernierparagraphe accessible sousheader, menuRadix verrouille le fond puis Escape restituefocus et scroll, Backcorrect. Aucune injectionDOM ni source supplémentaire. Focus mailto aprèsresize reste actif mais horsvue/sousheader : reste distinct, non corrigé par cette règle. Tests/build rapportés par parent restent séparés de cette recette ; main/prod☐.
