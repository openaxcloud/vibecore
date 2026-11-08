import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { capturePreviewCommandEvidence, commandEvidenceJson } from './preview-command-evidence';

function fakePage(text: string, visible = false, fail = false) {
  const click = vi.fn(async () => {
    if (fail) {
      throw new Error('Bearer secret-error-token https://private.invalid');
    }
  });

  const innerText = vi.fn(async () => text);

  const panel = {
    isVisible: vi.fn(async () => visible),
    getByRole: vi.fn(() => ({ click })),
    locator: vi.fn(() => ({ innerText })),
  };

  const page = { locator: vi.fn(() => panel), getByTitle: vi.fn(() => ({ click })) };

  return { page: page as unknown as Page, panel, click, innerText };
}

async function capture(fake: ReturnType<typeof fakePage>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'runtime-command-evidence-'));

  try {
    const file = path.join(directory, 'output.json');
    await capturePreviewCommandEvidence(fake.page, file);

    return JSON.parse(await readFile(file, 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('preview command evidence', () => {
  it('captures existing server output with exact bounded UI actions', async () => {
    const fake = fakePage('npm error: fixture failure');
    expect(await capture(fake)).toEqual({ available: true, truncated: false, output: 'npm error: fixture failure' });
    expect(fake.page.getByTitle).toHaveBeenCalledWith('Webview logs', { exact: true });
    expect(fake.panel.getByRole).toHaveBeenCalledWith('tab', { name: 'Server logs', exact: true });
    expect(fake.click).toHaveBeenCalledTimes(2);
    expect(fake.click).toHaveBeenCalledWith({ timeout: 2_000 });
    expect(fake.innerText).toHaveBeenCalledWith({ timeout: 2_000 });
  });

  it('does not toggle an already visible panel closed', async () => {
    const fake = fakePage('ready', true);
    expect((await capture(fake)).available).toBe(true);
    expect(fake.page.getByTitle).not.toHaveBeenCalled();
  });

  it('records missing UI without arbitrary caught error text', async () => {
    const fake = fakePage('', false, true);
    expect(await capture(fake)).toEqual({ available: false });
    expect(fake.innerText).not.toHaveBeenCalled();
  });

  it('redacts generated secrets and credential-shaped command errors', () => {
    const result = commandEvidenceJson('npm error generated-secret Bearer auth-secret ?token=query-secret', [
      'generated-secret',
    ]);
    expect(result).not.toContain('generated-secret');
    expect(result).not.toContain('auth-secret');
    expect(result).not.toContain('query-secret');
    expect(result).toContain('npm error');
    expect(result).toContain('[REDACTED]');
  });

  it('bounds serialized UTF-8 JSON after redaction and preserves the output tail', () => {
    const result = commandEvidenceJson('\n"😀'.repeat(40_000) + ' generated-secret final error', ['generated-secret']);
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(64 * 1024);
    expect(JSON.parse(result).truncated).toBe(true);
    expect(JSON.parse(result).output).toMatch(/\[REDACTED\] final error$/);
    expect(result).not.toContain('generated-secret');
  });
});
