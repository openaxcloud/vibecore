# IMPORT — pipeline d'import sécurisé : preuve (2026-07-16)

Commit : 7d45c2cb. Machine à états NORMATIVE
RECEIVED → STAGING_ISOLATED → SCANNING → QUARANTINED → AWAITING_USER_ACTION →
COMMITTING → COMMITTED ; cleanup ROLLING_BACK / EXPIRED / CANCELLED.

## Invariants prouvés
- I-IMP-1 (aucune suppression silencieuse) : le scan ne modifie jamais le
  contenu ; findings présentés (redactés) et bloquants ; redaction seulement
  sur consentement explicite par-finding.
- I-IMP-2 (staging jetable, cible jamais montée avant le commit) : les fichiers
  vivent dans un staging in-process jetable ; la cible n'est écrite qu'au commit
  atomique — cancel/rollback/timeout/échec → aucune cible.

## Preuves (le test CHERCHE, il ne suppose pas) — services/api/src/tests/import-routes.spec.ts
1. Import d'un dépôt AVEC secret (.env `API_SECRET=…`) → HTTP 202
   AWAITING_USER_ACTION, finding PRÉSENTÉ avec preview REDACTÉ, valeur brute
   absente du payload ; `writeCalls == []` (cible pas touchée) ; hash du
   contenu source inchangé (rien réécrit en douce).
2. Consentement REFUSÉ (cancel) → CANCELLED : `writeCalls == []`,
   `projectStorage.files.size == 0`, `targetProjectId` undefined — la cible
   n'a JAMAIS existé (pas « nettoyée après »).
3. Commit sans résoudre les findings → HTTP 409 IMPORT_UNRESOLVED_FINDINGS,
   toujours aucune écriture cible.
4. Consentement DONNÉ (redact) → COMMITTING → COMMITTED atomique : le premier
   et unique write cible ; secret ABSENT de la cible, `API_SECRET=` conservé
   (référence), ligne `DEBUG=true` intacte ; redactedCount=1.
5. Consentement DONNÉ (keep) → la valeur choisie est conservée (l'utilisateur
   en est propriétaire — pas de suppression silencieuse).
6. Cleanup sur ÉCHEC : write cible mocké en rejet → HTTP 5xx, état
   ROLLING_BACK, `targetProjectId` undefined (aucune cible partielle). Le
   cleanup marche sur le chemin malheureux, pas seulement le chemin heureux.
7. Logs REDACTÉS : `import.scan` est bien loggé, mais la valeur du secret
   n'apparaît nulle part dans les logs de l'import.

## Résultat brut
22 tests verts (15 module pur import-pipeline + 7 endpoint).
Suite globale des chantiers (import+remix+agent-routing) : 51/51.
Build strict services/api (tsc depuis src/server.ts) : exit 0.

## Inventaire (CONFIRMÉ)
12 tuiles du hub : github, bitbucket, vercel, figma, claude, bolt, lovable,
base44, zip, spreadsheet, previous-agent-export, empty. GitLab = flux Git mais
PAS une tuile ; Screenshot = référence Agent/Canvas, pas un provider ; Empty EST
une tuile. Exécutés aujourd'hui : github/bitbucket/zip/empty ; les autres sont
🟡 modélisés (le staging+scan+commit fonctionne pour tout provider, la source
réelle vercel/figma/etc. est un follow-up connecteur).

## Décision E-CODE (pas parité)
Réservation de crédits Agent idempotente avant démarrage (clé = importJobId) —
marqueur `creditsReserved`, étiqueté DÉCISION E-CODE. Le débit réel est un
follow-up ; certaines migrations Replit consomment des crédits Agent (confirmé).

## Honnêteté / 🟡
- Le staging jetable est in-process (Map) : correct pour l'invariant (cible
  jamais montée avant commit) ; un prod multi-réplique le back-erait par un
  store éphémère partagé — noté, non fait.
- La source réelle des providers non exécutés (vercel/figma/claude/bolt/
  lovable/base44/spreadsheet/previous-agent-export) = follow-up connecteur.
- Preuve = tests d'intégration in-process, pas encore un parcours UI prod.
