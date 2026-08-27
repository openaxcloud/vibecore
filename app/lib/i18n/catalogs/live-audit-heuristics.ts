export type AuditSemanticEntry = Readonly<{
  kind: string;
  text: string;
  locator: string;
  semanticKey?: string;
}>;

export type AuditFinding = AuditSemanticEntry &
  Readonly<{ reason: 'english-match' | 'english-signal' | 'forbidden-term' | 'raw-key' }>;

const APPROVED_EXACT = new Set(
  [
    'E-Code',
    'VibeCore',
    'AI',
    'API',
    'AWS',
    'Azure',
    'BYOK',
    'Cloudflare',
    'Docker',
    'Figma',
    'Git',
    'GitHub',
    'GitLab',
    'Google',
    'GraphQL',
    'HTTP',
    'HTTPS',
    'IDE',
    'JSON',
    'Kubernetes',
    'MCP',
    'MongoDB',
    'Netlify',
    'OAuth',
    'Open Graph',
    'OpenAI',
    'PostgreSQL',
    'Redis',
    'SAML',
    'SCIM',
    'SOC 2',
    'SQL',
    'SSO',
    'Supabase',
    'Terminal',
    'TypeScript',
    'URL',
    'UTC',
    'Vercel',
    'WebSocket',
    'X',
    'YAML',
    'commit',
    'cron',
    'npm',
    'pnpm',
    'yarn',
    'Agent',
    'Application',
    'Configuration',
    'Console',
    'Extension',
    'Interface',
    'Notification',
    'Session',
    'Support',
    'Version',
  ].map((value) => value.toLocaleLowerCase('en')),
);

/* Official offer names keep their product casing in every locale. */
const COMMERCIAL_OFFER_NAMES = new Set(['Starter', 'Core', 'Pro', 'Enterprise', 'Team']);
const COMMERCIAL_OFFER_NAME = /\b(?:Starter|Core|Pro|Enterprise|Team)\b/gu;

const COMMERCIAL_OFFER_LIST =
  /\b(?:Starter|Core|Pro|Enterprise|Team)(?:\s*(?:\/|,|\bet\b|\bou\b)\s*(?:Starter|Core|Pro|Enterprise|Team))+\b/gu;

const COMMERCIAL_OFFER_WITH_LABEL =
  /\b(?:abonnements?|formules?|forfaits?|offres?)\s+(?:Starter|Core|Pro|Enterprise|Team)\b/gu;

const COMMERCIAL_OFFER_HEADING = /^(?:Starter|Core|Pro|Enterprise|Team)(?=\s*(?:[—:|·-]|$))/u;

/*
 * Short all-caps labels normally look like technical constants. QA is the
 * exception: on a French product surface it is visible copy and must be
 * rendered as "assurance qualité". Longer identifiers such as QA_MODE remain
 * covered by the technical-identifier exclusions below.
 */
const FORBIDDEN_VISIBLE_EXACT = new Set(['qa']);

const TECHNICAL_FILENAME =
  /^[\w@.+~-]+\.(?:bash|c|cc|cjs|cpp|css|env|go|h|hpp|html?|java|json|jsx?|kts?|lock|mdx?|mjs|py|rb|rs|scss|sh|sql|swift|toml|tsx?|txt|xml|ya?ml)$/iu;
const TECHNICAL_FILENAME_IN_PROSE =
  /\b[\w@.+~-]+\.(?:bash|c|cc|cjs|cpp|css|env|go|h|hpp|html?|java|json|jsx?|kts?|lock|mdx?|mjs|py|rb|rs|scss|sh|sql|swift|toml|tsx?|txt|xml|ya?ml)\b/giu;

const TECHNICAL_PATH_IN_PROSE = /\b(?:[\w@.+~-]+\/)+[\w@.+~-]+(?:\.[A-Za-z0-9]+)?\b/gu;

const SLASH_COMMAND_IN_PROSE = /(^|[\s(])\/[a-z][\w-]*/giu;
const APPROVED_PRODUCT_TERM_IN_PROSE = /\bCloud Monitoring\b/gu;
const FRENCH_QUEUE_IN_PROSE = /\bfile\s+d[’']attente\b/giu;

/*
 * These words have an explicit French rendering in the normative glossary.
 * They are intentionally independent from the language score: a sentence can
 * be grammatically French and still violate the product terminology contract.
 */
/*
 * `\b` se définit sur `[A-Za-z0-9_]` : une lettre accentuée n'est donc PAS un
 * caractère de mot, et `\bbranch\b` accepterait « branché », `\btag\b` « taggé ».
 * Les bornes ci-dessous refusent toute lettre adjacente, accents compris, pour
 * ne signaler que le terme anglais isolé et jamais un dérivé français.
 */
const FORBIDDEN_FRENCH_TERM =
  /(?<![\p{L}\p{N}_])(?:accounts?|activities|activity|alerts?|apps?|backends?|billing|branch|builds?|changelog|code[ -]reviews?|collaborators?|command palettes?|dashboards?|databases?|deployments?|docs|editors?|environment variables?|feature flags?|features?|files?|folders?|forks?|frontends?|full-stack|histories|history|invoices?|issues?|loading|logs?|marketplace|members?|monitorings?|onboarding|organizations?|packages?|permissions?|previews?|pricing|problems?|projects?|providers?|qa|quality assurance|responsives?|roles?|roll[ -]?backs?|runtimes?|settings|snapshots?|stacks?|starters?|storage|streamings?|subscriptions?|tags?|teams?|templates?|tokens?|typechecks?|workflows?|workspaces?)(?![\p{L}\p{N}_])/iu;

const ENGLISH_GRAMMAR = new Set([
  'and',
  'are',
  'can',
  'for',
  'from',
  'has',
  'have',
  'into',
  'is',
  'our',
  'should',
  'that',
  'the',
  'their',
  'these',
  'this',
  'those',
  'was',
  'were',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

const ENGLISH_UI_PHRASE =
  /\b(?:failed to|get started|learn more|log in|no results|sign in|try again)\b|^(?:add|back|cancel|close|continue|create|delete|edit|next|open|previous|remove|save|search|view)(?:\s|$)/iu;

const RAW_KEY = /^(?:[a-z][a-z0-9_-]*\.)+[a-z][a-z0-9_-]*$/u;

function semanticIdentity(entry: AuditSemanticEntry): string {
  return `${entry.kind}\0${entry.semanticKey ?? entry.locator}`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripCommercialOfferNames(text: string): string {
  if (/\b(?:abonnements?|crédits?|facturation|formules?|forfaits?|offres?|tarifs?)\b|€/iu.test(text)) {
    return text.replace(COMMERCIAL_OFFER_NAME, '');
  }

  return text
    .replace(COMMERCIAL_OFFER_LIST, (match) => match.replace(COMMERCIAL_OFFER_NAME, ''))
    .replace(COMMERCIAL_OFFER_WITH_LABEL, (match) => match.replace(COMMERCIAL_OFFER_NAME, ''))
    .replace(COMMERCIAL_OFFER_HEADING, '');
}

export function isApprovedAuditText(text: string): boolean {
  const normalized = normalize(text);

  if (!normalized || !/[A-Za-zÀ-ÿ]/u.test(normalized)) {
    return true;
  }

  if (FORBIDDEN_VISIBLE_EXACT.has(normalized.toLocaleLowerCase('en'))) {
    return false;
  }

  if (
    /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|\/|\.\/|\.\.\/)/iu.test(normalized) ||
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/u.test(normalized) ||
    /^(?:[a-z0-9-]+\.)+(?:ai|com|dev|example|fr|io|local|net|org|test)$/iu.test(normalized) ||
    /^[a-z0-9]+(?:-[a-z0-9]+)+$/iu.test(normalized) ||
    TECHNICAL_FILENAME.test(normalized) ||
    /^(?:[A-Z][A-Z0-9_]*|--?[a-z][\w-]*)(?:[=:\s].*)?$/u.test(normalized) ||
    /^(?:[\w@.+~-]+\/)+[\w@.+~-]+(?:\.[A-Za-z0-9]+)?$/u.test(normalized)
  ) {
    return true;
  }

  return COMMERCIAL_OFFER_NAMES.has(normalized) || APPROVED_EXACT.has(normalized.toLocaleLowerCase('en'));
}

function englishGrammarScore(text: string): number {
  const words = text.toLocaleLowerCase('en').match(/[a-z]+(?:'[a-z]+)?/gu) ?? [];

  return words.reduce((score, word) => score + Number(ENGLISH_GRAMMAR.has(word)), 0);
}

export function findFrenchAuditResidue(
  english: readonly AuditSemanticEntry[],
  french: readonly AuditSemanticEntry[],
): AuditFinding[] {
  const englishByIdentity = new Map(english.map((entry) => [semanticIdentity(entry), normalize(entry.text)]));
  const seen = new Set<string>();
  const findings: AuditFinding[] = [];

  for (const entry of french) {
    const text = normalize(entry.text);

    if (isApprovedAuditText(text)) {
      continue;
    }

    const englishAtSameLocation = englishByIdentity.get(semanticIdentity(entry));
    const sameAtSameLocation = englishAtSameLocation === text;
    const grammarScore = englishGrammarScore(text);

    const terminologyText = stripCommercialOfferNames(text)
      .replace(TECHNICAL_PATH_IN_PROSE, '')
      .replace(TECHNICAL_FILENAME_IN_PROSE, '')
      .replace(SLASH_COMMAND_IN_PROSE, '$1')
      .replace(APPROVED_PRODUCT_TERM_IN_PROSE, '')
      .replace(FRENCH_QUEUE_IN_PROSE, '');

    const reason = RAW_KEY.test(text)
      ? 'raw-key'
      : FORBIDDEN_FRENCH_TERM.test(terminologyText)
        ? 'forbidden-term'
        : ENGLISH_UI_PHRASE.test(text) || grammarScore >= 2 || (sameAtSameLocation && grammarScore >= 1)
          ? sameAtSameLocation
            ? 'english-match'
            : 'english-signal'
          : undefined;

    if (!reason) {
      continue;
    }

    const fingerprint = `${semanticIdentity(entry)}\0${text}\0${reason}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      findings.push({ ...entry, text, reason });
    }
  }

  return findings;
}
