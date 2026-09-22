---
id: BUG-E2E-NETWORKIDLE-NON-BORNE-001
---

## Bug

**P2 — une attente `networkidle` NON BORNÉE n'aboutit JAMAIS sur une page d'IDE et consomme tout le budget du test.** Mesuré le 10/09 sur le run E2E de #531, échec **DÉTERMINISTE** (3 tentatives sur 3, donc pas un flake — règle 17) : `Test timeout of 120000ms exceeded` sur `agent-conversation-sans-creation.spec.ts`.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

⚠️ **LE MESSAGE ACCUSAIT LA MAUVAISE LIGNE** : `page.waitForTimeout: Target page, context or browser has been closed` désigne `waitForTimeout`, qui n'y est pour rien — le test était déjà mort quand il s'y est présenté. **DEUX causes cumulées.** (1) Les plafonds s'ADDITIONNENT et je ne les avais pas additionnés : `/auth/register` se replie jusqu'à 3 × 11 s, le champ s'attend 60 s, le signal d'hydratation encore 60 s — **153 s de plafonds pour un budget de 120 s**. (2) Les pages d'IDE de ce produit interrogent en boucle (état d'espace de travail, ports, journaux), donc « réseau au repos » n'est JAMAIS atteint et l'attente va au bout de son délai, en silence. **COÛT RÉEL** : un cycle de CI rouge, et le **canari iOS SAUTÉ** — la porte E2E ayant échoué avant lui, la première mesure de BUG-SELECT-TOUCH-001 sur le moteur de Safari n'a pas eu lieu. ⚠️ **ET J'AVAIS GARDÉ CETTE CLASSE LE MATIN MÊME** : `montage-e2e-a-son-budget.spec.ts` tient exactement ce principe — un montage doit avoir le budget de ce qu'il fait — mais posée sur les hooks `beforeAll` seulement. Ma faute était dans le CORPS du test. **Une garde protège ce qu'elle regarde, pas ce qu'elle veut dire.** Correctif : budget à 180 s comme les specs voisines, et `networkidle` borné à 5 s (son coût devient connu). épinglé par `tests/guards/montage-e2e-a-son-budget.spec.ts` — aucune attente `networkidle` sans borne explicite dans `tests/e2e`, avec le prédicat lui-même mis à l'épreuve sur les deux formes (règle 14 bis). Contre-épreuve sur le vrai fichier : l'attente remise NUE, telle qu'elle était en CI → rouge, fichier et ligne nommés.

