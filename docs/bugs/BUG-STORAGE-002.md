---
id: BUG-STORAGE-002
---

## Bug

**P1 (INFRA — pour la session dédiée) — le STOCKAGE D'OBJETS est hors service : le pod API ne peut pas obtenir de jeton GCP, la requête pend 30 s puis échoue.** Le panneau ne charge donc jamais, en **mobile comme en desktop**.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

**Repro live, viewport iPhone 13 (390) ET desktop 1440** — env d'audit, projet réel. Appel direct des intentions du panneau depuis la page : `POST /api/projects/<pid>/ide-panel/object-storage` avec `intent=status` **et** `intent=list` → **`500 {"error":"Le service du panneau est temporairement indisponible. Veuillez réessayer.","code":"PANEL_REQUEST_FAILED"}`** dans les deux cas. **Signature décisive dans les logs du pod web** : `POST …/ide-panel/object-storage 500 - - **30006.764 ms**` et `30005.664 ms` — un **délai d'attente de 30 s**, pas une erreur applicative ; le `GET` du même panneau répond `200` en `339 ms`. Le pod API reçoit bien `GET /projects/<pid>/object-storage/status` mais n'émet jamais de réponse. **Cause racine prouvée depuis le pod API** : `169.254.169.254` (serveur de métadonnées GCP) → **TIMEOUT** ; `storage.googleapis.com` → **joignable** (`STATUS 400`, réponse normale à un GET nu) ; `OBJECT_STORAGE_ENABLED` → **activé**. La fonctionnalité est donc allumée et GCS est atteignable, mais le client Google **ne peut pas frapper le serveur de métadonnées pour obtenir ses identifiants** : il pend jusqu'au délai du panneau. ⚠️ **Pour la session INFRA** : c'est la classe **BUG-STORAGE-001** (garde anti-SSRF / metadata server). Aucun correctif applicatif ne peut y remédier — il faut soit autoriser le pod API à joindre le serveur de métadonnées, soit lui fournir des identifiants par un autre canal (Workload Identity correctement lié).

