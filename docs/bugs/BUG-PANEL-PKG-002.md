---
id: BUG-PANEL-PKG-002
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**HYPOTHÈSE, non reproductible à la demande — `packages` n'a pas rendu du tout.** Une occurrence sur ~6 : le sélecteur du panneau n'est jamais apparu en 45 s, alors que le même panneau rendait normalement quelques minutes plus tôt. **Pas une régression : une hypothèse.**

## 📤

—

## 💻

—

## ✅

❌

## Preuve

`paint-timeline.json` → entrée `packages` : `"error": "page.waitForSelector: Timeout 45000ms exceeded"`, `samples: {}`. À refaire avec un compteur d'occurrences (règle 17).

