import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { compile } from 'sass-embedded';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/* The real CI detector measures visible controls; do not replace it with a class-name assertion. */
const path = join(__dirname, '../../tests/e2e/agent-panel-states.spec.ts');
const source = readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const detectors: ts.ArrowFunction[] = [];

function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'evaluate'
  ) {
    const argument = node.arguments[0];

    if (
      argument &&
      ts.isArrowFunction(argument) &&
      argument.getText(ast).includes('getBoundingClientRect') &&
      argument.getText(ast).includes('ide-agent-panel')
    ) {
      detectors.push(argument);
    }
  }

  ts.forEachChild(node, visit);
}

visit(ast);

const executable = chromium.executablePath();

describe('menu de message : cible mesurée dans la feuille réellement compilée', () => {
  it('retrouve exactement le détecteur utilisé par les scénarios CI', () => {
    expect(detectors).toHaveLength(1);
    expect(detectors[0].getText(ast)).toContain('button, a[href], summary');
  });

  it.skipIf(!existsSync(executable))('atteint le plancher sur mobile/tablette et garde la densité bureau', async () => {
    const css = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css;

    const javascript = ts.transpileModule(`const detector = ${detectors[0].getText(ast)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;

    const browser = await chromium.launch({ headless: true });

    try {
      for (const width of [390, 768, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 500 } });

        try {
          await page.setContent(`<style>${css}</style><section data-testid="ide-agent-panel">
            <div class="bolt-chat-message-row"><div class="bolt-assistant-message">
              <button class="bolt-message-menu-trigger" aria-label="Message actions">⋯</button>
              <p>Message de la fixture</p>
            </div></div></section>`);
          await page.locator('button').focus();
          await page.waitForTimeout(150);

          const measurements = await page.evaluate<Array<{ w: number; h: number; nom: string }> | null>(
            `(() => { ${javascript} return detector(); })()`,
          );
          expect(measurements, 'témoin positif du même sélecteur et de la même géométrie').toHaveLength(1);

          if (width <= 1024) {
            expect(measurements!.filter((control) => control.w < 44 || control.h < 44)).toEqual([]);
          } else {
            expect(measurements![0].w).toBe(28);
            expect(measurements![0].h).toBe(28);
          }
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  });
});
