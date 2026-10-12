---
id: BUG-QA1011-VERCEL-JETON-DANS-CONSOLE
section: "2026-10-11 — Reprise vérifiée"
---

# Jeton Vercel écrit dans la console du navigateur

Mesuré le 2026-10-11 pendant la reprise A-15 : `VercelConnection.tsx` passait l’objet `connection` entier à `console.log` lors du rendu. Cet objet contient le jeton d’accès. Aucun jeton client réel n’a été lu ni reproduit dans cette preuve ; aucun incident d’accès à la console client n’est établi.

Correction : suppression de ce journal brut. Les diagnostics déjà masqués restent masqués. La garde monte le composant avec un jeton de fixture, observe les appels réels à la console et vérifie qu’aucun ne contient cette fixture ; son témoin positif exige que des appels aient réellement eu lieu. Réintroduire uniquement le journal brut rend le cas rouge. Aucune donnée sensible réelle n’est imprimée.

État : préparé dans `fix/reprise-parcours-client-20261011`, pas fusionné sur main, pas servi. Les cinq cas de connexion Vercel passent avec la correction.
