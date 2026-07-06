import { describe, expect, it } from 'vitest';
import { synthesizeMissingBarrels } from './barrel-synthesis';

describe('synthesizeMissingBarrels', () => {
  it('creates a barrel for a directory imported without an index (the blank-app bug)', () => {
    const barrels = synthesizeMissingBarrels({
      'src/App.tsx':
        "import { CityInput, Forecast } from './components';\nexport default function App() { return null; }",
      'src/components/CityInput.tsx': 'export function CityInput() { return null; }',
      'src/components/Forecast.tsx': 'export function Forecast() { return null; }',
    });

    expect(barrels).toHaveLength(1);
    expect(barrels[0].path).toBe('src/components/index.ts');
    expect(barrels[0].content).toContain("export * from './CityInput';");
    expect(barrels[0].content).toContain("export * from './Forecast';");
  });

  it('also re-exports the default as a named export (works with `export default`)', () => {
    const barrels = synthesizeMissingBarrels({
      'src/App.tsx': "import { CityInput } from './components';",
      'src/components/CityInput.tsx': 'export default function CityInput() { return null; }',
    });

    expect(barrels[0].content).toContain("export * from './CityInput';");
    expect(barrels[0].content).toContain("export { default as CityInput } from './CityInput';");
  });

  it('does NOT create a barrel when the directory already has an index', () => {
    const barrels = synthesizeMissingBarrels({
      'src/App.tsx': "import { CityInput } from './components';",
      'src/components/index.ts': "export * from './CityInput';",
      'src/components/CityInput.tsx': 'export function CityInput() {}',
    });

    expect(barrels).toHaveLength(0);
  });

  it('ignores concrete file imports and third-party packages', () => {
    const barrels = synthesizeMissingBarrels({
      'src/App.tsx': "import App from './App';\nimport React from 'react';\nimport { store } from './store';",
      'src/store.ts': 'export const store = {};',
    });

    // './store' is a FILE (src/store.ts), 'react' is external, './App' is self → no barrels.
    expect(barrels).toHaveLength(0);
  });

  it('only re-exports direct children, not nested modules or tests', () => {
    const barrels = synthesizeMissingBarrels({
      'src/App.tsx': "import { Button } from './ui';",
      'src/ui/Button.tsx': 'export function Button() {}',
      'src/ui/Button.spec.tsx': 'it("x", () => {});',
      'src/ui/internal/Helper.tsx': 'export function Helper() {}',
    });

    expect(barrels).toHaveLength(1);
    expect(barrels[0].content).toContain("export * from './Button';");
    expect(barrels[0].content).not.toContain('Helper');
    expect(barrels[0].content).not.toContain('Button.spec');
    expect(barrels[0].content).not.toContain('internal');
  });

  it('resolves parent-relative directory imports (../models)', () => {
    const barrels = synthesizeMissingBarrels({
      'src/features/weather.ts': "import { City } from '../models';",
      'src/models/City.ts': 'export interface City { name: string }',
    });

    expect(barrels).toHaveLength(1);
    expect(barrels[0].path).toBe('src/models/index.ts');
  });
});
