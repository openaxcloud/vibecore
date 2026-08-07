/**
 * Rejeu du REFUS EXPERT du 2026-08-04 sur le masquage IBAN.
 *
 *   npx tsx docs/deploy-evidence/2026-08-04-v305-reserves/replay-iban-expert.ts
 *
 * Sort 1 si un seul cas régresse. Le cas nominal du refus est
 * « ES91 2100 0418 4502 0005 1332 EUR » : l'IBAN doit partir, « EUR » rester.
 */
import { maskPiiInFiles } from '../../../services/api/src/remix-pipeline.js';

const M = '[PII:iban masked on remix]';
const mask = (s: string) => maskPiiInFiles([{ path: 'x.txt', content: s }]).files[0].content;

const cases: Array<[string, string, string]> = [
  ['REFUS EXPERT — EUR doit survivre', 'ES91 2100 0418 4502 0005 1332 EUR', `${M} EUR`],
  ['devise GBP', 'GB29 NWBK 6016 1331 9268 19 GBP', `${M} GBP`],
  ['devise USD', 'DE89 3704 0044 0532 0130 00 USD', `${M} USD`],
  ['groupe terminal de 3 (bug v1)', 'FR76 3000 6000 0112 3456 7890 189 EUR', `${M} EUR`],
  ['colonne CSV', 'ES91 2100 0418 4502 0005 1332,EUR,1200', `${M},EUR,1200`],
  ['tabulation', 'ES91 2100 0418 4502 0005 1332\tEUR', `${M}\tEUR`],
  ['ponctuation', 'Compte (ES91 2100 0418 4502 0005 1332).', `Compte (${M}).`],
  [
    'DEUX IBAN dans la phrase',
    'De ES91 2100 0418 4502 0005 1332 vers NL91 ABNA 0417 1643 00, 50 EUR.',
    `De ${M} vers ${M}, 50 EUR.`,
  ],
  ['espaces INSÉCABLES', 'ES91 2100 0418 4502 0005 1332 EUR', `${M} EUR`],
  ['forme COMPACTE', 'compact ES9121000418450200051332 fin', `compact ${M} fin`],
  // R1 (arbitrage 2026-08-05) : ex-« sosie », DÉSORMAIS MASQUÉ.
  ['R1 — checksum FAUX, longueur bonne -> MASQUÉ', 'ES91 2100 0418 4502 0005 1333', `${M}`],
  ['R1 — checksum faux + voisin intact', 'ES91 2100 0418 4502 0005 1333 EUR', `${M} EUR`],
  ['R3 — trop court pour GB -> non masqué', 'GB29 NWBK 6016 1331 9268 1', 'GB29 NWBK 6016 1331 9268 1'],
  ['R4 — pays inconnu -> non masqué (et signalé)', 'ZZ91 2100 0418 4502 0005 1332', 'ZZ91 2100 0418 4502 0005 1332'],
  ['R3 — jeton quelconque', 'ref ABCD1234EFGH5678IJKL9012 fin', 'ref ABCD1234EFGH5678IJKL9012 fin'],
  ['R3 — plus long que le pays', 'ES9121000418450200051332EXTRA', 'ES9121000418450200051332EXTRA'],
];

let failed = 0;

for (const [label, input, expected] of cases) {
  const got = mask(input);
  const ok = got === expected;

  if (!ok) {
    failed += 1;
  }

  console.log(`${ok ? 'OK  ' : 'ECHEC'}  ${label}`);
  console.log(`        in  ${JSON.stringify(input)}`);
  console.log(`        out ${JSON.stringify(got)}`);

  if (!ok) {
    console.log(`        att ${JSON.stringify(expected)}`);
  }
}

// R4 — le pays hors registre doit être SIGNALÉ, pas seulement laissé intact.
const { observations } = maskPiiInFiles([
  { path: 'a.csv', content: 'ZZ91 2100 0418 4502 0005 1332' },
]);
const signalled =
  observations.ibanUnknownCandidates.length === 1 &&
  observations.ibanUnknownCandidates[0].countryCode === 'ZZ' &&
  observations.ibanUnknownCandidates[0].decision === 'UNKNOWN_COUNTRY_CODE';

console.log(`${signalled ? 'OK  ' : 'ECHEC'}  R4 — code pays inconnu SIGNALÉ`);
console.log(`        unknownCandidates = ${JSON.stringify(observations.ibanUnknownCandidates)}`);

if (!signalled) {
  failed += 1;
}

console.log(`\n${cases.length + 1 - failed}/${cases.length + 1} cas conformes`);
process.exit(failed === 0 ? 0 : 1);
