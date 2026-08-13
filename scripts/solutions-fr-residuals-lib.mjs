import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Enterprise is deliberately included; App Builder is the finished reference. */
export const SOLUTION_COPY_SOURCES = Object.freeze([
  ['solutions-index', 'app/lib/i18n/catalogs/solutions-index-cards.ts'],
  ['website-builder', 'app/components/marketing/solutions/website-builder.copy.ts'],
  ['game-builder', 'app/components/marketing/solutions/game-builder.copy.ts'],
  ['dashboard-builder', 'app/components/marketing/solutions/dashboard-builder.copy.ts'],
  ['chatbot-builder', 'app/components/marketing/solutions/chatbot-builder.copy.ts'],
  ['internal-ai-builder', 'app/components/marketing/solutions/internal-ai-builder.copy.ts'],
  ['enterprise', 'app/components/marketing/solutions/enterprise.copy.ts'],
  ['startups', 'app/components/marketing/solutions/startups.copy.ts'],
  ['freelancers', 'app/components/marketing/solutions/freelancers.copy.ts'],
]);

/**
 * Exact product/technical strings that are intentionally not translated.
 * Every entry carries its audit justification; there is no blanket ignore.
 */
export const FR_RESIDUAL_ALLOWLIST = Object.freeze([
  { value: 'E-Code', reason: 'Product brand.' },
  { value: 'App Builder', reason: 'Published E-Code offer name.' },
  { value: 'Website Builder', reason: 'Published E-Code offer name.' },
  { value: 'Game Builder', reason: 'Published E-Code offer name.' },
  { value: 'Dashboard Builder', reason: 'Published E-Code offer name.' },
  { value: 'Chatbot Builder', reason: 'Published E-Code offer name.' },
  { value: 'Internal AI Builder', reason: 'Published E-Code offer name.' },
  { value: 'Enterprise', reason: 'Published E-Code offer name.' },
  { value: 'Startups', reason: 'Published E-Code offer name.' },
  { value: 'Freelancers', reason: 'Published E-Code offer name.' },
  { value: 'Git', reason: 'Technical product term.' },
  { value: 'GitHub', reason: 'Established developer-platform brand.' },
  { value: 'API', reason: 'Technical initialism.' },
  { value: 'CMS', reason: 'Technical initialism.' },
  { value: 'IDE', reason: 'Technical initialism.' },
  { value: 'Open Graph', reason: 'Protocol name.' },
  { value: 'Preview', reason: 'E-Code product surface name.' },
  { value: 'React', reason: 'Framework name.' },
  { value: 'SEO', reason: 'Industry initialism.' },
  { value: 'Webview', reason: 'E-Code product surface name.' },
  { value: 'Studio', reason: 'Correct French noun, spelled identically in English.' },
  { value: 'Contact', reason: 'Correct French noun, spelled identically in English.' },
  { value: 'Public · 2024', reason: 'Correct French adjective followed by a year.' },
  { value: 'Nouvelle-Aquitaine', reason: 'French geographic proper name.' },
  { value: 'Meridian Studio', reason: 'Fictional demonstration brand, not customer proof.' },
  { value: 'TriviaClash', reason: 'Fictional demonstration brand, not customer proof.' },
  { value: 'Nadia', reason: 'Person name in explicitly fictional demonstration data.' },
  { value: 'Marco', reason: 'Person name in explicitly fictional demonstration data.' },
  { value: 'Priya', reason: 'Person name in explicitly fictional demonstration data.' },
  { value: 'PipelineIQ', reason: 'Fictional demonstration brand, not customer proof.' },
  { value: 'Pipeline', reason: 'Established French business/technical term.' },
  { value: 'Northwind Traders', reason: 'Fictional demonstration organization name.' },
  { value: 'Atlas Logistics', reason: 'Fictional demonstration organization name.' },
  { value: 'Beacon Retail Group', reason: 'Fictional demonstration organization name.' },
  { value: 'HelpDesk Copilot', reason: 'Fictional demonstration product name.' },
  { value: 'Sources', reason: 'Correct French plural noun, spelled identically in English.' },
  { value: 'Documents', reason: 'Correct French plural noun, spelled identically in English.' },
  { value: 'PeopleOps Assistant', reason: 'Fictional demonstration product name.' },
  { value: 'PeopleOps', reason: 'Fictional demonstration brand, not customer proof.' },
  { value: 'Audit', reason: 'Correct French technical noun, spelled identically in English.' },
  { value: 'A. Laurent · Support', reason: 'Fictional person and department label; Support is valid French.' },
  { value: 'S. Moreau · Finance', reason: 'Fictional person and department label; Finance is valid French.' },
  { value: 'Northwind Platform', reason: 'Fictional demonstration product name.' },
  { value: 'Northwind Control', reason: 'Fictional demonstration brand, not customer proof.' },
  { value: 'admin · 12:04', reason: 'Technical role identifier and timestamp.' },
  { value: 'SSO', reason: 'Technical identity initialism.' },
  { value: 'scim-sync · 11:47', reason: 'Technical process identifier and timestamp.' },
  { value: 'release-owner · 11:20', reason: 'Technical role identifier and timestamp.' },
  { value: 'SCIM', reason: 'Technical identity standard initialism.' },
  { value: 'Runtime', reason: 'Technical product term.' },
  { value: 'Launchpad', reason: 'Fictional demonstration product name.' },
  { value: 'Traction', reason: 'Correct French business noun, spelled identically in English.' },
  { value: 'Studio Ferro', reason: 'Fictional demonstration brand name.' },
  { value: 'Source', reason: 'Correct French technical noun, spelled identically in English.' },
  { value: 'Docs', reason: 'Technical abbreviation commonly retained in French.' },
]);

const ENGLISH_MARKERS = new Set([
  'after',
  'and',
  'before',
  'build',
  'choose',
  'create',
  'does',
  'from',
  'how',
  'into',
  'is',
  'not',
  'open',
  'page',
  'real',
  'see',
  'start',
  'that',
  'the',
  'this',
  'those',
  'to',
  'what',
  'when',
  'where',
  'with',
  'without',
  'you',
  'your',
]);

const FRENCH_MARKERS = new Set([
  'avec',
  'ce',
  'cette',
  'dans',
  'de',
  'des',
  'du',
  'elle',
  'en',
  'et',
  'la',
  'le',
  'les',
  'pour',
  'que',
  'qui',
  'sans',
  'sur',
  'un',
  'une',
  'vos',
  'votre',
  'vous',
]);

const ENGLISH_ONLY_UI_WORDS = new Set([
  'back',
  'cancel',
  'close',
  'completed',
  'connected',
  'continue',
  'delivered',
  'download',
  'edit',
  'enabled',
  'error',
  'exported',
  'featured',
  'high',
  'home',
  'included',
  'loading',
  'low',
  'new',
  'next',
  'open',
  'pending',
  'published',
  'request',
  'running',
  'saved',
  'send',
  'settings',
  'shared',
  'success',
  'view',
  'working',
]);

function decodeEscape(source, index, quote) {
  const escaped = source[index + 1];
  const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

  if (escaped in simple) {
    return { value: simple[escaped], next: index + 2 };
  }

  if (escaped === quote || escaped === '\\' || escaped === '`') {
    return { value: escaped, next: index + 2 };
  }

  if (escaped === 'u') {
    const code = source.slice(index + 2, index + 6);

    if (/^[\da-f]{4}$/i.test(code)) {
      return { value: String.fromCodePoint(Number.parseInt(code, 16)), next: index + 6 };
    }
  }

  return { value: escaped ?? '', next: index + 2 };
}

/** Parses the data-only object literal exported by a solution copy module. */
export function parseSolutionCopySource(source, file = '<source>') {
  const assignment = source.indexOf('export const ');
  const objectStart = assignment < 0 ? -1 : source.indexOf('{', assignment);

  if (objectStart < 0) {
    throw new Error(`${file}: exported solution catalogue object was not found`);
  }

  let index = objectStart;

  function fail(message) {
    const line = source.slice(0, index).split('\n').length;
    throw new Error(`${file}:${line}: ${message}`);
  }

  function skipTrivia() {
    while (index < source.length) {
      if (/\s/.test(source[index])) {
        index += 1;
        continue;
      }

      if (source.startsWith('//', index)) {
        index = source.indexOf('\n', index + 2);
        index = index < 0 ? source.length : index + 1;
        continue;
      }

      if (source.startsWith('/*', index)) {
        const end = source.indexOf('*/', index + 2);
        index = end < 0 ? source.length : end + 2;
        continue;
      }

      break;
    }
  }

  function parseString() {
    const quote = source[index];

    let value = '';
    index += 1;

    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') {
        const decoded = decodeEscape(source, index, quote);
        value += decoded.value;
        index = decoded.next;
        continue;
      }

      if (quote === '`' && source.startsWith('${', index)) {
        fail('template interpolation is not allowed in a static solution catalogue');
      }

      value += source[index];
      index += 1;
    }

    if (source[index] !== quote) {
      fail('unterminated string');
    }

    index += 1;

    return value;
  }

  function parseIdentifier() {
    const match = /^[A-Za-z_$][\w$-]*/.exec(source.slice(index));

    if (!match) {
      fail(`expected an object key, got ${JSON.stringify(source.slice(index, index + 12))}`);
    }

    index += match[0].length;

    return match[0];
  }

  function parseArray() {
    const values = [];
    index += 1;
    skipTrivia();

    while (source[index] !== ']') {
      values.push(parseValue());
      skipTrivia();

      if (source[index] === ',') {
        index += 1;
        skipTrivia();
      } else if (source[index] !== ']') {
        fail('expected a comma or closing bracket');
      }
    }

    index += 1;

    return values;
  }

  function parseObject() {
    const value = {};
    index += 1;
    skipTrivia();

    while (source[index] !== '}') {
      const key = source[index] === "'" || source[index] === '"' ? parseString() : parseIdentifier();
      skipTrivia();

      if (source[index] !== ':') {
        fail('expected a colon after the object key');
      }

      index += 1;
      value[key] = parseValue();
      skipTrivia();

      if (source[index] === ',') {
        index += 1;
        skipTrivia();
      } else if (source[index] !== '}') {
        fail('expected a comma or closing brace');
      }
    }

    index += 1;

    return value;
  }

  function parseValue() {
    skipTrivia();

    const character = source[index];

    if (character === '{') {
      return parseObject();
    }

    if (character === '[') {
      return parseArray();
    }

    if (character === "'" || character === '"' || character === '`') {
      return parseString();
    }

    return fail('solution catalogue values must be static strings, arrays, or objects');
  }

  const result = parseObject();

  if (!result.en || !result.fr) {
    fail('catalogue must contain both en and fr roots');
  }

  return result;
}

export function flattenStrings(value, prefix = '', output = new Map()) {
  if (typeof value === 'string') {
    output.set(prefix, value);
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenStrings(entry, prefix ? `${prefix}.${index}` : `${index}`, output));
    return output;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      flattenStrings(entry, prefix ? `${prefix}.${key}` : key, output);
    }
  }

  return output;
}

function normalizedWords(value) {
  return (
    value
      .normalize('NFKC')
      .toLocaleLowerCase('fr')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function isAllowedValue(value, allowlist) {
  const normalized = value.trim();
  const exact = allowlist.find((entry) => entry.value === normalized);

  if (exact) {
    return exact;
  }

  // Names, versions, dates and technical labels contain no prose to translate.
  if (/^(?:[\d.,+%€$:/#-]+|T\d|Q\d|v\d+)$/i.test(normalized)) {
    return { value: normalized, reason: 'Non-linguistic numeric/version label.' };
  }

  return undefined;
}

export function looksLikeEnglishProse(value) {
  const words = normalizedWords(value);

  if (words.length === 0) {
    return false;
  }

  if (words.length === 1) {
    return ENGLISH_ONLY_UI_WORDS.has(words[0]);
  }

  const english = words.filter((word) => ENGLISH_MARKERS.has(word)).length;
  const englishOnly = words.filter((word) => ENGLISH_ONLY_UI_WORDS.has(word)).length;
  const french = words.filter((word) => FRENCH_MARKERS.has(word)).length;

  return (english >= 2 && english > french * 2) || (englishOnly >= 1 && french === 0);
}

export function auditSolutionCatalogue({ slug, file, catalogue, allowlist = FR_RESIDUAL_ALLOWLIST }) {
  const english = flattenStrings(catalogue.en);
  const french = flattenStrings(catalogue.fr);
  const findings = [];
  const allowed = [];

  for (const [leafPath, englishValue] of english) {
    const frenchValue = french.get(leafPath);

    if (typeof frenchValue !== 'string' || frenchValue.trim().length === 0) {
      findings.push({ slug, file, path: leafPath, kind: 'missing-fr', value: frenchValue ?? '' });
      continue;
    }

    const allowance = isAllowedValue(frenchValue, allowlist);

    if (allowance) {
      allowed.push({ slug, file, path: leafPath, value: frenchValue, reason: allowance.reason });
      continue;
    }

    if (frenchValue.trim().normalize('NFKC') === englishValue.trim().normalize('NFKC')) {
      findings.push({ slug, file, path: leafPath, kind: 'identical-en-fr', value: frenchValue });
      continue;
    }

    if (looksLikeEnglishProse(frenchValue)) {
      findings.push({ slug, file, path: leafPath, kind: 'english-prose', value: frenchValue });
    }
  }

  for (const [leafPath, frenchValue] of french) {
    if (!english.has(leafPath)) {
      findings.push({ slug, file, path: leafPath, kind: 'missing-en-contract', value: frenchValue });
    }
  }

  return {
    slug,
    file,
    englishStrings: english.size,
    frenchStrings: french.size,
    translatedPercent: english.size === 0 ? 100 : ((english.size - findings.length) / english.size) * 100,
    findings,
    allowed,
  };
}

export function auditSolutionFiles(rootDirectory = process.cwd()) {
  const pages = SOLUTION_COPY_SOURCES.map(([slug, relativeFile]) => {
    const absoluteFile = path.resolve(rootDirectory, relativeFile);
    const source = readFileSync(absoluteFile, 'utf8');
    const catalogue = parseSolutionCopySource(source, relativeFile);

    return auditSolutionCatalogue({ slug, file: relativeFile, catalogue });
  });

  const findings = pages.flatMap((page) => page.findings);

  return {
    pages,
    findings,
    summary: {
      pages: pages.length,
      englishStrings: pages.reduce((total, page) => total + page.englishStrings, 0),
      frenchStrings: pages.reduce((total, page) => total + page.frenchStrings, 0),
      findings: findings.length,
      translatedPercent:
        pages.reduce((total, page) => total + page.englishStrings, 0) === 0
          ? 100
          : ((pages.reduce((total, page) => total + page.englishStrings, 0) - findings.length) /
              pages.reduce((total, page) => total + page.englishStrings, 0)) *
            100,
    },
  };
}
