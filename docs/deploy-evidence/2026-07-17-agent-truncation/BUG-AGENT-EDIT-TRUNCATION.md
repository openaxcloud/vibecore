# BUG-AGENT-EDIT-TRUNCATION — agent in-place file edit saves a truncated file with a stray `</bo`

**Date** : 2026-07-17
**Fix** : commit `0e0017ae` on `origin/main` (`app/lib/runtime/message-parser.ts` + spec)
**Severity** : P0 — data loss (destroys the user's file content on an in-place edit)

## Symptôme (constaté 2/2, déterministe)

Une édition in-place de l'agent tronquait le fichier : le `});` de fin disparaissait,
un fragment `</bo` restait collé, le JS devenait invalide.

## Cause racine — MESURÉE (pas "on a ajouté une validation")

`StreamingMessageParser` (`app/lib/runtime/message-parser.ts`) parse le flux du modèle
`…<boltAction type="file">CONTENU</boltAction>…`. À chaque tick de streaming, il rescane
le buffer cumulé et cherche la balise fermante :

```
const closeIndex = input.indexOf(ARTIFACT_ACTION_TAG_CLOSE /* '</boltAction>' */, i);
```

- **Branche `closeIndex !== -1`** (balise complète) : `content = input.slice(i, closeIndex)` →
  CORRECT, byte-exact, `</boltAction>` retiré. Cette branche n'a jamais eu le bug.
- **Branche `else`** (balise pas encore complète) : émettait `input.slice(i)` **VERBATIM**
  via `onActionStream` — **y compris une balise fermante PARTIELLE coupée entre deux chunks**
  (`…});\n</bo`). Cette valeur alimente l'aperçu éditeur ET tout autosave-avant-fermeture.

Quand la sortie du modèle est **tronquée EN PLEINE balise** (il s'arrête sur `</bo`), le flux
se termine là : `onActionClose` — le seul endroit qui retire la vraie `</boltAction>` — **ne se
déclenche jamais**. Le dernier `onActionStream` (avec `</bo`) est donc ce qui est persisté sur
disque → fichier corrompu.

C'est le défaut classique du **délimiteur coupé entre deux chunks de streaming**.

## Le fix

`withoutTrailingCloseTagPrefix(content)` : retire le plus long suffixe de `content` qui est un
préfixe propre de `</boltAction>`. Une balise coupée est **retenue** jusqu'au chunk suivant qui
la résout (la branche fermante rescane le buffer complet et émet la slice exacte). Appliqué aux
DEUX branches de streaming : `file` et `diff`. Le délimiteur est de l'ASCII pur → ne coupe jamais
un caractère UTF-8 multi-octets.

## Preuve — le cas exact qui échouait 2/2 → réussit (parser RÉEL, sha + parse)

Entrée : le modèle streame tout le corps puis est tronqué à `</bo` (jamais de `</boltAction>`).
Contenu sauvegardé = dernier `onActionStream` (= ce qu'un save-avant-fermeture persiste) :

```
########## AVANT FIX (parser = origin/main~1) ##########
SAVED_CONTENT : "function setup(app) {\n  app.listen(3000, () => {\n    console.log('ready');\n  });\n}\nsetup(server);\n</bo"
saved.has("</bo")  : true
saved.parses       : SYNTAX-ERROR: Unexpected token '<'
sha256(saved)      : 26bb7dc97e1ece155667624265b3d250d10be1dff9834978ef24393ec64fdfc1

########## APRÈS FIX (origin/main HEAD) ##########
SAVED_CONTENT : "function setup(app) {\n  app.listen(3000, () => {\n    console.log('ready');\n  });\n}\nsetup(server);\n"
saved.has("</bo")  : false
saved.has(tail })) : true   (le `});` et `setup(server);` PRÉSERVÉS)
saved.parses       : OK
sha256(saved)      : ca6fb6238b2399f9c18d86d433313492917ca926854514cdaccf2d1349079ec5
```

sha AVANT (`26bb7dc9…`, ne parse pas) ≠ sha APRÈS (`ca6fb623…`, parse OK). Le `\n` final de
l'après-fix est du contenu réel émis par le modèle (pas la balise) → correctement conservé.

## Preuve — cas plus dur : fichier long + multi-octets, balise coupée en deux chunks

Fichier ~50 lignes avec accents / CJK / emoji (`Déploiement terminé — félicitations ✅`,
`デプロイが完了しました 🚀`, `🌍🌎🌏`), `</boltAction>` splittée exactement après `</bo`.
Assertions (test unitaire) : aucun `onActionStream` ne contient `</bo`, `onActionClose` final
byte-exact (`content === body + '\n'`), multi-octets intacts, `new Function(content)` OK.

## Test de non-régression — ÉCHOUE SANS LE FIX

`app/lib/runtime/message-parser.spec.ts` →
`describe('streaming close-tag split across chunks — no partial </bo leak (data-loss regression)')` :
3 tests (truncated-mid-tag, long+multibyte, garde `</body>` légitime non sur-strippé).

Preuve que le test échoue sans le fix (parser remis à `origin/main` = sans fix) :

```
❯ message-parser.spec.ts (63 tests | 2 failed | 60 skipped)
  × truncated mid-close-tag: … excludes `</bo` and still parses
     → expected 'function setup(app) {\n  app.listen(3…' not to contain '</bo'
  × harder case — long file + multi-byte UTF-8 … 
     → expected 'const messages = {\n  fr: \'Déploieme…' not to contain '</bo'
```

Avec le fix : **63/63** specs message-parser + **3** enhanced-parser verts, lint clean.

## États (règle CLAUDE.md)

- 📤 Dispatché : n/a (pris directement)
- 💻 Codé : ✅ `0e0017ae` poussé sur `origin/main` (déclenche CD `deploy-main.yml`)
- ✅ Testé live : ⏳ à confirmer sur prod après déploiement (test unitaire = preuve du fix ;
  vérif live = un edit in-place réel dans l'IDE dont la sortie modèle se tronque)
