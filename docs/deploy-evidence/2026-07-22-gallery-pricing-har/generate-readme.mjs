#!/usr/bin/env node
// P0-LS-13 — génère README.md ENTIÈREMENT depuis context-manifest.json (zéro métrique
// éditoriale : tous les nombres/hashes viennent de l'artefact). node generate-readme.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(HERE, 'context-manifest.json'), 'utf8'));
const nav = Object.fromEntries(m.navigations.map((n) => [n.key, n]));
const carried = m.cookieLinkage.filter((c) => c.sameValueCarried).map((c) => c.cookie);
const notCarried = m.cookieLinkage.filter((c) => !c.sameValueCarried).map((c) => c.cookie);
const ev = m.pricingObservationLinkage?.evidenced || [];
const nev = m.pricingObservationLinkage?.notEvidenced || [];

const md = `# P0-LS-13 — HAR fail-closed liant Gallery ↔ Pricing (même session, mêmes cookies)

> ⚠️ **Ce README est GÉNÉRÉ par \`generate-readme.mjs\` depuis \`context-manifest.json\`.**
> Ne pas éditer à la main — tous les nombres/hashes ci-dessous viennent de l'artefact final.

**evidenceId :** \`docs/deploy-evidence/2026-07-22-gallery-pricing-har/\`
**runId :** \`${m.runId}\` · **contexte unique :** ${m.singleBrowserContext} · **navigateur :** ${m.browser.engine} ${m.browser.version}

## HAR (source de vérité)
- fichier : \`${m.har.file}\` · **sha256 \`${m.har.sha256}\`**
- **entrées : ${m.har.entryCount}** · mode \`${m.har.mode}\` · corps embarqués : ${m.har.contentEmbedded}
- valeurs de cookies caviardées : ${m.cookieValuesRedacted}

## Navigations (fail-closed : statut 200 + URL finale exacte exigés)
${m.navigations.map((n) => `- **${n.key}** \`${n.url}\` → HTTP **${n.httpStatus}** · URL finale \`${n.finalUrl}\` · DOM \`${n.domFile}\` sha256 \`${n.domSha256}\``).join('\n')}

## Liaison cookie (fail-closed : 2 empreintes NON NULLES exigées)
Cookies **transportés** Gallery→Pricing (même valeur, empreintes non nulles) : ${carried.length ? '`' + carried.join('`, `') + '`' : '(aucun)'}.
Non transportés (renouvelés / absents, honnête) : ${notCarried.length ? '`' + notCarried.join('`, `') + '`' : '(aucun)'}.
${m.cookieLinkage.map((c) => `- \`${c.cookie}\` : posé=${c.valueHashSetDuringSession ?? 'null'} · renvoyé-pricing=${c.valueHashSentOnPricing ?? 'null'} · **sameValueCarried=${c.sameValueCarried}**`).join('\n')}

Total cookies transportés : **${m.cookiesCarriedCount}** (≥1 exigé sinon la capture échoue).

## Rattachement aux observations tarifaires (\`PRICE_OBSERVATION_REGISTRY\`)
Observation-scan liée : \`${m.pricingObservationLinkage?.linkedObservationScanId ?? 'n/a'}\`.
**Évidencées par CETTE session** (montant présent dans le DOM pricing de ce run) : **${ev.length}** —
${ev.length ? ev.map((o) => `\`${o.planId} ${o.amount} ${o.cadence}\``).join(', ') : '(aucune)'}.
**Non évidencées par cette session** (provenance propre conservée, honnête) : **${nev.length}** —
${nev.length ? nev.map((o) => `\`${o.planId} ${o.amount} ${o.cadence}\``).join(', ') : '(aucune)'}.

## Garanties fail-closed (correction expert V3)
- nav rejette non-200 : ${m.failClosed.navRejectsNon200} · nav rejette URL inattendue : ${m.failClosed.navRejectsUnexpectedUrl}
- liaison exige 2 empreintes non nulles : ${m.failClosed.linkageRequiresTwoNonNullFingerprints}

## Reproduire
\`\`\`bash
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/capture-har.mjs      # capture fail-closed
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/generate-readme.mjs  # régénère CE README
node docs/deploy-evidence/2026-07-22-gallery-pricing-har/verify-har.mjs       # tests négatifs + cohérence
\`\`\`

## Statut
**PROVEN_REVIEW_PENDING** — capture fail-closed, README/proof générés depuis le manifeste,
liaison exigeant 2 empreintes non nulles, session rattachée aux observations tarifaires.
Ne pas clôturer sans re-signature.
`;
writeFileSync(join(HERE, 'README.md'), md);
console.log(`README.md généré (${m.har.entryCount} entrées HAR, ${m.cookiesCarriedCount} cookies transportés, ${ev.length} observations évidencées).`);
