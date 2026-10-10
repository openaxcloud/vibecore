---
id: CONSTAT-PAGES-GABARIT-PUBLIQUES
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Constat

**`e-code.ai/plans` et 56 autres pages publiques montrent au visiteur du texte de DÉVELOPPEMENT, et `/plans` n'affiche
aucun prix.** Relevé par la session mobile, documenté le 2026-10-10 (lecture seule, en production) :
« SURFACE D'EXPLOITATION », « ecode route verify /plans », « Offres est désormais une véritable route E-Code adossée au
plan produit importé », « Importé depuis E-Code et affiché dans la navigation publique E-Code ».

- Source : la route attrape-tout `app/routes/$slug.tsx` rend un GABARIT de remplissage (`EcodeSurfacePages.tsx` et
  `marketing-surface.ts`). Ce texte est celui du gabarit, pas un reste propre à une page.
- 57 pages servies par ce gabarit à un visiteur anonyme, toutes en 200 ; échantillon de 9 sur 9 porteur des phrases.
  Pas de `noindex`, absentes du sitemap, liées entre elles. Indexation Google non mesurée (vérification anti-robot).
- Détail : `/Users/hb/captures-vibecore/constats/PAGES-GABARIT-PUBLIQUES.md`.

## Correctif préparé (branche `fix/pages-gabarit-sans-texte-interne`) — ATTEND L'ACCORD D'AVI

Le plus petit geste chiffré, et rien de plus :
1. `/plans` → **301 vers `/pricing`** (paramètres gardés), dans le loader de `$slug.tsx`.
2. Retrait du gabarit, SANS texte de remplacement :
   - le sur-titre de catégorie (« … surface ») ;
   - le bloc « ecode route verify » ;
   - la ligne « Importé depuis E-Code… » ;
   - le sous-titre « … de vraies pages » ;
   - les deux sections par défaut (« Flux … adossée au plan produit importé », « Contrôles de production … page de
     compatibilité vide ») ;
   - deux libellés d'accessibilité du même jargon (« Détails de la route … », « Capacités importées de … »).
   - Les clés de catalogue devenues inutiles sont supprimées (EN et FR).

Épinglé par `app/components/marketing/pages-gabarit-sans-texte-interne.spec.tsx` : 62 pages-gabarit rendues (3
registres), en FR et en EN, plus la redirection. Contre-épreuve : avec le gabarit et la route de `main`, 62 pages sur 62
fautives dans chaque langue et la redirection rouge ; avec le correctif, 6/6. Deux tests existants qui exigeaient le
texte retiré ont été ajustés en gardant leur intention : « au moins deux sections » (qui comptaient le remplissage comme
du contenu) et le sur-titre « Surface de création ». Suite `app/components/marketing`, `app/routes`, `app/lib/i18n` :
338 fichiers sur 338. Validateurs i18n : propres.

## Ce que ce correctif NE règle PAS (contenu à écrire par quelqu'un qui le connaît)

- Plusieurs pages gardent une DESCRIPTION propre rédigée comme une note de développement, par exemple `home` :
  « A signed-in style home surface that routes users to recent work… », ou `runtime-diagnostics` : « A diagnostics
  surface for… ». C'est leur contenu, je ne le réécris pas en l'inventant.
- Le lien des routes associées « Découvrez la surface produit E-Code importée » (EN « Review the imported E-Code product
  surface ») : idem.
- Les pages restent des pages de remplissage (titre, description, points forts), sans contenu produit réel.
- Quatre pages portent des noms de données de démonstration : `solartech-ai-chat`, `solartech-crm`,
  `salesforcepro-crm`, `solartech-fortune500-store`. Les garder publiques ou non relève d'une décision.

## 📤

☐ en attente de la décision d'Avi

## 💻

☐ préparé, non fusionné — branche `fix/pages-gabarit-sans-texte-interne`

## ✅

☐

## Preuve

Épinglé par `app/components/marketing/pages-gabarit-sans-texte-interne.spec.tsx`. Preuve live : à faire après
déploiement (A1 de la passe de vérification, plus `/plans` → 301).
