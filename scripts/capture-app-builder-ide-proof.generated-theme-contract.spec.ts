import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

const sourceSection = (start: string, end: string) => {
  const startIndex = captureSource.indexOf(start);
  const endIndex = captureSource.indexOf(end, startIndex);

  expect(startIndex, `missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing source marker: ${end}`).toBeGreaterThan(startIndex);

  return captureSource.slice(startIndex, endIndex);
};

describe('generated Solutions project theme contract', () => {
  const contractSource = sourceSection(
    'function generatedAppThemeContractFor',
    '\nfunction generatedOrangeActionContractFor',
  );
  const orangeActionContractSource = sourceSection(
    'function generatedOrangeActionContractFor',
    '\nfunction creationPromptFor',
  );

  const creationPromptSource = sourceSection('function creationPromptFor', '\nfunction repairPromptFor');
  const themeRepairPromptSource = sourceSection('function themeRepairPromptFor', '\nfunction escapedPattern');
  const gameScenarioSource = sourceSection("  'game-builder': {", "  'dashboard-builder': {");

  it('adds the common contract to every EN and FR creation prompt', () => {
    expect(creationPromptSource).toContain('const appThemeContract = generatedAppThemeContractFor(locale, scenario);');
    expect(creationPromptSource).toContain(
      'const orangeActionContract = generatedOrangeActionContractFor(locale, scenario);',
    );
    expect(creationPromptSource).toContain(
      '`${scenario.prompt}${interactionContract}${authenticityContract}${orangeActionContract}${appThemeContract}${runtimeContract}`',
    );

    expect(contractSource).toContain('two complete, genuinely distinct application themes, light and dark');
    expect(contractSource).toContain('deux thèmes applicatifs complets et réellement distincts, clair et sombre');
    expect(contractSource).toContain('light backgrounds with dark text in light mode');
    expect(contractSource).toContain('fonds clairs et texte sombre en mode clair');
    expect(contractSource).toContain('Never fake the variant by inverting, filtering, recoloring');
    expect(contractSource).toContain('Ne simulez jamais la variante en inversant, filtrant, recolorant');
  });

  it('requires the named scenario interaction to be an enabled orange action on first render', () => {
    expect(orangeActionContractSource).toContain('const { name, role } = scenario.interaction;');
    expect(orangeActionContractSource).toContain('whose exact accessible name is “${name}”');
    expect(orangeActionContractSource).toContain('dont le nom accessible exact est « ${name} »');
    expect(orangeActionContractSource).toContain('inside the initial viewport, visible, enabled');
    expect(orangeActionContractSource).toContain('dans la fenêtre initiale, être visible, activée');
    expect(orangeActionContractSource).toContain('computed CSS background-color, border-color, or color');
    expect(orangeActionContractSource).toContain('propriétés CSS calculées background-color, border-color ou color');
    expect(orangeActionContractSource).toContain('disabled state, or hover/focus-only style does not satisfy');
    expect(orangeActionContractSource).toContain('état désactivé, ou un style uniquement :hover/:focus');
    expect(orangeActionContractSource).toContain('at least one visible, enabled, usable orange action');
    expect(orangeActionContractSource).toContain('au moins une action orange visible, activée et utilisable');
    expect(orangeActionContractSource).toContain('WCAG AA');
  });

  it('requires system preference plus a real localized accessible application control', () => {
    expect(contractSource).toContain("window.matchMedia('(prefers-color-scheme: dark)').matches");
    expect(contractSource).toContain('button element with type="button" and data-testid="app-theme-toggle"');
    expect(contractSource).toContain('élément button avec type="button" et data-testid="app-theme-toggle"');
    expect(contractSource).not.toContain('<button type="button" data-testid="app-theme-toggle">');
    expect(contractSource).toContain('visible and keyboard accessible');
    expect(contractSource).toContain('visible et utilisable au clavier');
    expect(contractSource).toContain('Switch to light mode');
    expect(contractSource).toContain('Switch to dark mode');
    expect(contractSource).toContain('Passer en mode clair');
    expect(contractSource).toContain('Passer en mode sombre');
    expect(contractSource).toContain('visible text, aria-label, and title');
    expect(contractSource).toContain('texte visible, aria-label et title');
    expect(contractSource).toContain('document.documentElement.dataset.theme');
    expect(contractSource).toContain('to exactly light or dark');
    expect(contractSource).toContain('à exactement light ou dark');
    expect(contractSource).toContain('aria-pressed');
    expect(contractSource).toContain('aria-pressed to "true" while dark theme is active');
    expect(contractSource).toContain('"false" while light theme is active');
    expect(contractSource).toContain('aria-pressed à "true" lorsque le thème sombre est actif');
    expect(contractSource).toContain('"false" lorsque le thème clair est actif');
    expect(contractSource).toContain('desktop, tablet, and mobile');
    expect(contractSource).toContain('ordinateur, tablette et mobile');
  });

  it('keeps TriviaClash dark-first while requiring a coherent light arcade palette', () => {
    expect(gameScenarioSource).toContain('dark-first arcade art direction');
    expect(gameScenarioSource).toContain('coherent bright-arcade light palette');
    expect(gameScenarioSource).toContain('direction artistique arcade d’abord sombre');
    expect(gameScenarioSource).toContain('palette arcade claire lumineuse et cohérente');
    expect(gameScenarioSource).not.toContain('Use a dark arcade theme');
    expect(gameScenarioSource).not.toContain('Thème arcade sombre cyan');

    expect(contractSource).toContain('keep the dark palette as the primary arcade art direction');
    expect(contractSource).toContain('never force the dark canvas while light theme is active');
    expect(contractSource).toContain('gardez la palette sombre comme direction arcade principale');
    expect(contractSource).toContain('ne forcez jamais la surface sombre lorsque le thème clair est actif');
  });

  it('reapplies the full contract during a palette repair', () => {
    expect(themeRepairPromptSource).toContain(
      'const appThemeContract = generatedAppThemeContractFor(locale, scenario);',
    );
    expect(themeRepairPromptSource).toContain(
      'const orangeActionContract = generatedOrangeActionContractFor(locale, scenario);',
    );
    expect(themeRepairPromptSource).toContain('${darkCanvasInstruction}${orangeActionContract}${appThemeContract}');
    expect(themeRepairPromptSource).toContain('In dark mode, render the entire application');
    expect(themeRepairPromptSource).toContain('En mode sombre, affichez toute l’application');
    expect(themeRepairPromptSource).toContain('Verify both themes in the rendered Webview');
    expect(themeRepairPromptSource).toContain('Vérifiez les deux thèmes dans la Webview rendue');
  });
});
