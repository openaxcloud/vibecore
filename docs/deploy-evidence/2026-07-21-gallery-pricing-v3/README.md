# Paquet de preuve v3 — Gallery + Pricing (2026-07-21, corrections verdict RR-20260721-CODEX-03)

Ce paquet REMPLACE `docs/deploy-evidence/2026-07-16-collector-gallery/` comme
evidenceId de P0-V4-1 / P0-V4-2 (l'ancien reste en repo comme historique, avec
sa section CORRECTION).

## Ce que la capture fraîche du 21/07 établit (métadonnées : metadata.json)

1. **« 82 Results » EXISTE** — c'est un compteur réel de la page (éclaté en
   nœuds DOM « 82 Result s », d'où les greps ratés). La correction v2 qui le
   déclarait disparu était FAUSSE — le claim v3 le RÉTABLIT comme capacité.
2. **Views est un compteur VIVANT** : Journey Mapper 20,650 (~16/07 matin) →
   20,653 (rendu 16/07 16:58) → **20,768** (21/07). Aucune de ces valeurs
   n'est « la bonne » — le claim v3 cite la valeur PAR CAPTURE, datée.
3. **Report au niveau APP : ABSENT du rendu public** — seul le lien footer
   générique « Report abuse » → docs.replit.com/legal-and-security-info/abuse-report.
4. **Prix — UNE observation liée** : $25/$20 (Core) et $100/$95 (Pro) capturés
   AVEC locale (fr-FR), cookies nommés (gating_id = cohorte, _dd_s), géo-IP
   (metadata.json), horodatage précis et hash DOM — dans le MÊME instant.

## Hashes (recalculables)
- gallery-capture.txt : voir DOCUMENT_MANIFEST (hashé par la CI)
- metadata.json : idem
- DOM gallery sha256 (calculé en page) : a5f6e4f9… (1 538 288 octets)
- DOM pricing sha256 (calculé en page) : 4157fdb7… (266 037 octets)

Limite déclarée : le HTML complet (1,5 Mo) n'est pas archivé dans CE paquet —
le hash du DOM est calculé en page (SubtleCrypto) et l'innerText complet est
conservé ; la prochaine passe du collecteur (playwright CI) archivera le HTML
et DOIT retrouver « 82 Result » dans le DOM.
