import fs from 'node:fs/promises';
import path from 'node:path';

import { parse } from '@babel/parser';
import { franc } from 'franc-min';

export const SOLUTION_COPY_SOURCES = Object.freeze([
  Object.freeze({
    slug: 'app-builder',
    file: 'app/components/marketing/solutions/app-builder.copy.ts',
  }),
  Object.freeze({
    slug: 'website-builder',
    file: 'app/components/marketing/solutions/website-builder.copy.ts',
  }),
  Object.freeze({
    slug: 'game-builder',
    file: 'app/components/marketing/solutions/game-builder.copy.ts',
  }),
  Object.freeze({
    slug: 'dashboard-builder',
    file: 'app/components/marketing/solutions/dashboard-builder.copy.ts',
  }),
  Object.freeze({
    slug: 'chatbot-builder',
    file: 'app/components/marketing/solutions/chatbot-builder.copy.ts',
  }),
  Object.freeze({
    slug: 'internal-ai-builder',
    file: 'app/components/marketing/solutions/internal-ai-builder.copy.ts',
  }),
  Object.freeze({
    slug: 'startups',
    file: 'app/components/marketing/solutions/startups.copy.ts',
  }),
  Object.freeze({
    slug: 'freelancers',
    file: 'app/components/marketing/solutions/freelancers.copy.ts',
  }),
]);

/**
 * Exact EN/FR equality is normally evidence of an untranslated leaf. These
 * rules cover only values that are deliberately identical: self-named
 * languages, proper nouns, product names, technical terms, times, or genuine
 * French/English homographs.
 */
export const IDENTICAL_VALUE_ALLOWLIST = Object.freeze([
  Object.freeze({
    id: 'language-self-name',
    reason: "Language-switch choices use each language's self-name.",
    matches: ({ propertyPath }) =>
      propertyPath === 'languageSwitch.english' || propertyPath === 'languageSwitch.french',
  }),
  Object.freeze({
    id: 'clock-time',
    reason: 'Numeric 24-hour times are language-neutral.',
    matches: ({ value }) => /^\d{2}:\d{2}$/.test(value),
  }),
  Object.freeze({
    id: 'brand-or-proper-name',
    reason: 'Brands, fictional product names, people, customers, and place names must not be translated.',
    values: Object.freeze([
      'Atlas Logistics',
      'Beacon Retail Group',
      'HelpDesk Copilot',
      'Launchpad',
      'Marco',
      'Meridian Studio',
      'Nadia',
      'Northwind Traders',
      'Nouvelle-Aquitaine',
      'PeopleOps',
      'PipelineIQ',
      'Priya',
      'Studio Ferro',
      'TriviaClash',
    ]),
  }),
  Object.freeze({
    id: 'valid-french-homograph',
    reason: 'These spellings are valid French as well as English in their recorded UI context.',
    values: Object.freeze(['Clients', 'Contact', 'Documentation', 'Permissions', 'Public · 2024', 'Sources', 'Studio']),
  }),
  Object.freeze({
    id: 'accepted-business-term',
    reason: 'Pipeline is an established technical sales term and identifies the depicted product area.',
    values: Object.freeze(['Pipeline']),
  }),
  Object.freeze({
    id: 'technical-or-product-token',
    reason: 'These standalone product surfaces and source-code terms are explicitly kept unchanged.',
    values: Object.freeze(['Agent', 'Code', 'Git', 'Preview', 'React', 'TypeScript', 'Webview', 'commit']),
  }),
]);

/**
 * Allowed English-looking spans are removed before language analysis. This is
 * deliberately narrower than a general dictionary: every entry represents a
 * named offer, brand, source-code term, protocol, file format, or platform UI
 * name that the Solutions brief explicitly permits us to keep.
 */
export const TERM_ALLOWLIST = Object.freeze([
  Object.freeze({
    id: 'ecode-brand',
    reason: 'E-Code is the product brand.',
    pattern: /\bE-Code\b/giu,
  }),
  Object.freeze({
    id: 'solution-offer-name',
    reason: 'Solution offer names stay in English by product convention.',
    pattern:
      /\b(?:App Builder|Website Builder|Game Builder|Dashboard Builder|Chatbot Builder|Internal AI Builder|Startups|Freelancers)\b/giu,
  }),
  Object.freeze({
    id: 'ecode-ui-name',
    reason: 'Agent, Preview, and Webview are E-Code surface names.',
    pattern: /\b(?:Agent|Preview|Webview)\b/giu,
  }),
  Object.freeze({
    id: 'source-and-platform-term',
    reason: 'Programming languages, source-control names, runtimes, and common code artefacts remain untranslated.',
    pattern:
      /\b(?:React|TypeScript|JavaScript|Node\.js|GitHub|Git|commits?|code|frontend|backend|runtime|workspace|prompts?|builds?|diff|IDE|API|APIs|SDK|HTML|CSS|JSON|SQL|CSV|ZIP|PDF|CMS|SaaS|OAuth|WebSocket|PostgreSQL|MySQL|MongoDB|Redis|Docker|npm|pnpm)\b/giu,
  }),
  Object.freeze({
    id: 'established-french-tech-loanword',
    reason:
      'These product and digital terms are established in professional French or are required by the responsive brief.',
    pattern:
      /\b(?:apps?|back-office|chatbots?|cloud|cockpit|design|emails?|freelance(?:rs?)?|marketing|no-code|low-code|portfolio|quiz|responsive|startups?|web)\b/giu,
  }),
  Object.freeze({
    id: 'web-and-seo-term',
    reason: 'URLs, SEO names, metadata protocols, and standard web abbreviations remain unchanged.',
    pattern: /\b(?:URLs?|SEO|Open Graph|Twitter|HTTPS?|ARIA|WCAG|SSO|SAML|MFA|RBAC)\b/giu,
  }),
  Object.freeze({
    id: 'named-demo-entity',
    reason: 'Named fictional products, studios, people, customers, and places are proper nouns, not untranslated copy.',
    pattern:
      /\b(?:Meridian Studio|HelpDesk Copilot|PipelineIQ|TriviaClash|PeopleOps|Launchpad|Studio Ferro|Northwind Traders|Atlas Logistics|Beacon Retail Group|Nouvelle-Aquitaine|Nadia|Marco|Priya)\b/giu,
  }),
  Object.freeze({
    id: 'literal-url',
    reason: 'Literal URLs are language-neutral and must not be translated.',
    pattern: /https?:\/\/[^\s)\]}>,]+/giu,
  }),
  Object.freeze({
    id: 'source-path-or-file',
    reason: 'Source paths, package names, and filenames must stay byte-accurate.',
    pattern:
      /(?:^|[\s(\["'“])(?:\.?\/?(?:[\w@-]+\/)+[\w@.-]+|[\w-]+\.(?:tsx?|jsx?|mjs|cjs|json|css|html|md|env|zip))(?=$|[\s)\]"'”.,;:])/giu,
  }),
  Object.freeze({
    id: 'inline-code',
    reason: 'Backtick-delimited code and commands must remain byte-accurate.',
    pattern: /`[^`\r\n]+`/gu,
  }),
]);

/**
 * High-confidence English fragments. This is a negative list rather than a
 * bilingual dictionary so valid French cognates do not produce noise. Longer
 * prose is also checked by franc-min after allowlisted spans are removed.
 */
export const ENGLISH_MARKERS = Object.freeze([
  Object.freeze({
    id: 'english-function-word',
    pattern:
      /\b(?:the|your|you|with|without|from|into|through|while|where|which|what|this|that|these|those|each|every|inside|outside|beside|between|using)\b/giu,
  }),
  Object.freeze({
    id: 'english-action-or-state',
    pattern:
      /\b(?:become|becomes|click|clicking|clicked|deliver|delivery|failed|faster|keep|keeps|made|make|makes|open|opened|opens|ready|request|requested|review|reviewed|run|running|selected|show|showing|shows|start|starting|turn|turns|work|working)\b/giu,
  }),
  Object.freeze({
    id: 'unlocalized-product-copy',
    pattern:
      /\b(?:analytics|billing|demo day|desktop|feedback|fixtures?|handoff|help center|help desk|helpdesk|kickoff|laptop|live|lobby|mockups?|onboarding|offboarding|roadmap|slide deck|starter|workflow)\b/giu,
  }),
  Object.freeze({
    id: 'unlocalized-interface-copy',
    pattern:
      /\b(?:accounts?|browser|builder|buttons?|cards?|chatbot|coming soon|customers?|dark|dashboard|download|errors?|features?|footer|free|game|get started|header|learn more|light|links?|loading|log in|log out|projects?|read more|settings|sign in|sign up|status|success|team|theme|upload|views?|website)\b/giu,
  }),
]);

function unwrapExpression(node) {
  let current = node;

  while (
    current &&
    ['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'ParenthesizedExpression'].includes(current.type)
  ) {
    current = current.expression;
  }

  return current;
}

function propertyName(property) {
  if (property.computed) {
    throw new Error('Computed property keys are not supported in Solutions copy.');
  }

  if (property.key.type === 'Identifier' || property.key.type === 'StringLiteral') {
    return property.key.name ?? property.key.value;
  }

  throw new Error(`Unsupported Solutions copy property key: ${property.key.type}`);
}

function appendPath(parentPath, child) {
  return parentPath ? `${parentPath}.${child}` : child;
}

function collectStaticStrings(node, propertyPath, records, sourceFile) {
  const value = unwrapExpression(node);

  if (!value) {
    throw new Error(`Missing value at ${sourceFile}:${propertyPath}`);
  }

  if (value.type === 'StringLiteral') {
    records.push({
      propertyPath,
      value: value.value,
      line: value.loc?.start.line ?? 0,
      column: (value.loc?.start.column ?? -1) + 1,
    });
    return;
  }

  if (value.type === 'TemplateLiteral') {
    if (value.expressions.length > 0) {
      throw new Error(`Dynamic template literal at ${sourceFile}:${propertyPath}`);
    }

    records.push({
      propertyPath,
      value: value.quasis.map((part) => part.value.cooked ?? part.value.raw).join(''),
      line: value.loc?.start.line ?? 0,
      column: (value.loc?.start.column ?? -1) + 1,
    });

    return;
  }

  if (value.type === 'ObjectExpression') {
    for (const property of value.properties) {
      if (property.type !== 'ObjectProperty') {
        throw new Error(`Unsupported spread or method at ${sourceFile}:${propertyPath || '<locale-root>'}`);
      }

      const name = propertyName(property);
      collectStaticStrings(property.value, appendPath(propertyPath, name), records, sourceFile);
    }
    return;
  }

  if (value.type === 'ArrayExpression') {
    value.elements.forEach((element, index) => {
      if (!element || element.type === 'SpreadElement') {
        throw new Error(`Unsupported sparse or spread array at ${sourceFile}:${propertyPath}[${index}]`);
      }

      collectStaticStrings(element, `${propertyPath}[${index}]`, records, sourceFile);
    });
    return;
  }

  if (['BooleanLiteral', 'NullLiteral', 'NumericLiteral'].includes(value.type)) {
    return;
  }

  throw new Error(`Non-static Solutions copy value (${value.type}) at ${sourceFile}:${propertyPath}`);
}

function findLocaleRoot(ast, locale, sourceFile) {
  const candidates = [];

  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') {
      continue;
    }

    for (const declaration of statement.declaration.declarations) {
      const initializer = unwrapExpression(declaration.init);

      if (initializer?.type !== 'ObjectExpression') {
        continue;
      }

      const localeProperty = initializer.properties.find(
        (property) => property.type === 'ObjectProperty' && propertyName(property) === locale,
      );

      if (localeProperty?.type === 'ObjectProperty') {
        candidates.push(localeProperty.value);
      }
    }
  }

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one exported ${locale} copy object in ${sourceFile}; found ${candidates.length}.`,
    );
  }

  return candidates[0];
}

export function extractLocaleStrings({ source, sourceFile = '<inline>', locale }) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const records = [];
  collectStaticStrings(findLocaleRoot(ast, locale, sourceFile), '', records, sourceFile);

  return records;
}

function normalizeComparison(value) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('fr');
}

function matchingIdenticalRule(context) {
  return IDENTICAL_VALUE_ALLOWLIST.find((rule) => {
    if (rule.matches?.(context)) {
      return true;
    }

    return rule.values?.some((value) => normalizeComparison(value) === normalizeComparison(context.value));
  });
}

function replaceMatchesWithSpaces(value, pattern) {
  return value.replace(pattern, (match) => ' '.repeat(match.length));
}

function shieldAllowedTerms(value, usageByRule) {
  let cleaned = value;

  for (const rule of TERM_ALLOWLIST) {
    rule.pattern.lastIndex = 0;

    const matches = [...cleaned.matchAll(rule.pattern)];
    usageByRule.set(rule.id, (usageByRule.get(rule.id) ?? 0) + matches.length);
    rule.pattern.lastIndex = 0;
    cleaned = replaceMatchesWithSpaces(cleaned, rule.pattern);
  }

  return cleaned;
}

function markerFindings(cleaned) {
  const findings = [];

  for (const marker of ENGLISH_MARKERS) {
    marker.pattern.lastIndex = 0;

    for (const match of cleaned.matchAll(marker.pattern)) {
      findings.push({ rule: marker.id, match: match[0], offset: match.index ?? 0 });
    }
  }

  return findings;
}

function looksLikeEnglishProse(cleaned) {
  const words = cleaned.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)?/gu) ?? [];

  if (words.length < 7 || cleaned.trim().length < 40) {
    return false;
  }

  return franc(cleaned, { minLength: 40 }) === 'eng';
}

function buildFinding({ record, slug, file, category, rule, match }) {
  return {
    slug,
    file,
    line: record.line,
    column: record.column,
    path: record.propertyPath,
    category,
    rule,
    match,
    value: record.value,
  };
}

export function scanLocalePair({ slug, file, englishRecords, frenchRecords }) {
  const englishByPath = new Map(englishRecords.map((record) => [record.propertyPath, record]));
  const frenchByPath = new Map(frenchRecords.map((record) => [record.propertyPath, record]));
  const missingInFrench = [...englishByPath.keys()].filter((propertyPath) => !frenchByPath.has(propertyPath));
  const extraInFrench = [...frenchByPath.keys()].filter((propertyPath) => !englishByPath.has(propertyPath));

  if (missingInFrench.length > 0 || extraInFrench.length > 0) {
    throw new Error(
      `EN/FR structure mismatch in ${file}: missing FR [${missingInFrench.join(', ')}], extra FR [${extraInFrench.join(', ')}].`,
    );
  }

  const findings = [];
  const allowedIdentical = [];
  const termUsage = new Map(TERM_ALLOWLIST.map((rule) => [rule.id, 0]));

  for (const record of frenchRecords) {
    const english = englishByPath.get(record.propertyPath);
    const identical = normalizeComparison(english.value) === normalizeComparison(record.value);

    if (identical) {
      const allowedRule = matchingIdenticalRule({
        slug,
        file,
        propertyPath: record.propertyPath,
        value: record.value,
      });

      if (allowedRule) {
        allowedIdentical.push({
          slug,
          file,
          line: record.line,
          path: record.propertyPath,
          value: record.value,
          rule: allowedRule.id,
          reason: allowedRule.reason,
        });
      } else {
        findings.push(
          buildFinding({
            record,
            slug,
            file,
            category: 'identical-to-en',
            rule: 'unapproved-identical-value',
            match: record.value,
          }),
        );
      }

      // The exact-equality result is more precise than token-level duplicates.
      continue;
    }

    const cleaned = shieldAllowedTerms(record.value, termUsage);

    for (const marker of markerFindings(cleaned)) {
      findings.push(
        buildFinding({
          record,
          slug,
          file,
          category: 'english-marker',
          rule: marker.rule,
          match: marker.match,
        }),
      );
    }

    if (looksLikeEnglishProse(cleaned)) {
      findings.push(
        buildFinding({
          record,
          slug,
          file,
          category: 'english-prose',
          rule: 'franc-min-english',
          match: cleaned.trim(),
        }),
      );
    }
  }

  return { findings, allowedIdentical, termUsage };
}

function sortFindings(findings) {
  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.category.localeCompare(right.category) ||
      left.match.localeCompare(right.match),
  );
}

export async function auditSolutionsFrench({ rootDirectory = process.cwd(), readFile = fs.readFile } = {}) {
  const findings = [];
  const allowedIdentical = [];
  const termUsage = new Map(TERM_ALLOWLIST.map((rule) => [rule.id, 0]));

  let englishStrings = 0;
  let frenchStrings = 0;

  for (const sourceEntry of SOLUTION_COPY_SOURCES) {
    const absoluteFile = path.resolve(rootDirectory, sourceEntry.file);
    const source = await readFile(absoluteFile, 'utf8');
    const englishRecords = extractLocaleStrings({ source, sourceFile: sourceEntry.file, locale: 'en' });
    const frenchRecords = extractLocaleStrings({ source, sourceFile: sourceEntry.file, locale: 'fr' });

    const scan = scanLocalePair({
      slug: sourceEntry.slug,
      file: sourceEntry.file,
      englishRecords,
      frenchRecords,
    });

    englishStrings += englishRecords.length;
    frenchStrings += frenchRecords.length;
    findings.push(...scan.findings);
    allowedIdentical.push(...scan.allowedIdentical);

    for (const [rule, count] of scan.termUsage) {
      termUsage.set(rule, (termUsage.get(rule) ?? 0) + count);
    }
  }

  sortFindings(findings);
  allowedIdentical.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.path.localeCompare(right.path),
  );

  return {
    schemaVersion: 1,
    status: findings.length === 0 ? 'pass' : 'fail',
    scope: {
      slugs: SOLUTION_COPY_SOURCES.map(({ slug }) => slug),
      files: SOLUTION_COPY_SOURCES.map(({ file }) => file),
      excluded: ['enterprise'],
    },
    summary: {
      filesScanned: SOLUTION_COPY_SOURCES.length,
      englishStrings,
      frenchStrings,
      findings: findings.length,
      allowedIdentical: allowedIdentical.length,
      allowlistedTermOccurrences: [...termUsage.values()].reduce((total, count) => total + count, 0),
    },
    findings,
    allowedIdentical,
    allowlist: {
      identicalRules: IDENTICAL_VALUE_ALLOWLIST.map((rule) => ({
        id: rule.id,
        reason: rule.reason,
        uses: allowedIdentical.filter((entry) => entry.rule === rule.id).length,
      })),
      termRules: TERM_ALLOWLIST.map((rule) => ({
        id: rule.id,
        reason: rule.reason,
        uses: termUsage.get(rule.id) ?? 0,
      })),
    },
  };
}

export function formatSolutionsFrenchAudit(report) {
  const lines = [
    `Solutions FR residual audit: ${report.status.toUpperCase()}`,
    `Scope: ${report.summary.filesScanned} files / ${report.summary.frenchStrings} FR strings / Enterprise excluded`,
    `Findings: ${report.summary.findings}; allowed identical EN/FR values: ${report.summary.allowedIdentical}; allowlisted term occurrences: ${report.summary.allowlistedTermOccurrences}`,
  ];

  for (const finding of report.findings) {
    lines.push(
      `${finding.file}:${finding.line}:${finding.column} [${finding.slug}] ${finding.path} — ${finding.category}/${finding.rule}: ${JSON.stringify(finding.match)}`,
      `  ${finding.value}`,
    );
  }

  return `${lines.join('\n')}\n`;
}
