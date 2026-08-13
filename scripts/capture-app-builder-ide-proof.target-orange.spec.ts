import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

type TargetOrangeAuditFixture = {
  colorMatchesParent: boolean;
  disabled: boolean;
  effectivelyVisible: boolean;
  enabled: boolean;
  focused: boolean;
  inViewport: boolean;
  orange: boolean;
  ownOrangeProperties: string[];
  unoccluded: boolean;
  visible: boolean;
};

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

function targetOrangeAuditExpression() {
  const match = captureSource.match(/const TARGET_ORANGE_AUDIT_EXPRESSION = `([\s\S]*?)`;/u);

  if (!match?.[1]) {
    throw new Error('Unable to read TARGET_ORANGE_AUDIT_EXPRESSION from the capture harness');
  }

  return match[1].replaceAll('\\`', '`').replaceAll('\\${', '${');
}

describe.sequential('exact target orange proof', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function auditTarget() {
    const expression = targetOrangeAuditExpression();

    const browserFunction = new Function('element', `return (${expression})(element);`) as (
      element: unknown,
    ) => TargetOrangeAuditFixture;

    return page.locator('#target').evaluate<TargetOrangeAuditFixture>(browserFunction);
  }

  it('accepts a normal-state orange property rendered directly by the exact target', async () => {
    await page.setContent(`
      <style>body{margin:0}#target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(249,115,22);color:white;border:0}</style>
      <button id="target">Apply filters</button>
    `);

    const audit = await auditTarget();

    expect(audit).toMatchObject({
      colorMatchesParent: false,
      disabled: false,
      effectivelyVisible: true,
      enabled: true,
      focused: false,
      inViewport: true,
      orange: true,
      unoccluded: true,
      visible: true,
    });
    expect(audit.ownOrangeProperties).toContain('backgroundColor');
  });

  it.each([
    {
      name: 'parent-only',
      markup: `
        <style>body{margin:0;color:rgb(249,115,22)}#target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(37,99,235);color:inherit;border:0}</style>
        <button id="target">Apply filters</button>
      `,
    },
    {
      name: 'child-only',
      markup: `
        <style>body{margin:0}#target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(37,99,235);color:white;border:0}#target span{color:rgb(249,115,22)}</style>
        <button id="target"><span>Apply filters</span></button>
      `,
    },
    {
      name: 'pseudo-only',
      markup: `
        <style>body{margin:0}#target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(37,99,235);color:white;border:0}#target::before{content:'';display:block;width:20px;height:20px;background:rgb(249,115,22)}</style>
        <button id="target">Apply filters</button>
      `,
    },
  ])('rejects $name orange decoration', async ({ markup, name }) => {
    await page.setContent(markup);

    const audit = await auditTarget();

    expect(audit.orange, name).toBe(false);
    expect(audit.ownOrangeProperties, name).toEqual([]);
  });

  it('records viewport, occlusion, disabled, and focus failures before the click', async () => {
    await page.setContent(`
      <style>
        body{margin:0}
        #target{position:absolute;left:1600px;top:100px;width:200px;height:48px;background:rgb(249,115,22);color:white;border:0}
      </style>
      <button id="target">Apply filters</button>
    `);
    expect((await auditTarget()).inViewport).toBe(false);

    await page.setContent(`
      <style>
        body{margin:0}
        #target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(249,115,22);color:white;border:0}
        #cover{position:absolute;z-index:2;left:100px;top:100px;width:200px;height:48px;background:black}
      </style>
      <button id="target">Apply filters</button><div id="cover"></div>
    `);
    expect((await auditTarget()).unoccluded).toBe(false);

    await page.setContent(`
      <style>body{margin:0}#target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(249,115,22);color:white;border:0}</style>
      <button id="target" disabled>Apply filters</button>
    `);
    expect(await auditTarget()).toMatchObject({ disabled: true, enabled: false });

    await page.setContent(`
      <style>
        body{margin:0}
        #target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(37,99,235);color:white;border:0}
        #target:hover{background:rgb(249,115,22)}
      </style>
      <button id="target">Apply filters</button>
    `);
    await page.locator('#target').hover();
    expect((await auditTarget()).orange).toBe(true);

    await page.mouse.move(-10, -10);
    expect(await auditTarget()).toMatchObject({ focused: false, orange: false });

    await page.setContent(`
      <style>
        body{margin:0}
        #target{position:absolute;left:100px;top:100px;width:200px;height:48px;background:rgb(37,99,235);color:white;border:0}
        #target:focus{background:rgb(249,115,22)}
      </style>
      <button id="target">Apply filters</button>
    `);
    await page.locator('#target').focus();
    expect(await auditTarget()).toMatchObject({ focused: true, orange: true });
  });

  it('wires every negative state into the fail-closed pre-click branch', () => {
    const scenarioSource = captureSource.slice(
      captureSource.indexOf('async function verifyScenarioPreview'),
      captureSource.indexOf('\nasync function verifyScenarioIdentity'),
    );

    const auditIndex = scenarioSource.indexOf('const targetOrangeAudit = await target.evaluate');
    const pointerResetIndex = scenarioSource.indexOf('await pointerPage.mouse.move(-10, -10)');
    const clickIndex = scenarioSource.indexOf('await target.click()');

    expect(pointerResetIndex).toBeGreaterThan(0);
    expect(auditIndex).toBeGreaterThan(pointerResetIndex);
    expect(auditIndex).toBeGreaterThan(0);
    expect(clickIndex).toBeGreaterThan(auditIndex);

    for (const gate of [
      '!targetOrangeAudit.visible',
      '!targetOrangeAudit.effectivelyVisible',
      '!targetOrangeAudit.inViewport',
      '!targetOrangeAudit.unoccluded',
      '!targetOrangeAudit.enabled',
      'targetOrangeAudit.disabled',
      'targetOrangeAudit.focused',
      '!targetOrangeAudit.orange',
    ]) {
      expect(scenarioSource, gate).toContain(gate);
    }
  });
});
