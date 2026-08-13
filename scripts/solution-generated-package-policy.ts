export type GeneratedSolutionPackageLocale = 'en' | 'fr';

export type GeneratedSolutionPackagePolicyResult =
  | { valid: true }
  | {
      errors: readonly string[];
      valid: false;
    };

const REQUIRED_TOP_LEVEL_KEYS = [
  'name',
  'version',
  'private',
  'type',
  'scripts',
  'dependencies',
  'devDependencies',
  'overrides',
  'allowScripts',
] as const;

const REQUIRED_SCRIPTS = {
  dev: 'vite --host 0.0.0.0',
  typecheck: 'tsc --noEmit',
  build: 'tsc --noEmit && vite build',
  preview: 'vite preview --host 0.0.0.0',
} as const;

const REQUIRED_DEPENDENCIES = {
  react: '18.3.1',
  'react-dom': '18.3.1',
} as const;

const REQUIRED_DEV_DEPENDENCIES = {
  '@types/react': '18.3.23',
  '@types/react-dom': '18.3.7',
  typescript: '5.9.3',
  vite: '5.4.21',
} as const;

const REQUIRED_OVERRIDES = { esbuild: '0.21.5' } as const;
const REQUIRED_ALLOW_SCRIPTS = { 'esbuild@0.21.5': true } as const;

const SAFE_PACKAGE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,212}[a-z0-9])?$/u;

const SAFE_PACKAGE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareExactRecord(
  actual: unknown,
  expected: Readonly<Record<string, string | boolean>>,
  label: string,
  errors: string[],
) {
  if (!isRecord(actual)) {
    errors.push(`${label} must be an object`);

    return;
  }

  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  const missingKeys = expectedKeys.filter((key) => !Object.hasOwn(actual, key));
  const extraKeys = actualKeys.filter((key) => !Object.hasOwn(expected, key));

  if (missingKeys.length > 0) {
    errors.push(`${label} is missing: ${missingKeys.join(', ')}`);
  }

  if (extraKeys.length > 0) {
    errors.push(`${label} contains forbidden keys: ${extraKeys.join(', ')}`);
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (Object.hasOwn(actual, key) && actual[key] !== expectedValue) {
      errors.push(
        `${label}.${key} must equal ${JSON.stringify(expectedValue)} (received ${JSON.stringify(actual[key])})`,
      );
    }
  }
}

/**
 * Closed dependency policy for the small, generated Solutions proof projects.
 * It intentionally validates parsed semantics rather than formatting and never
 * mutates the project or attempts to repair an unsafe manifest.
 */
export function validateGeneratedSolutionPackageJson(source: string): GeneratedSolutionPackagePolicyResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    return { valid: false, errors: [`package.json is not valid JSON: ${detail}`] };
  }

  if (!isRecord(parsed)) {
    return { valid: false, errors: ['package.json root must be an object'] };
  }

  const errors: string[] = [];
  const actualKeys = Object.keys(parsed).sort();
  const requiredKeys = [...REQUIRED_TOP_LEVEL_KEYS].sort();
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(parsed, key));
  const extraKeys = actualKeys.filter((key) => !requiredKeys.includes(key as (typeof requiredKeys)[number]));

  if (missingKeys.length > 0) {
    errors.push(`package.json is missing top-level keys: ${missingKeys.join(', ')}`);
  }

  if (extraKeys.length > 0) {
    errors.push(`package.json contains forbidden top-level keys: ${extraKeys.join(', ')}`);
  }

  if (typeof parsed.name !== 'string' || parsed.name.length > 214 || !SAFE_PACKAGE_NAME_PATTERN.test(parsed.name)) {
    errors.push('package.json.name must be a safe lowercase unscoped npm package name');
  }

  if (
    typeof parsed.version !== 'string' ||
    parsed.version.length > 128 ||
    !SAFE_PACKAGE_VERSION_PATTERN.test(parsed.version)
  ) {
    errors.push('package.json.version must be a safe semantic version string');
  }

  if (parsed.private !== true) {
    errors.push('package.json.private must equal true');
  }

  if (parsed.type !== 'module') {
    errors.push('package.json.type must equal "module"');
  }

  compareExactRecord(parsed.scripts, REQUIRED_SCRIPTS, 'package.json.scripts', errors);
  compareExactRecord(parsed.dependencies, REQUIRED_DEPENDENCIES, 'package.json.dependencies', errors);
  compareExactRecord(parsed.devDependencies, REQUIRED_DEV_DEPENDENCIES, 'package.json.devDependencies', errors);
  compareExactRecord(parsed.overrides, REQUIRED_OVERRIDES, 'package.json.overrides', errors);
  compareExactRecord(parsed.allowScripts, REQUIRED_ALLOW_SCRIPTS, 'package.json.allowScripts', errors);

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export function generatedSolutionPackageContractFor(locale: GeneratedSolutionPackageLocale) {
  return locale === 'fr'
    ? ' Contrat package obligatoire et ordonné. Votre toute première action fichier doit créer le package.json à la racine. Il ne doit contenir que les clés de premier niveau name, version, private, type, scripts, dependencies, devDependencies, overrides et allowScripts. Choisissez pour name un nom npm sûr, non scopé, en minuscules, et pour version une version sémantique sûre ; private doit valoir true et type doit valoir module. scripts doit contenir exactement dev = vite --host 0.0.0.0, typecheck = tsc --noEmit, build = tsc --noEmit && vite build et preview = vite preview --host 0.0.0.0, sans autre script. dependencies doit contenir exactement react = 18.3.1 et react-dom = 18.3.1. devDependencies doit contenir exactement @types/react = 18.3.23, @types/react-dom = 18.3.7, typescript = 5.9.3 et vite = 5.4.21. overrides doit contenir exactement esbuild = 0.21.5. allowScripts doit contenir exactement esbuild@0.21.5 = true. Toutes ces versions sont littérales : aucun ^, ~, tag, URL, protocole file, git ou workspace. N’ajoutez aucune autre dépendance, clé de premier niveau, configuration packageManager ou workspaces, script de cycle de vie, autre gestionnaire de paquets ni échappatoire de dépendance. Fermez complètement toutes les actions d’écriture de fichiers avant toute installation. Exécutez ensuite une seule et unique commande d’installation, exactement npm install --include=dev --no-audit --no-fund. N’exécutez aucune autre commande npm, pnpm, yarn ou bun qui ajoute, installe, initialise ou met à jour des paquets. Après cette installation unique, exécutez dans cet ordre npm run typecheck, npm run build, puis npm run dev comme dernière action shell ; n’écrivez plus de fichier et ne relancez aucune installation après le démarrage.'
    : ' Mandatory ordered package contract. Your very first file action must create the root package.json. It may contain only the top-level keys name, version, private, type, scripts, dependencies, devDependencies, overrides, and allowScripts. Choose a safe lowercase unscoped npm name and a safe semantic version string; private must equal true and type must equal module. scripts must contain exactly dev = vite --host 0.0.0.0, typecheck = tsc --noEmit, build = tsc --noEmit && vite build, and preview = vite preview --host 0.0.0.0, with no other script. dependencies must contain exactly react = 18.3.1 and react-dom = 18.3.1. devDependencies must contain exactly @types/react = 18.3.23, @types/react-dom = 18.3.7, typescript = 5.9.3, and vite = 5.4.21. overrides must contain exactly esbuild = 0.21.5. allowScripts must contain exactly esbuild@0.21.5 = true. Every version is literal: no ^, ~, tag, URL, file, git, or workspace protocol. Add no other dependency, top-level key, packageManager or workspaces configuration, lifecycle hook, alternate package manager, or dependency escape. Completely close every file-write action before any installation. Then run one and only one install command, exactly npm install --include=dev --no-audit --no-fund. Run no other npm, pnpm, yarn, or bun command that adds, installs, initializes, or updates packages. After that single installation, run npm run typecheck, npm run build, then npm run dev in that order as the final shell action; do not write another file or rerun installation after starting.';
}
