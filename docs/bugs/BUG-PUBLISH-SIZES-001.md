---
id: BUG-PUBLISH-SIZES-001
---

## Bug

**P2 — panneau Déploiements : tout le contenu est TROP GROS, loin de Replit** (Avi, 09/09 10:32 : « tout le contenu est trop gros c'est pas comme Replit, c'est pas compréhensible et tu as pas fait tout comme ce design »). Sur ses captures : « Republier votre application » et « Réglages de base de données » en très gros titres sur deux lignes, cartes très hautes, bouton Republier géant.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

MESURÉ à 390 px, EN FRANÇAIS, sur le build de production : titre « Republier votre application » sur **2 lignes / 69 px**, « Ajuster les réglages » sur 2 lignes, « Domaines connectés » sur 2 lignes, « Ajouter un domaine » sur 2 lignes. Mon erreur de méthode : j'avais calibré l'échelle sur les libellés ANGLAIS, qui tiennent où le français déborde d'un cinquième. Nouvelle échelle : titre 30→19, corps 15→13, titre de carte 17→15, secondaire 14→12, bouton 17→15 et 56→44 px de haut. La garde ne fige pas que des pixels : elle vérifie qu'AUCUN titre ni bouton ne se replie en français à 390 px — la règle, pas l'occurrence. épinglé par `tests/e2e/ide-mobile-chrome.spec.ts` (« rien ne se replie en français »)

