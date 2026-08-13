import type { Frame, FrameLocator, Locator, Page } from '@playwright/test';

export const GENERATED_FR_SOLUTION_SLUGS = [
  'app-builder',
  'website-builder',
  'game-builder',
  'dashboard-builder',
  'chatbot-builder',
  'internal-ai-builder',
  'startups',
  'freelancers',
  'enterprise',
] as const;

export type GeneratedFrSolutionSlug = (typeof GENERATED_FR_SOLUTION_SLUGS)[number];
export type GeneratedFrSurfacePhase = 'base' | 'overview' | 'interaction';

export type GeneratedFrSurfaceSource =
  | 'alt'
  | 'aria-description'
  | 'aria-describedby'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-valuetext'
  | 'document-title'
  | 'input-value'
  | 'placeholder'
  | 'text'
  | 'title';

export type GeneratedFrSurfaceEntry = Readonly<{
  selector: string;
  source: GeneratedFrSurfaceSource;
  value: string;
}>;

export type GeneratedFrSurfaceCollection = Readonly<{
  documentLanguage: string;
  entries: readonly GeneratedFrSurfaceEntry[];
  rootSelector: string;
}>;

export type GeneratedFrScenarioContract = Readonly<{
  forbidden: readonly string[];
  required: readonly string[];
  requiredByPhase: Readonly<Record<Exclude<GeneratedFrSurfacePhase, 'base'>, readonly string[]>>;
}>;

/**
 * Exact product names and technical vocabulary which stay unchanged in French.
 *
 * Matching is deliberately case-sensitive and token-delimited. An allowlisted
 * term is removed before the English lexicon is applied; the rest of its
 * surrounding sentence is still audited.
 */
export const GENERATED_FR_EXACT_ALLOWLIST = [
  'E-Code',
  'SalonFlow',
  'Meridian Studio',
  'TriviaClash',
  'PipelineIQ',
  'HelpDesk Copilot',
  'PeopleOps',
  'Launchpad',
  'Studio Ferro',
  'Northwind Control',
  'React',
  'TypeScript',
  'JavaScript',
  'HTML',
  'CSS',
  'Tailwind CSS',
  'Node.js',
  'Vite',
  'Webview',
  'WebSocket',
  'Git',
  'GitHub',
  'npm',
  'pnpm',
  'commit',
  'commits',
  'API',
  'URL',
  'JSON',
  'CSV',
  'SQL',
  'PDF',
  'SaaS',
  'CRM',
  'KPI',
  'LLM',
  'RAG',
  'SSO',
  'SCIM',
  'OAuth',
  'OpenID Connect',
  'backend',
  'frontend',
  'runtime',
  'typecheck',
  'localStorage',
] as const;

export const GENERATED_FR_SCENARIO_CONTRACTS = {
  'app-builder': {
    forbidden: ['Fictional local demo', 'Appointments', 'Upcoming appointments'],
    required: ['SalonFlow', 'Démo locale fictive'],
    requiredByPhase: {
      interaction: ['Prochains rendez-vous'],
      overview: ['Rendez-vous'],
    },
  },
  'website-builder': {
    forbidden: ['Fictional local demo', 'Projects', 'Selected work'],
    required: ['Meridian Studio', 'Démo locale fictive'],
    requiredByPhase: {
      interaction: ['Projets sélectionnés'],
      overview: ['Projets'],
    },
  },
  'game-builder': {
    forbidden: ['Start quiz', 'Leaderboard', 'No network multiplayer backend'],
    required: ['TriviaClash'],
    requiredByPhase: {
      interaction: ['Question 1'],
      overview: ['Démarrer le quiz'],
    },
  },
  'dashboard-builder': {
    forbidden: ['Local sample dataset', 'Apply filters', 'Filters applied', 'Revenue'],
    required: ['PipelineIQ', 'Données locales'],
    requiredByPhase: {
      interaction: ['Filtres appliqués'],
      overview: ['Appliquer les filtres'],
    },
  },
  'chatbot-builder': {
    forbidden: ['How do I reset my password?', 'Account access'],
    required: ['HelpDesk Copilot'],
    requiredByPhase: {
      interaction: ['Accès au compte'],
      overview: ['Comment réinitialiser mon mot de passe ?'],
    },
  },
  'internal-ai-builder': {
    forbidden: ['Annual leave policy', 'HR-04'],
    required: ['PeopleOps'],
    requiredByPhase: {
      interaction: ['RH-04'],
      overview: ['Politique de congés annuels'],
    },
  },
  startups: {
    forbidden: ['Add experiment', 'New experiment', 'Experiments'],
    required: ['Launchpad'],
    requiredByPhase: {
      interaction: ['Nouvelle expérience'],
      overview: ['Ajouter une expérience'],
    },
  },
  freelancers: {
    forbidden: ['Review delivery', 'Approval requested', 'Deliverables'],
    required: ['Studio Ferro'],
    requiredByPhase: {
      interaction: ['Validation demandée'],
      overview: ['Examiner le livrable'],
    },
  },
  enterprise: {
    forbidden: ['Export audit log', 'Export ready', 'Review access'],
    required: ['Northwind Control'],
    requiredByPhase: {
      interaction: ['Export prêt'],
      overview: ['Exporter le journal'],
    },
  },
} as const satisfies Record<GeneratedFrSolutionSlug, GeneratedFrScenarioContract>;

const GLOBAL_FORBIDDEN_ENGLISH = [
  'Switch to light mode',
  'Switch to dark mode',
  'Switch to English',
  'Language: English',
  'Made with',
  'Built with',
  'Powered by',
] as const;

/** Distinctive UI words only: ambiguous French/technical words are excluded. */
const ENGLISH_UI_LEXICON = [
  'about',
  'account',
  'add',
  'appointment',
  'appointments',
  'apply',
  'approval',
  'back',
  'billing',
  'build',
  'built',
  'cancel',
  'change',
  'changes',
  'click',
  'close',
  'create',
  'customer',
  'customers',
  'dark',
  'dashboard',
  'data',
  'delete',
  'deliverable',
  'deliverables',
  'delivery',
  'edit',
  'enabled',
  'english',
  'experiment',
  'experiments',
  'feedback',
  'filter',
  'filters',
  'first',
  'forgot',
  'help',
  'home',
  'invoice',
  'language',
  'leaderboard',
  'light',
  'loading',
  'logout',
  'member',
  'members',
  'new',
  'next',
  'password',
  'payment',
  'payments',
  'previous',
  'profile',
  'project',
  'projects',
  'ready',
  'reminder',
  'reminders',
  'reset',
  'result',
  'results',
  'revenue',
  'review',
  'save',
  'search',
  'selected',
  'send',
  'settings',
  'signin',
  'start',
  'status',
  'submit',
  'switch',
  'team',
  'theme',
  'upcoming',
  'user',
  'users',
  'view',
  'welcome',
  'work',
  'year',
  'and',
  'are',
  'for',
  'from',
  'how',
  'into',
  'my',
  'of',
  'please',
  'the',
  'this',
  'to',
  'with',
  'you',
  'your',
] as const;

export type GeneratedFrResidual = Readonly<{
  match: string;
  rule: 'english-lexicon' | 'global-forbidden' | 'scenario-forbidden';
  selector: string;
  source: GeneratedFrSurfaceSource;
  value: string;
}>;

export type GeneratedFrRequirement = Readonly<{
  matched: boolean;
  term: string;
}>;

export type GeneratedFrSurfaceAudit = Readonly<{
  collection: GeneratedFrSurfaceCollection;
  documentLanguageMatched: boolean;
  missingRequired: readonly string[];
  passed: boolean;
  phase: GeneratedFrSurfacePhase;
  requirements: readonly GeneratedFrRequirement[];
  residuals: readonly GeneratedFrResidual[];
  slug: GeneratedFrSolutionSlug;
}>;

export type GeneratedFrSurfaceAuditOptions = Readonly<{
  phase?: GeneratedFrSurfacePhase;
  slug: GeneratedFrSolutionSlug;
}>;

/**
 * Browser-owned collector. It is a string on purpose: TSX/esbuild must never
 * inject its `__name` helper into code evaluated inside a generated Webview.
 */
export const GENERATED_FR_SURFACE_COLLECTOR_EXPRESSION = String.raw`(root) => {
  const ownerDocument = root.ownerDocument;
  const view = ownerDocument.defaultView;

  if (!view) throw new Error('Generated French surface is detached from its browser window');

  const normalize = (value) => String(value || '').replace(/\s+/gu, ' ').trim();
  const ignoredSelector = 'code, pre, script, style, noscript, template';
  const entries = [];

  const selectorFor = (element) => {
    if (element === ownerDocument.body) return 'body';
    if (element.id) return element.tagName.toLowerCase() + '#' + CSS.escape(element.id);

    const testId = element.getAttribute('data-testid');
    if (testId) return element.tagName.toLowerCase() + '[data-testid="' + CSS.escape(testId) + '"]';

    const segments = [];
    let current = element;

    while (current && current !== ownerDocument.body && segments.length < 5) {
      let segment = current.tagName.toLowerCase();
      const parent = current.parentElement;

      if (parent) {
        const siblings = Array.from(parent.children).filter((candidate) => candidate.tagName === current.tagName);
        if (siblings.length > 1) segment += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }

      segments.unshift(segment);
      current = parent;
    }

    return 'body > ' + segments.join(' > ');
  };

  const hasHiddenAncestor = (element) => {
    let current = element;

    while (current && current.nodeType === 1) {
      if (
        current.hasAttribute('hidden') ||
        current.hasAttribute('inert') ||
        current.getAttribute('aria-hidden') === 'true'
      ) {
        return true;
      }

      const style = view.getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.contentVisibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        return true;
      }

      if (current === root) break;
      current = current.parentElement;
    }

    return false;
  };

  const hasRenderedGeometry = (element) => {
    const rects = Array.from(element.getClientRects());
    return rects.some((rect) => rect.width > 0 && rect.height > 0);
  };

  const isCollectableElement = (element) => {
    if (element.closest(ignoredSelector)) return false;
    if (hasHiddenAncestor(element)) return false;
    if (element instanceof view.HTMLInputElement && element.type === 'hidden') return false;
    return hasRenderedGeometry(element);
  };

  const add = (source, selector, rawValue) => {
    const value = normalize(rawValue);
    if (value) entries.push({ selector, source, value });
  };

  const walker = ownerDocument.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();

  while (textNode) {
    const parent = textNode.parentElement;

    if (parent && isCollectableElement(parent)) {
      const range = ownerDocument.createRange();
      range.selectNodeContents(textNode);
      const rendered = Array.from(range.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
      if (rendered) add('text', selectorFor(parent), textNode.nodeValue);
    }

    textNode = walker.nextNode();
  }

  const elements = [root, ...Array.from(root.querySelectorAll('*'))];

  for (const element of elements) {
    if (!isCollectableElement(element)) continue;

    const selector = selectorFor(element);
    add('aria-label', selector, element.getAttribute('aria-label'));
    add('aria-description', selector, element.getAttribute('aria-description'));
    add('aria-valuetext', selector, element.getAttribute('aria-valuetext'));
    add('title', selector, element.getAttribute('title'));
    add('placeholder', selector, element.getAttribute('placeholder'));
    add('alt', selector, element.getAttribute('alt'));

    const referencedText = (rawIds) => {
      const ids = normalize(rawIds);
      if (!ids) return '';

      return ids
        .split(' ')
        .map((id) => ownerDocument.getElementById(id))
        .filter(Boolean)
        .map((referencedElement) => referencedElement.textContent)
        .join(' ');
    };

    add('aria-labelledby', selector, referencedText(element.getAttribute('aria-labelledby')));
    add('aria-describedby', selector, referencedText(element.getAttribute('aria-describedby')));

    if (element instanceof view.HTMLInputElement || element instanceof view.HTMLTextAreaElement) {
      add('input-value', selector, element.value);
    }
  }

  add('document-title', 'document', ownerDocument.title);

  const uniqueEntries = [];
  const seen = new Set();

  for (const entry of entries) {
    const key = entry.source + '\u0000' + entry.selector + '\u0000' + entry.value;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEntries.push(entry);
  }

  return {
    documentLanguage: normalize(ownerDocument.documentElement.lang),
    entries: uniqueEntries,
    rootSelector: selectorFor(root),
  };
}`;

const GENERATED_FR_SURFACE_COLLECTOR_PAGE_FUNCTION = new Function(
  'root',
  `return (${GENERATED_FR_SURFACE_COLLECTOR_EXPRESSION})(root);`,
) as (root: unknown) => GeneratedFrSurfaceCollection;

export type GeneratedFrSurfaceTarget = Page | Frame | FrameLocator | Locator;

function isLocator(target: GeneratedFrSurfaceTarget): target is Locator {
  const candidate = target as unknown as { count?: unknown; evaluate?: unknown };
  return typeof candidate.count === 'function' && typeof candidate.evaluate === 'function';
}

function surfaceRoot(target: GeneratedFrSurfaceTarget): Locator {
  return isLocator(target) ? target : target.locator('body');
}

export async function collectGeneratedFrenchSurface(
  target: GeneratedFrSurfaceTarget,
): Promise<GeneratedFrSurfaceCollection> {
  const root = surfaceRoot(target);
  const rootCount = await root.count();

  if (rootCount !== 1) {
    throw new Error(`Generated French surface requires exactly one root element; received ${rootCount}`);
  }

  return root.evaluate<GeneratedFrSurfaceCollection>(GENERATED_FR_SURFACE_COLLECTOR_PAGE_FUNCTION);
}

function normalizeForMatching(value: string) {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function exactDelimitedPattern(term: string, flags: string) {
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(term)})(?=$|[^\\p{L}\\p{N}_])`, flags);
}

function hasTerm(value: string, term: string, caseSensitive = false) {
  return exactDelimitedPattern(term, caseSensitive ? 'u' : 'iu').test(normalizeForMatching(value));
}

function stripNonTranslatableValues(value: string) {
  let remainder = normalizeForMatching(value)
    .replace(/https?:\/\/\S+|www\.\S+/giu, ' ')
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu, ' ')
    .replace(/\b[\p{L}\p{N}_.-]+\.(?:tsx?|jsx?|mjs|cjs|json|css|html|md)\b/giu, ' ');

  for (const allowed of [...GENERATED_FR_EXACT_ALLOWLIST].sort((left, right) => right.length - left.length)) {
    remainder = remainder.replace(exactDelimitedPattern(allowed, 'gu'), '$1');
  }

  return remainder.replace(/\s+/gu, ' ').trim();
}

function residualKey(residual: GeneratedFrResidual) {
  return [residual.rule, residual.match, residual.source, residual.selector, residual.value].join('\u0000');
}

function inspectEntry(entry: GeneratedFrSurfaceEntry, scenarioForbidden: readonly string[]): GeneratedFrResidual[] {
  const residuals: GeneratedFrResidual[] = [];

  const add = (match: string, rule: GeneratedFrResidual['rule']) => {
    residuals.push({ ...entry, match, rule });
  };

  for (const term of scenarioForbidden) {
    if (hasTerm(entry.value, term, term === 'HR-04')) {
      add(term, 'scenario-forbidden');
    }
  }

  for (const term of GLOBAL_FORBIDDEN_ENGLISH) {
    if (hasTerm(entry.value, term)) {
      add(term, 'global-forbidden');
    }
  }

  if (hasTerm(entry.value, 'EN', true)) {
    add('EN', 'global-forbidden');
  }

  const translatableRemainder = stripNonTranslatableValues(entry.value);

  for (const term of ENGLISH_UI_LEXICON) {
    if (hasTerm(translatableRemainder, term)) {
      add(term, 'english-lexicon');
    }
  }

  return residuals;
}

function inspectAggregateForbiddenSurface(
  combinedSurface: string,
  scenarioForbidden: readonly string[],
): GeneratedFrResidual[] {
  const aggregateEntry: GeneratedFrSurfaceEntry = {
    selector: 'surface',
    source: 'text',
    value: combinedSurface,
  };

  const residuals: GeneratedFrResidual[] = [];

  for (const term of scenarioForbidden) {
    if (hasTerm(combinedSurface, term, term === 'HR-04')) {
      residuals.push({ ...aggregateEntry, match: term, rule: 'scenario-forbidden' });
    }
  }

  for (const term of GLOBAL_FORBIDDEN_ENGLISH) {
    if (hasTerm(combinedSurface, term)) {
      residuals.push({ ...aggregateEntry, match: term, rule: 'global-forbidden' });
    }
  }

  return residuals;
}

function isFrenchDocumentLanguage(value: string) {
  return /^fr(?:-[a-z0-9]{1,8})*$/iu.test(normalizeForMatching(value));
}

export function inspectGeneratedFrenchSurface(
  collection: GeneratedFrSurfaceCollection,
  options: GeneratedFrSurfaceAuditOptions,
): GeneratedFrSurfaceAudit {
  const phase = options.phase ?? 'base';
  const contract = GENERATED_FR_SCENARIO_CONTRACTS[options.slug];
  const combinedSurface = collection.entries.map((entry) => entry.value).join(' ');
  const requiredTerms = [...contract.required, ...(phase === 'base' ? [] : contract.requiredByPhase[phase])];
  const requirements = requiredTerms.map((term) => ({ matched: hasTerm(combinedSurface, term), term }));
  const missingRequired = requirements.filter((requirement) => !requirement.matched).map(({ term }) => term);
  const entryResiduals = collection.entries.flatMap((entry) => inspectEntry(entry, contract.forbidden));

  const aggregateResiduals = inspectAggregateForbiddenSurface(combinedSurface, contract.forbidden).filter(
    (aggregateResidual) =>
      !entryResiduals.some(
        (entryResidual) =>
          entryResidual.rule === aggregateResidual.rule && entryResidual.match === aggregateResidual.match,
      ),
  );

  const residuals = [...entryResiduals, ...aggregateResiduals];
  const uniqueResiduals = [...new Map(residuals.map((residual) => [residualKey(residual), residual])).values()];
  const documentLanguageMatched = isFrenchDocumentLanguage(collection.documentLanguage);

  return {
    collection,
    documentLanguageMatched,
    missingRequired,
    passed: documentLanguageMatched && uniqueResiduals.length === 0 && missingRequired.length === 0,
    phase,
    requirements,
    residuals: uniqueResiduals,
    slug: options.slug,
  };
}

export class GeneratedFrenchSurfaceAuditError extends Error {
  readonly audit: GeneratedFrSurfaceAudit;

  constructor(audit: GeneratedFrSurfaceAudit) {
    const language = audit.documentLanguageMatched
      ? `language=${audit.collection.documentLanguage}`
      : `language=${audit.collection.documentLanguage || 'missing'} (expected fr or fr-*)`;

    const missing = audit.missingRequired.length > 0 ? `missing=${audit.missingRequired.join(', ')}` : 'missing=none';

    const residuals =
      audit.residuals.length > 0
        ? `residuals=${audit.residuals
            .map((residual) => `${residual.match} [${residual.source} ${residual.selector}]`)
            .join('; ')}`
        : 'residuals=none';

    super(`Generated FR Webview audit failed for ${audit.slug}/${audit.phase}: ${language}; ${missing}; ${residuals}`);
    this.name = 'GeneratedFrenchSurfaceAuditError';
    this.audit = audit;
  }
}

export async function auditGeneratedFrenchSurface(
  target: GeneratedFrSurfaceTarget,
  options: GeneratedFrSurfaceAuditOptions,
): Promise<GeneratedFrSurfaceAudit & { passed: true }> {
  const collection = await collectGeneratedFrenchSurface(target);
  const audit = inspectGeneratedFrenchSurface(collection, options);

  if (!audit.passed) {
    throw new GeneratedFrenchSurfaceAuditError(audit);
  }

  return { ...audit, passed: true };
}
