import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { JSDOM } from 'jsdom';

export const SCANNER_VERSION = 3;
export const DEFAULT_SCAN_ROOTS = [
  'app',
  'apps',
  'packages',
  'services',
  'public/offline.html',
  'public/ecode-static/offline.html',
];

const SCANNED_EXTENSION = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/;
const HTML_EXTENSION = /\.html?$/i;

/*
 * `public` also contains checked-in build outputs and Gallery demo artifacts.
 * Those are not source templates: scanning their generated HTML would both
 * duplicate the source audit and incorrectly treat demo/user content as
 * platform chrome. Keep the directly-served offline shells explicit while
 * all source HTML below app/apps/packages/services is discovered normally.
 */
const PUBLIC_HTML_SOURCES = new Set(['public/offline.html', 'public/ecode-static/offline.html']);

/*
 * This repair template is written into the user's project when its own Vite
 * shell is missing. Its language belongs to the generated project/prompt, not
 * to E-Code's UI locale; automatically translating it would mutate user
 * content. Only embedded-HTML findings are suppressed for this exact file —
 * ordinary UI/error findings in the module remain scanned.
 */
const USER_PROJECT_HTML_TEMPLATE_FILES = new Set(['app/lib/runtime/preview-manifest.ts']);

const IGNORED_SEGMENTS = new Set([
  '.react-router',
  '.vibecore-project-storage',
  '.vibecore-static-deployments',
  '__fixtures__',
  '__snapshots__',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'test',
  'test-results',
  'tests',
]);

const IGNORED_FILE = /(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/;

const TRANSLATION_CATALOG_PATHS = [
  'app/lib/i18n/catalogs/',
  'app/lib/i18n/messages/',
  'app/components/marketing/ecode-exact/marketing-shell.copy.ts',
  'apps/admin/src/i18n.ts',
  'packages/editor/src/editor-copy.ts',
  'packages/billing/src/agent-routing-i18n.ts',
  'services/ai-gateway/src/public-i18n.ts',
  'services/connector-proxy/src/public-i18n.ts',
  'services/preview-proxy/src/public-i18n.ts',
  'services/api/src/app-public-copy.ts',
  'services/api/src/auth-scaffold.copy.ts',
  'services/api/src/integrations/providers/public-error-copy.ts',
  'services/api/src/transactional-i18n.ts',
  'services/workspace-agent/src/public-i18n.ts',
  'services/workspace-manager/src/public-i18n.ts',
  'apps/mobile/src/i18n.ts',
];

const TRANSLATION_CATALOG_FILE = /^app\/components\/marketing\/solutions\/[^/]+\.copy\.ts$/;

const CODE_ELEMENTS = new Set(['code', 'kbd', 'pre', 'samp', 'script', 'style']);

const VISIBLE_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'description',
  'empty',
  'emptyMessage',
  'errorMessage',
  'helperText',
  'label',
  'placeholder',
  'rows',
  'successMessage',
  'title',
  'tooltip',
]);
const VISIBLE_OBJECT_KEYS = new Set([
  'actionLabel',
  'ariaLabel',
  'body',
  'buttonLabel',
  'cancelLabel',
  'caption',
  'confirmLabel',
  'description',
  'empty',
  'error',
  'emptyMessage',
  'emptyText',
  'errorMessage',
  'eyebrow',
  'heading',
  'helperText',
  'html',
  'hint',
  'highlights',
  'items',
  'label',
  'linkLabel',
  'loadingText',
  'message',
  'note',
  'placeholder',
  'reason',
  'subject',
  'subtitle',
  'successMessage',
  'summary',
  'text',
  'title',
  'tooltip',
]);

/*
 * Platform-owned copy is sometimes staged in a local before it is returned or
 * persisted, for example `let note; note = 'Using the catalog summary.'`.
 * Object-property and JSX scanning cannot see that data flow. Keep this list
 * deliberately narrower than VISIBLE_OBJECT_KEYS: generic transport/control
 * names such as `error`, `reason`, `status`, `text`, `body` and `items` would
 * mostly be machine data or user content when used as standalone variables.
 */
const VISIBLE_VARIABLE_NAMES = new Set([
  'actionLabel',
  'ariaLabel',
  'buttonLabel',
  'cancelLabel',
  'caption',
  'confirmLabel',
  'description',
  'emptyMessage',
  'emptyText',
  'errorMessage',
  'heading',
  'helperText',
  'label',
  'linkLabel',
  'loadingText',
  'message',
  'note',
  'placeholder',
  'subject',
  'subtitle',
  'successMessage',
  'summary',
  'title',
  'tooltip',
]);
const USER_MESSAGE_CALLS = new Set([
  'addToast',
  'alert',
  'confirm',
  'notify',
  'prompt',
  'setError',
  'setErrorMessage',
  'setStatusMessage',
  'setValidationError',
  'showToast',
  'toast',
]);

const USER_MESSAGE_METHODS = new Set(['error', 'info', 'success', 'warn', 'warning']);
const SEO_META_NAMES = new Set(['description', 'og:description', 'og:title', 'twitter:description', 'twitter:title']);

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function shouldScanFile(path) {
  const normalized = normalizePath(path);

  const htmlSource =
    HTML_EXTENSION.test(normalized) &&
    (PUBLIC_HTML_SOURCES.has(normalized) || /^(?:app|apps|packages|services)\//.test(normalized));

  if ((!SCANNED_EXTENSION.test(normalized) && !htmlSource) || IGNORED_FILE.test(normalized)) {
    return false;
  }

  const segments = normalized.split('/');

  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return false;
  }

  return (
    !TRANSLATION_CATALOG_PATHS.some((catalogPath) =>
      catalogPath.endsWith('/') ? normalized.startsWith(catalogPath) : normalized === catalogPath,
    ) && !TRANSLATION_CATALOG_FILE.test(normalized)
  );
}

function staticString(node) {
  if (!node) {
    return undefined;
  }

  if (node.type === 'StringLiteral' || node.type === 'JSXText') {
    return node.value;
  }

  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
  }

  if (node.type === 'JSXExpressionContainer') {
    return staticString(node.expression);
  }

  return undefined;
}

/*
 * User-facing expressions are frequently composed at runtime, for example
 * `toast.error(`Failed: ${error.message}`)` or
 * `setError(result.error ?? 'Request failed')`. `staticString` intentionally
 * remains strict for structural lookups (SEO name fields, etc.); this helper
 * walks only expression shapes that can directly select or compose visible
 * copy, without descending into arbitrary calls such as `t('copy.key')`.
 */
function visibleStringCandidates(node) {
  const direct = staticString(node);

  if (direct !== undefined) {
    return [{ node, value: direct }];
  }

  if (!node || typeof node !== 'object') {
    return [];
  }

  if (node.type === 'TemplateLiteral') {
    const value = node.quasis
      .map((quasi, index) => {
        const text = quasi.value.cooked ?? quasi.value.raw;
        return index < node.expressions.length ? `${text}{…}` : text;
      })
      .join('');

    return [{ node, value }, ...node.expressions.flatMap((expression) => visibleStringCandidates(expression))];
  }

  if (node.type === 'ConditionalExpression') {
    return [...visibleStringCandidates(node.consequent), ...visibleStringCandidates(node.alternate)];
  }

  if (node.type === 'LogicalExpression') {
    return [...visibleStringCandidates(node.left), ...visibleStringCandidates(node.right)];
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return [...visibleStringCandidates(node.left), ...visibleStringCandidates(node.right)];
  }

  if (node.type === 'SequenceExpression') {
    return visibleStringCandidates(node.expressions.at(-1));
  }

  if (node.type === 'ArrayExpression') {
    return node.elements.flatMap((element) => visibleStringCandidates(element));
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    return visibleMapCallCandidates(node);
  }

  if (
    node.type === 'JSXExpressionContainer' ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression'
  ) {
    return visibleStringCandidates(node.expression);
  }

  return [];
}

function transparentExpression(node) {
  let current = node;

  while (
    current &&
    (current.type === 'ParenthesizedExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression')
  ) {
    current = current.expression;
  }

  return current;
}

function arrayPatternIdentifier(element) {
  const candidate = transparentExpression(element?.type === 'AssignmentPattern' ? element.left : element);

  return candidate?.type === 'Identifier' ? candidate.name : undefined;
}

function identifierIsRendered(ancestors) {
  const expressionIndex = ancestors.findLastIndex((ancestor) => ancestor.type === 'JSXExpressionContainer');

  if (expressionIndex < 0 || insideCodeElement(ancestors)) {
    return false;
  }

  const expressionParent = ancestors[expressionIndex - 1];

  if (expressionParent?.type === 'JSXElement' || expressionParent?.type === 'JSXFragment') {
    return true;
  }

  return expressionParent?.type === 'JSXAttribute' && VISIBLE_ATTRIBUTES.has(jsxName(expressionParent.name));
}

function visibleTupleIndexes(callback) {
  const firstParameter = callback?.params?.[0];

  if (firstParameter?.type !== 'ArrayPattern') {
    return [];
  }

  const indexByName = new Map();

  firstParameter.elements.forEach((element, index) => {
    const name = arrayPatternIdentifier(element);

    if (name) {
      indexByName.set(name, index);
    }
  });

  const visibleIndexes = new Set();

  visit(callback.body, [], (node, ancestors) => {
    if (node.type !== 'Identifier' || !identifierIsRendered(ancestors)) {
      return;
    }

    const index = indexByName.get(node.name);

    if (index !== undefined) {
      visibleIndexes.add(index);
    }
  });

  return [...visibleIndexes];
}

function callbackReturnExpressions(callback) {
  if (!callback) {
    return [];
  }

  if (callback.body?.type !== 'BlockStatement') {
    return callback.body ? [callback.body] : [];
  }

  const returned = [];

  visit(callback.body, [], (node) => {
    if (node.type === 'ReturnStatement' && node.argument) {
      returned.push(node.argument);
    }
  });

  return returned;
}

function visibleMapCallCandidates(node) {
  const callee = transparentExpression(node.callee);

  if (
    (callee?.type !== 'MemberExpression' && callee?.type !== 'OptionalMemberExpression') ||
    memberName(callee).property !== 'map'
  ) {
    return [];
  }

  const callback = node.arguments?.[0];

  if (callback?.type !== 'ArrowFunctionExpression' && callback?.type !== 'FunctionExpression') {
    return [];
  }

  const source = transparentExpression(callee.object);
  const visibleIndexes = visibleTupleIndexes(callback);

  if (source?.type === 'ArrayExpression' && visibleIndexes.length > 0) {
    return source.elements.flatMap((row) => {
      const tuple = transparentExpression(row);

      if (tuple?.type !== 'ArrayExpression') {
        return [];
      }

      return visibleIndexes.flatMap((index) => visibleStringCandidates(tuple.elements[index]));
    });
  }

  return callbackReturnExpressions(callback).flatMap((expression) => visibleStringCandidates(expression));
}

export function normalizeVisibleText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isPotentialCopy(value) {
  const normalized = normalizeVisibleText(value);

  if (normalized.length < 2 || !/\p{L}/u.test(normalized)) {
    return false;
  }

  /*
   * CSS hexadecimal colors may contain A–F but are configuration values, not
   * user-facing language (for example, `{ text: '#FFFFFF' }`).
   */
  if (/^#[\da-f]{3,8}$/i.test(normalized)) {
    return false;
  }

  if (/^(?:data|file|https?|mailto|tel):/i.test(normalized) || /^\/[\w@.+~-]+(?:\/[\w@.+~-]+)*\/?$/.test(normalized)) {
    return false;
  }

  return true;
}

function jsxName(node) {
  if (node?.type === 'JSXIdentifier') {
    return node.name;
  }

  return undefined;
}

function objectKey(node) {
  if (node?.computed) {
    return undefined;
  }

  if (node?.key?.type === 'Identifier') {
    return node.key.name;
  }

  if (node?.key?.type === 'StringLiteral') {
    return node.key.value;
  }

  return undefined;
}

function insideCodeElement(ancestors) {
  return ancestors.some(
    (ancestor) =>
      ancestor.type === 'JSXElement' && CODE_ELEMENTS.has(jsxName(ancestor.openingElement?.name)?.toLowerCase()),
  );
}

function memberName(callee) {
  if (callee?.type === 'Identifier') {
    return { object: undefined, property: callee.name };
  }

  if (callee?.type !== 'MemberExpression' && callee?.type !== 'OptionalMemberExpression') {
    return { object: undefined, property: undefined };
  }

  const object = callee.object?.type === 'Identifier' ? callee.object.name : undefined;

  const property = callee.computed
    ? callee.property?.type === 'StringLiteral'
      ? callee.property.value
      : undefined
    : callee.property?.type === 'Identifier'
      ? callee.property.name
      : undefined;

  return { object, property };
}

function visibleVariableTargetName(node) {
  const candidate = transparentExpression(node);

  if (candidate?.type === 'Identifier') {
    return candidate.name;
  }

  if (candidate?.type === 'MemberExpression' || candidate?.type === 'OptionalMemberExpression') {
    return memberName(candidate).property;
  }

  return undefined;
}

function isSeoContentProperty(node, parent) {
  if (objectKey(node) !== 'content' || parent?.type !== 'ObjectExpression') {
    return false;
  }

  return parent.properties.some((property) => {
    if (property.type !== 'ObjectProperty' || objectKey(property) !== 'name') {
      return false;
    }

    const name = staticString(property.value);

    return name ? SEO_META_NAMES.has(name) : false;
  });
}

function addFinding(findings, { file, node, rule, value }) {
  const text = normalizeVisibleText(value);

  if (!isPotentialCopy(text)) {
    return;
  }

  findings.push({
    file,
    line: node.loc?.start.line ?? 1,
    column: (node.loc?.start.column ?? 0) + 1,
    rule,
    text,
  });
}

function htmlLocation(node, dom, attributeName) {
  const location = dom.nodeLocation(node);
  const attributeLocation = attributeName ? location?.attrs?.[attributeName.toLowerCase()] : undefined;
  const selected = attributeLocation ?? location;

  return {
    loc: {
      start: {
        line: selected?.startLine ?? 1,
        column: Math.max(0, (selected?.startCol ?? 1) - 1),
      },
    },
  };
}

function insideHtmlCodeElement(node) {
  let current = node.parentElement;

  while (current) {
    if (CODE_ELEMENTS.has(current.localName?.toLowerCase())) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function insideInertHtmlTemplate(node) {
  let current = node.nodeType === 1 ? node : node.parentElement;

  while (current) {
    /*
     * `hidden` and `aria-hidden` are runtime state in application shells and
     * may be removed by JavaScript (offline/error banners are common). Their
     * copy must remain audited. A template element, however, is inert source
     * data until explicitly cloned and is excluded like code/pre samples.
     */
    if (current.localName?.toLowerCase() === 'template') {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

const HTML_VISIBLE_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'label',
  'placeholder',
  'title',
]);

/**
 * Scan source HTML without executing scripts or loading subresources. This is
 * intentionally limited to source shells: generated bundles and Gallery demo
 * content are filtered by `shouldScanFile`, not silently accepted here.
 */
export function scanHtml(source, file = 'source.html') {
  const findings = [];
  const dom = new JSDOM(source, { includeNodeLocations: true });
  const { document, Node } = dom.window;

  for (const node of document.querySelectorAll('*')) {
    const elementName = node.localName?.toLowerCase();

    if (!insideInertHtmlTemplate(node) && !CODE_ELEMENTS.has(elementName)) {
      for (const attribute of node.attributes) {
        const name = attribute.name.toLowerCase();

        if (HTML_VISIBLE_ATTRIBUTES.has(name)) {
          addFinding(findings, {
            file,
            node: htmlLocation(node, dom, name),
            rule: 'html-visible-attribute',
            value: attribute.value,
          });
        }
      }

      if (elementName === 'input' && /^(?:button|reset|submit)$/i.test(node.getAttribute('type') ?? '')) {
        addFinding(findings, {
          file,
          node: htmlLocation(node, dom, 'value'),
          rule: 'html-visible-attribute',
          value: node.getAttribute('value') ?? '',
        });
      }

      if (elementName === 'meta') {
        const metaName = (node.getAttribute('name') ?? node.getAttribute('property') ?? '').toLowerCase();

        if (SEO_META_NAMES.has(metaName)) {
          addFinding(findings, {
            file,
            node: htmlLocation(node, dom, 'content'),
            rule: 'html-meta-copy',
            value: node.getAttribute('content') ?? '',
          });
        }
      }
    }

    for (const child of node.childNodes) {
      if (
        child.nodeType !== Node.TEXT_NODE ||
        insideHtmlCodeElement(child) ||
        insideInertHtmlTemplate(child) ||
        CODE_ELEMENTS.has(elementName)
      ) {
        continue;
      }

      addFinding(findings, {
        file,
        node: htmlLocation(child, dom),
        rule: 'html-text',
        value: child.nodeValue ?? '',
      });
    }
  }

  dom.window.close();

  return { findings, parseErrors: [] };
}

function addExpressionFindings(findings, { file, node, rule }) {
  for (const candidate of visibleStringCandidates(node)) {
    addFinding(findings, { file, node: candidate.node, rule, value: candidate.value });
  }
}

const VISIBLE_TUPLE_COLLECTION_NAMES = new Set([
  'actions',
  'commandItems',
  'commands',
  'menuItems',
  'toolItems',
  'tools',
]);

function addVisibleTupleCollectionFindings(findings, file, declarator) {
  if (
    declarator.id?.type !== 'Identifier' ||
    !VISIBLE_TUPLE_COLLECTION_NAMES.has(declarator.id.name) ||
    transparentExpression(declarator.init)?.type !== 'ArrayExpression'
  ) {
    return;
  }

  const collection = transparentExpression(declarator.init);

  for (const entry of collection.elements) {
    const tuple = transparentExpression(entry);

    if (tuple?.type !== 'ArrayExpression' || tuple.elements.length < 2) {
      continue;
    }

    /*
     * IDE/menu tuples conventionally store `[id, label, description, ...,
     * category]`. The identifier is implementation data; the next two fields
     * and final grouping label are rendered. A Set avoids duplicates for short
     * `[id, label]` / `[id, label, description]` tuples.
     */
    const visibleIndexes = new Set([1, 2, tuple.elements.length - 1]);

    for (const index of visibleIndexes) {
      addExpressionFindings(findings, {
        file,
        node: tuple.elements[index],
        rule: 'visible-tuple-copy',
      });
    }
  }
}

function visit(node, ancestors, callback) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    return;
  }

  callback(node, ancestors);

  const nextAncestors = [...ancestors, node];

  for (const [key, value] of Object.entries(node)) {
    if (['comments', 'end', 'extra', 'loc', 'start', 'tokens'].includes(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child, nextAncestors, callback);
      }
    } else {
      visit(value, nextAncestors, callback);
    }
  }
}

export function scanSource(source, file = 'source.tsx') {
  const findings = [];

  let ast;

  try {
    ast = parse(source, {
      sourceType: 'unambiguous',
      allowAwaitOutsideFunction: true,
      errorRecovery: false,
      plugins: [
        'classProperties',
        'decorators-legacy',
        'explicitResourceManagement',
        'importAttributes',
        'jsx',
        'topLevelAwait',
        'typescript',
      ],
    });
  } catch (error) {
    return {
      findings,
      parseErrors: [
        {
          file,
          line: error?.loc?.line,
          column: error?.loc?.column === undefined ? undefined : error.loc.column + 1,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  visit(ast, [], (node, ancestors) => {
    const parent = ancestors.at(-1);

    if (node.type === 'JSXText' && !insideCodeElement(ancestors)) {
      addFinding(findings, { file, node, rule: 'jsx-text', value: node.value });
      return;
    }

    if (node.type === 'JSXAttribute' && VISIBLE_ATTRIBUTES.has(jsxName(node.name))) {
      addExpressionFindings(findings, { file, node: node.value, rule: 'visible-attribute' });

      return;
    }

    if (
      node.type === 'JSXExpressionContainer' &&
      (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment') &&
      !insideCodeElement(ancestors)
    ) {
      addExpressionFindings(findings, { file, node: node.expression, rule: 'jsx-expression' });

      return;
    }

    if (node.type === 'ObjectProperty') {
      const key = objectKey(node);

      if (VISIBLE_OBJECT_KEYS.has(key) || isSeoContentProperty(node, parent)) {
        addExpressionFindings(findings, {
          file,
          node: node.value,
          rule: isSeoContentProperty(node, parent) ? 'seo-meta-copy' : 'visible-object-copy',
        });
      }

      return;
    }

    if (node.type === 'VariableDeclarator') {
      addVisibleTupleCollectionFindings(findings, file, node);

      if (VISIBLE_VARIABLE_NAMES.has(visibleVariableTargetName(node.id))) {
        addExpressionFindings(findings, {
          file,
          node: node.init,
          rule: 'visible-variable-copy',
        });
      }

      return;
    }

    if (
      node.type === 'AssignmentExpression' &&
      ['=', '||=', '??='].includes(node.operator) &&
      VISIBLE_VARIABLE_NAMES.has(visibleVariableTargetName(node.left))
    ) {
      addExpressionFindings(findings, {
        file,
        node: node.right,
        rule: 'visible-variable-copy',
      });

      return;
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const { object, property } = memberName(node.callee);

      const isMessageSetter =
        typeof property === 'string' &&
        (/^set(?:.*(?:Error|Message|Notice|Warning))$/u.test(property) || /^(?:setStatus|setResult)$/u.test(property));

      const isDirectMessage = USER_MESSAGE_CALLS.has(property) || isMessageSetter;
      const isMessageMethod = object !== 'console' && USER_MESSAGE_METHODS.has(property) && object === 'toast';

      if (isDirectMessage || isMessageMethod) {
        addExpressionFindings(findings, { file, node: node.arguments[0], rule: 'user-message-call' });
      }

      return;
    }

    if (node.type === 'NewExpression') {
      const constructorName = node.callee?.type === 'Identifier' ? node.callee.name : undefined;

      if (constructorName === 'Error' || constructorName === 'Response') {
        addExpressionFindings(findings, {
          file,
          node: node.arguments[0],
          rule: constructorName === 'Response' ? 'response-message' : 'error-message',
        });
      }
    }

    if (
      node.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      !USER_PROJECT_HTML_TEMPLATE_FILES.has(normalizePath(file))
    ) {
      const embedded = staticString(node);

      if (embedded && /(?:<!doctype\s+html|<html\b)/iu.test(embedded)) {
        const result = scanHtml(embedded, file);
        const lineOffset = (node.loc?.start.line ?? 1) - 1;

        findings.push(
          ...result.findings.map((finding) => ({
            ...finding,
            line: finding.line + lineOffset,
            rule: `embedded-${finding.rule}`,
          })),
        );
      }
    }
  });

  return { findings, parseErrors: [] };
}

async function* walk(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_SEGMENTS.has(entry.name)) {
      continue;
    }

    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

export async function scanRepository({ roots = DEFAULT_SCAN_ROOTS } = {}) {
  const findings = [];
  const parseErrors = [];

  let scannedFiles = 0;

  const visited = new Set();

  const scanFile = async (path) => {
    const file = normalizePath(path);

    if (visited.has(file) || !shouldScanFile(file)) {
      return;
    }

    visited.add(file);
    scannedFiles += 1;

    const source = await readFile(path, 'utf8');
    const result = HTML_EXTENSION.test(file) ? scanHtml(source, file) : scanSource(source, file);
    findings.push(...result.findings);
    parseErrors.push(...result.parseErrors);
  };

  for (const root of roots) {
    const rootStat = await stat(root).catch(() => undefined);

    if (!rootStat) {
      continue;
    }

    if (rootStat.isFile()) {
      await scanFile(root);
      continue;
    }

    for await (const path of walk(root)) {
      await scanFile(path);
    }
  }

  return { findings, parseErrors, scannedFiles, scannedFilePaths: [...visited].sort() };
}

function globToRegExp(glob) {
  const marker = '__DOUBLE_STAR__';

  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', marker)
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll(marker, '.*');

  return new RegExp(`^${escaped}$`);
}

export function validateAllowlist(allowlist, now = new Date()) {
  const errors = [];

  if (allowlist?.schemaVersion !== 1 || !Array.isArray(allowlist.entries)) {
    return ['Allowlist must have schemaVersion=1 and an entries array.'];
  }

  const ids = new Set();
  const today = now.toISOString().slice(0, 10);

  for (const entry of allowlist.entries) {
    const prefix = entry?.id ? `Allowlist entry ${entry.id}` : 'Allowlist entry without id';

    if (!entry?.id || ids.has(entry.id)) {
      errors.push(`${prefix} must have a unique non-empty id.`);
    } else {
      ids.add(entry.id);
    }

    if (!entry?.path || !entry?.rule || !entry?.textPattern) {
      errors.push(`${prefix} must define path, rule and textPattern.`);
    } else {
      try {
        globToRegExp(entry.path);
        new RegExp(entry.textPattern, 'u');
      } catch (error) {
        errors.push(`${prefix} has an invalid path/text pattern: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (!entry?.justification || !entry?.owner) {
      errors.push(`${prefix} must define justification and owner.`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry?.expiresOn ?? '') || entry.expiresOn < today) {
      errors.push(`${prefix} must have a non-expired expiresOn date (found ${entry?.expiresOn ?? 'none'}).`);
    }
  }

  return errors;
}

export function applyAllowlist(findings, allowlist) {
  const compiled = allowlist.entries.map((entry) => ({
    ...entry,
    pathRegex: globToRegExp(entry.path),
    textRegex: new RegExp(entry.textPattern, 'u'),
  }));

  const accepted = [];
  const residual = [];

  for (const finding of findings) {
    const entry = compiled.find(
      (candidate) =>
        candidate.pathRegex.test(finding.file) &&
        (candidate.rule === '*' || candidate.rule === finding.rule) &&
        candidate.textRegex.test(finding.text),
    );

    if (entry) {
      accepted.push({ ...finding, allowlistId: entry.id });
    } else {
      residual.push(finding);
    }
  }

  return { accepted, residual };
}

export function findingFingerprint(finding) {
  return createHash('sha256').update(`${finding.rule}\0${finding.text}`).digest('hex');
}

function findingsByFile(findings) {
  const grouped = new Map();

  for (const finding of findings) {
    const list = grouped.get(finding.file) ?? [];
    list.push(finding);
    grouped.set(finding.file, list);
  }

  return grouped;
}

function fileDigest(findings) {
  const fingerprints = findings.map(findingFingerprint).sort();
  return createHash('sha256').update(fingerprints.join('\n')).digest('hex');
}

export function buildBaseline(
  findings,
  { generatedAt = new Date().toISOString(), sourceRevision = 'working-tree' } = {},
) {
  const fileBudgets = {};

  for (const [file, fileFindings] of [...findingsByFile(findings)].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    fileBudgets[file] = { count: fileFindings.length, digest: fileDigest(fileFindings) };
  }

  return {
    schemaVersion: 1,
    scannerVersion: SCANNER_VERSION,
    generatedAt,
    sourceRevision,
    knownFindingCount: findings.length,
    fileBudgets,
  };
}

export function validateBaseline(baseline) {
  const errors = [];

  if (baseline?.schemaVersion !== 1 || baseline?.scannerVersion !== SCANNER_VERSION) {
    errors.push(`Baseline must use schemaVersion=1 and scannerVersion=${SCANNER_VERSION}.`);
  }

  if (!Number.isInteger(baseline?.knownFindingCount) || baseline.knownFindingCount < 0) {
    errors.push('Baseline knownFindingCount must be a non-negative integer.');
  }

  if (!baseline?.fileBudgets || typeof baseline.fileBudgets !== 'object' || Array.isArray(baseline.fileBudgets)) {
    errors.push('Baseline fileBudgets must be an object.');
    return errors;
  }

  for (const [file, budget] of Object.entries(baseline.fileBudgets)) {
    if (
      !shouldScanFile(file) ||
      !Number.isInteger(budget?.count) ||
      budget.count < 1 ||
      !/^[a-f0-9]{64}$/.test(budget?.digest ?? '')
    ) {
      errors.push(`Invalid baseline budget for ${file}.`);
    }
  }

  const budgetTotal = Object.values(baseline.fileBudgets).reduce(
    (total, budget) => total + (Number.isInteger(budget?.count) ? budget.count : 0),
    0,
  );

  if (budgetTotal !== baseline.knownFindingCount) {
    errors.push(
      `Baseline knownFindingCount=${baseline.knownFindingCount} does not match file budget total=${budgetTotal}.`,
    );
  }

  return errors;
}

/**
 * Honest transitional baseline: equal-size debt must match its digest exactly;
 * increases and new files fail; reductions pass. A reduction can contain a
 * replacement string, so this mode is a non-regression debt ceiling, not proof
 * of zero hardcoded copy. `--require-zero` remains the release criterion.
 */
export function compareWithBaseline(findings, baseline) {
  const violations = [];
  const improvements = [];
  const current = findingsByFile(findings);

  for (const [file, fileFindings] of current) {
    const budget = baseline.fileBudgets[file];

    if (!budget) {
      violations.push({ file, code: 'new-file-debt', baseline: 0, current: fileFindings.length });
      continue;
    }

    if (fileFindings.length > budget.count) {
      violations.push({ file, code: 'finding-count-increased', baseline: budget.count, current: fileFindings.length });
      continue;
    }

    if (fileFindings.length === budget.count && fileDigest(fileFindings) !== budget.digest) {
      violations.push({ file, code: 'finding-set-changed', baseline: budget.count, current: fileFindings.length });
      continue;
    }

    if (fileFindings.length < budget.count) {
      improvements.push({ file, baseline: budget.count, current: fileFindings.length });
    }
  }

  for (const [file, budget] of Object.entries(baseline.fileBudgets)) {
    if (!current.has(file)) {
      improvements.push({ file, baseline: budget.count, current: 0 });
    }
  }

  return { violations, improvements };
}

export function summarizeFindings(findings) {
  const byRule = {};
  const byFile = {};

  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
    byFile[finding.file] = (byFile[finding.file] ?? 0) + 1;
  }

  const topFiles = Object.entries(byFile)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([file, count]) => ({ file, count }));

  return { count: findings.length, files: Object.keys(byFile).length, byRule, topFiles };
}
