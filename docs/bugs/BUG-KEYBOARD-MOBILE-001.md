---
id: BUG-KEYBOARD-MOBILE-001
---

## Bug

**P1 — iPhone, clavier levé : le composeur reste 90 px au-dessus du clavier** (il réserve la place du socle, passé SOUS le clavier) ; sur l'état de départ le socle flotte au-dessus du clavier et le composeur est hors de vue. Captures 06/09 11:04.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — `data-vc-clavier="ouvert"` posé par BaseChat dès que le bas recouvert dépasse 150 px (`clavierProbablementOuvert`, la barre Safari seule fait 44–84 px) : composeur collé au clavier, socle masqué, pastille « descendre » à 12 px. Épinglé par `app/components/chat/visual-viewport-bottom.spec.ts` (seuil, câblage, **et depuis le 10/09 l'ABONNEMENT lui-même**) + `app/styles/ide-mobile-panels.spec.ts` (§9, CSS + câblage). ⚠️ **10/09 — une moitié n'était pas tenue, et c'est celle qui porte tout** : rien ne gardait `visualViewport.addEventListener`. Or la levée du clavier iOS ne déclenche PAS `window.resize`. MESURÉ : en retirant les deux abonnements, les 11 tests existants du fichier restent VERTS pendant que la fonction est morte sur l'iPhone. Contre-épreuve dans les deux sens (abonnements retirés → 2 rouges ; un seul retrait manquant → 1 rouge nommant l'orphelin). **Non mesurable sur Chromium** (fenêtre visuelle immobile) : preuve iPhone à prendre.

## ✅ Testé live

☐

## Preuve

Captures 06/09 11:04.

