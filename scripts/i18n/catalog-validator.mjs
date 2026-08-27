import { parse } from '@babel/parser';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const RAW_KEY_VALUE = /^[a-z][\w-]*(?:\.[\w-]+)+$/;

function propertyName(property) {
  if (property.computed) {
    return undefined;
  }

  if (property.key?.type === 'StringLiteral' || property.key?.type === 'Identifier') {
    return property.key.value ?? property.key.name;
  }

  return undefined;
}

function staticString(node) {
  if (node?.type === 'StringLiteral') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral') {
    if (node.expressions.length > 0) {
      return undefined;
    }

    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
  }

  if (node?.type === 'ArrowFunctionExpression') {
    const parameterNames = new Set(
      node.params.filter((parameter) => parameter.type === 'Identifier').map((parameter) => parameter.name),
    );
    const body = unwrapExpression(node.body);

    if (body?.type === 'StringLiteral') {
      return body.value;
    }

    if (
      body?.type === 'TemplateLiteral' &&
      body.expressions.every((expression) => expression.type === 'Identifier' && parameterNames.has(expression.name))
    ) {
      return body.quasis
        .map((quasi, index) => {
          const value = quasi.value.cooked ?? quasi.value.raw;
          const expression = body.expressions[index];

          return expression?.type === 'Identifier' ? `${value}{${expression.name}}` : value;
        })
        .join('');
    }
  }

  return undefined;
}

function unwrapExpression(node) {
  let current = node;

  while (
    current &&
    [
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TypeCastExpression',
    ].includes(current.type)
  ) {
    current = current.expression;
  }

  return current;
}

function exportedObject(ast, exportName) {
  const [rootName, ...propertyPath] = exportName.split('.');

  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') {
      continue;
    }

    for (const declaration of statement.declaration.declarations) {
      if (declaration.id.type === 'Identifier' && declaration.id.name === rootName) {
        let current = unwrapExpression(declaration.init);

        for (const segment of propertyPath) {
          if (current?.type !== 'ObjectExpression') {
            return undefined;
          }

          const property = current.properties.find(
            (candidate) => candidate.type === 'ObjectProperty' && propertyName(candidate) === segment,
          );
          current = property?.type === 'ObjectProperty' ? unwrapExpression(property.value) : undefined;
        }

        return current;
      }
    }
  }

  return undefined;
}

/** Discover component-local catalogues exported as `{ en: {...}, fr: {...} }`. */
export function exportedBilingualCatalogNames(source, file = 'catalog.ts') {
  try {
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript'],
    });
    const names = [];

    for (const statement of ast.program.body) {
      if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') {
        continue;
      }

      for (const declaration of statement.declaration.declarations) {
        if (declaration.id.type !== 'Identifier') {
          continue;
        }

        const value = unwrapExpression(declaration.init);

        if (value?.type !== 'ObjectExpression') {
          continue;
        }

        const localeProperties = new Map(
          value.properties
            .filter((property) => property.type === 'ObjectProperty')
            .map((property) => [propertyName(property), unwrapExpression(property.value)]),
        );

        if (
          localeProperties.get('en')?.type === 'ObjectExpression' &&
          localeProperties.get('fr')?.type === 'ObjectExpression'
        ) {
          names.push(declaration.id.name);
        }
      }
    }

    return { names, issues: [] };
  } catch (error) {
    return {
      names: [],
      issues: [
        {
          code: 'catalog-parse-error',
          file,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

export function exportedCatalogNames(source, file = 'catalog.ts') {
  try {
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript'],
    });
    const names = [];

    for (const statement of ast.program.body) {
      if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') {
        continue;
      }

      for (const declaration of statement.declaration.declarations) {
        if (declaration.id.type === 'Identifier' && /(?:En|Fr)$/.test(declaration.id.name)) {
          names.push(declaration.id.name);
        }
      }
    }

    return { names, issues: [] };
  } catch (error) {
    return {
      names: [],
      issues: [
        {
          code: 'catalog-parse-error',
          file,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

export function parseCatalog(source, exportName, file = `${exportName}.ts`) {
  const issues = [];
  let ast;

  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript'],
    });
  } catch (error) {
    return {
      entries: new Map(),
      flat: false,
      issues: [{ code: 'catalog-parse-error', file, message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const object = exportedObject(ast, exportName);

  if (object?.type !== 'ObjectExpression') {
    return {
      entries: new Map(),
      flat: false,
      issues: [{ code: 'catalog-export-missing', file, message: `Expected an exported object named ${exportName}.` }],
    };
  }

  const entries = new Map();
  const topLevelFlat = object.properties.every(
    (property) => property.type === 'ObjectProperty' && staticString(unwrapExpression(property.value)) !== undefined,
  );

  const collect = (node, path, line) => {
    const valueNode = unwrapExpression(node);
    const value = staticString(valueNode);

    if (value !== undefined) {
      if (entries.has(path)) {
        issues.push({
          code: 'catalog-key-duplicate',
          file,
          key: path,
          line,
          message: `Duplicate catalog key: ${path}`,
        });
      } else {
        entries.set(path, value);
      }

      return;
    }

    if (valueNode?.type === 'ObjectExpression') {
      for (const property of valueNode.properties) {
        if (property.type !== 'ObjectProperty') {
          issues.push({
            code: 'catalog-property-unsupported',
            file,
            line: property.loc?.start.line,
            message: `Spread/method properties are not allowed in the ${exportName} catalog.`,
          });
          continue;
        }

        const key = propertyName(property);

        if (!key) {
          issues.push({
            code: 'catalog-entry-non-static',
            file,
            line: property.loc?.start.line,
            message: 'Catalog keys must be static strings.',
          });
          continue;
        }

        collect(property.value, path ? `${path}.${key}` : key, property.loc?.start.line);
      }

      return;
    }

    if (valueNode?.type === 'ArrayExpression') {
      valueNode.elements.forEach((element, index) => {
        if (element) {
          collect(element, `${path}.${index}`, element.loc?.start.line);
        }
      });

      return;
    }

    issues.push({
      code: 'catalog-entry-non-static',
      file,
      key: path,
      line,
      message: 'Catalog values must be static strings, objects or arrays.',
    });
  };

  for (const property of object.properties) {
    if (property.type !== 'ObjectProperty') {
      issues.push({
        code: 'catalog-property-unsupported',
        file,
        message: `Spread/method properties are not allowed in the ${exportName} catalog.`,
      });
      continue;
    }

    const key = propertyName(property);

    if (!key) {
      issues.push({
        code: 'catalog-entry-non-static',
        file,
        line: property.loc?.start.line,
        message: 'Catalog keys must be static strings.',
      });
      continue;
    }

    collect(property.value, key, property.loc?.start.line);
  }

  return { entries, flat: topLevelFlat, issues };
}

export function interpolationTokens(value) {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

function compareStringArrays(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function pluralFamilies(entries) {
  const families = new Map();

  for (const key of entries.keys()) {
    const match = key.match(PLURAL_SUFFIX);

    if (!match) {
      continue;
    }

    const family = key.slice(0, -match[0].length);
    const categories = families.get(family) ?? new Set();
    categories.add(match[1]);
    families.set(family, categories);
  }

  return families;
}

function validateRawValues(entries, file) {
  const issues = [];

  for (const [key, value] of entries) {
    const trimmed = value.trim();

    if (!trimmed) {
      issues.push({ code: 'catalog-value-empty', file, key, message: `Empty translation for ${key}.` });
      continue;
    }

    if (trimmed === key || RAW_KEY_VALUE.test(trimmed)) {
      issues.push({
        code: 'catalog-value-raw-key',
        file,
        key,
        message: `Translation ${key} looks like a raw implementation key: ${JSON.stringify(trimmed)}.`,
      });
    }
  }

  return issues;
}

function validatePluralFamilies(entries, file) {
  const issues = [];

  for (const [family, categories] of pluralFamilies(entries)) {
    for (const required of ['one', 'other']) {
      if (!categories.has(required)) {
        issues.push({
          code: 'catalog-plural-incomplete',
          file,
          key: family,
          message: `Plural family ${family} must define _one and _other (missing _${required}).`,
        });
      }
    }
  }

  return issues;
}

export function validateCatalogs({
  en,
  fr,
  enFile = 'app/lib/i18n/messages/en.ts',
  frFile = 'app/lib/i18n/messages/fr.ts',
}) {
  const issues = [
    ...en.issues,
    ...fr.issues,
    ...validateRawValues(en.entries, enFile),
    ...validateRawValues(fr.entries, frFile),
    ...validatePluralFamilies(en.entries, enFile),
    ...validatePluralFamilies(fr.entries, frFile),
  ];

  const enKeys = [...en.entries.keys()].sort();
  const frKeys = [...fr.entries.keys()].sort();

  for (const key of enKeys) {
    if (!fr.entries.has(key)) {
      issues.push({ code: 'catalog-key-missing-fr', file: frFile, key, message: `French catalog is missing ${key}.` });
      continue;
    }

    const enTokens = interpolationTokens(en.entries.get(key));
    const frTokens = interpolationTokens(fr.entries.get(key));

    if (!compareStringArrays(enTokens, frTokens)) {
      issues.push({
        code: 'catalog-interpolation-mismatch',
        file: frFile,
        key,
        message: `Interpolation mismatch for ${key}: en={${enTokens.join(', ')}} fr={${frTokens.join(', ')}}.`,
      });
    }
  }

  for (const key of frKeys) {
    if (!en.entries.has(key)) {
      issues.push({ code: 'catalog-key-missing-en', file: enFile, key, message: `English catalog is missing ${key}.` });
    }
  }

  return {
    issues,
    metrics: {
      enEntries: en.entries.size,
      frEntries: fr.entries.size,
      matchingKeys: enKeys.filter((key) => fr.entries.has(key)).length,
      pluralFamilies: pluralFamilies(en.entries).size,
    },
  };
}

export function validateCatalogRegistration(runtimeSource, pairs, file = 'app/lib/i18n/runtime.ts') {
  const issues = [];

  for (const pair of pairs) {
    for (const exportName of [pair.enName, pair.frName]) {
      const spreadPattern = new RegExp(`\\.\\.\\.\\s*${exportName}\\b`, 'u');

      if (!spreadPattern.test(runtimeSource)) {
        issues.push({
          code: 'catalog-not-registered',
          file,
          key: exportName,
          message: `${exportName} must be spread into the i18next runtime resources.`,
        });
      }
    }
  }

  return issues;
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') {
    return;
  }

  callback(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'comments') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child, callback);
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      visit(value, callback);
    }
  }
}

function returnedExpression(functionNode) {
  if (functionNode.type === 'ArrowFunctionExpression' && functionNode.body.type !== 'BlockStatement') {
    return functionNode.body;
  }

  const body = functionNode.body?.body;
  const returnStatement = body?.find((statement) => statement.type === 'ReturnStatement');

  return returnStatement?.argument;
}

/**
 * The catalog fallback only helps for known English keys. This extra static
 * guard requires the i18next runtime to map a completely unknown key to safe
 * copy instead of echoing the implementation key into the UI.
 */
export function validateRuntimeMissingKeyFallback(source, file = 'app/lib/i18n/runtime.ts') {
  let ast;

  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  } catch (error) {
    return [{ code: 'runtime-parse-error', file, message: error instanceof Error ? error.message : String(error) }];
  }

  let handler;

  visit(ast, (node) => {
    if (handler || node.type !== 'ObjectProperty' || propertyName(node) !== 'parseMissingKeyHandler') {
      return;
    }

    handler = node.value;
  });

  if (!handler || !['ArrowFunctionExpression', 'FunctionExpression'].includes(handler.type)) {
    return [
      {
        code: 'runtime-missing-key-handler-absent',
        file,
        message: 'i18next must define parseMissingKeyHandler so unknown keys never render verbatim.',
      },
    ];
  }

  const expression = returnedExpression(handler);
  const parameterNames = new Set(
    handler.params.filter((param) => param.type === 'Identifier').map((param) => param.name),
  );

  if (!expression) {
    return [
      {
        code: 'runtime-missing-key-handler-empty',
        file,
        message: 'parseMissingKeyHandler must return safe localized copy.',
      },
    ];
  }

  if (expression.type === 'Identifier' && parameterNames.has(expression.name)) {
    return [
      {
        code: 'runtime-missing-key-handler-echoes-key',
        file,
        message: 'parseMissingKeyHandler returns its raw key parameter.',
      },
    ];
  }

  return [];
}
