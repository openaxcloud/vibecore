/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMPORT_HUB_SOURCE_IDS,
  ImportHub,
  createImportRequestFingerprint,
  type ImportHubOperation,
  type ImportHubRequest,
  type ImportHubValidation,
} from './ImportHub';

afterEach(cleanup);

function request(overrides: Partial<ImportHubRequest> = {}): ImportHubRequest {
  return {
    source: 'github',
    projectName: 'Customer portal',
    sourceUrl: 'https://github.com/acme/customer-portal',
    ...overrides,
  };
}

function validationFor(importRequest: ImportHubRequest): ImportHubValidation {
  return {
    requestFingerprint: createImportRequestFingerprint(importRequest),
    runtime: {
      label: 'Node.js 24 · Vite',
      confidence: 'high',
      startCommand: 'pnpm dev',
    },
    missingSecretNames: ['STRIPE_SECRET_KEY', 'DATABASE_URL'],
    generatedConfigFiles: ['vite.config.ts', '.env.example'],
    preview: {
      title: importRequest.projectName,
      description: 'A validated application preview.',
      fileCount: 42,
      entrypoint: 'src/main.tsx',
      url: 'https://preview.local/validation/customer-portal',
    },
    warnings: ['Database rows are excluded and a new isolated database will be provisioned.'],
  };
}

function readyOperation(importRequest: ImportHubRequest): ImportHubOperation {
  const validation = validationFor(importRequest);

  return {
    phase: 'ready',
    requestFingerprint: validation.requestFingerprint,
    validation,
  };
}

function renderHub(props: Partial<React.ComponentProps<typeof ImportHub>> = {}) {
  const onValidate = props.onValidate ?? vi.fn();
  const onCreate = props.onCreate ?? vi.fn();

  const result = render(<ImportHub onValidate={onValidate} onCreate={onCreate} {...props} />);

  return { ...result, onValidate, onCreate };
}

describe('ImportHub source catalog', () => {
  it('exposes the 12 required sources and never treats screenshots as an import provider', () => {
    renderHub();

    const sourceButtons = document.querySelectorAll<HTMLButtonElement>('[data-import-source]');
    expect(sourceButtons).toHaveLength(12);
    expect([...sourceButtons].map((button) => button.dataset.importSource)).toEqual(IMPORT_HUB_SOURCE_IDS);

    for (const label of [
      'GitHub',
      'Bitbucket',
      'Vercel',
      'Figma',
      'Claude',
      'Bolt',
      'Lovable',
      'Base44',
      'ZIP',
      'Spreadsheet',
      'Previous Agent export',
      'Empty',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy();
    }

    expect(screen.queryByText(/screenshot/i)).toBeNull();
    expect(screen.getByText('Secrets and database values are never imported')).toBeTruthy();
  });
});

describe('ImportHub validation contract', () => {
  it('validates a GitHub express URL through the real callback before creation is available', () => {
    const onValidate = vi.fn();
    renderHub({ onValidate });

    const validateButton = screen.getByRole('button', { name: 'Validate import' });
    const createButton = screen.getByRole('button', { name: 'Create project' });

    expect((validateButton as HTMLButtonElement).disabled).toBe(true);
    expect((createButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Express import' } });
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://replit.com/github.com/openaxcloud/vibecore' },
    });

    expect((validateButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(validateButton);

    expect(onValidate).toHaveBeenCalledWith({
      source: 'github',
      projectName: 'Express import',
      sourceUrl: 'https://replit.com/github.com/openaxcloud/vibecore',
    });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows runtime, secret names, generated config and preview only for the exact validated request', () => {
    const importRequest = request();
    const onCreate = vi.fn();

    const { rerender } = renderHub({
      initialProjectName: importRequest.projectName,
      initialSourceUrl: importRequest.sourceUrl,
      operation: readyOperation(importRequest),
      onCreate,
    });

    const preview = screen.getByTestId('import-validation-preview');
    expect(within(preview).getByText('Node.js 24 · Vite')).toBeTruthy();
    expect(within(preview).getByText('STRIPE_SECRET_KEY, DATABASE_URL')).toBeTruthy();
    expect(within(preview).getByText('vite.config.ts, .env.example')).toBeTruthy();
    expect(within(preview).getByText('42 files')).toBeTruthy();
    expect(within(preview).getByTitle('Customer portal validation preview').getAttribute('src')).toBe(
      'https://preview.local/validation/customer-portal',
    );
    expect(within(preview).getByTitle('Customer portal validation preview').getAttribute('sandbox')).not.toContain(
      'allow-same-origin',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(onCreate).toHaveBeenCalledWith(importRequest, validationFor(importRequest));

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Changed after validation' } });
    expect(screen.queryByTestId('import-validation-preview')).toBeNull();
    expect((screen.getByRole('button', { name: 'Create project' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ImportHub
        initialProjectName={importRequest.projectName}
        initialSourceUrl={importRequest.sourceUrl}
        operation={readyOperation(importRequest)}
        onValidate={vi.fn()}
        onCreate={onCreate}
      />,
    );
    expect((screen.getByRole('button', { name: 'Create project' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('passes a real spreadsheet File to validation and explains Agent credit usage', () => {
    const onValidate = vi.fn();
    renderHub({ onValidate, initialProjectName: 'Inventory app' });

    fireEvent.click(screen.getByRole('button', { name: /^Spreadsheet/ }));

    const file = new File(['sku,stock\nA-1,4'], 'inventory.csv', { type: 'text/csv', lastModified: 1_750_000_000 });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(screen.getByText('inventory.csv')).toBeTruthy();
    expect(screen.getByText(/Agent work consumes credits/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Validate import' }));

    expect(onValidate).toHaveBeenCalledWith({
      source: 'spreadsheet',
      projectName: 'Inventory app',
      file,
    });
  });

  it('keeps Empty as a direct no-Agent, no-framework path', () => {
    const onValidate = vi.fn();
    renderHub({ onValidate });

    fireEvent.click(screen.getByRole('button', { name: /^Empty/ }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Blank workspace' } });

    expect(screen.getByText('Direct creation')).toBeTruthy();
    expect(screen.getByText(/No Agent, framework, dependencies, or scaffolding/)).toBeTruthy();
    expect(screen.queryByText(/Agent work consumes credits/i)).toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Validate import' }));
    expect(onValidate).toHaveBeenCalledWith({ source: 'empty', projectName: 'Blank workspace' });
  });
});

describe('ImportHub recoverability and progress', () => {
  it('keeps the validated review visible and locks duplicate submission while creating', () => {
    const importRequest = request();
    const ready = readyOperation(importRequest);

    renderHub({
      initialProjectName: importRequest.projectName,
      initialSourceUrl: importRequest.sourceUrl,
      operation: {
        ...ready,
        phase: 'creating',
        progress: [
          { id: 'validate', label: 'Validate source', status: 'complete' },
          { id: 'runtime', label: 'Detect runtime and configuration', status: 'complete' },
          { id: 'create', label: 'Create isolated project', status: 'active' },
        ],
      },
    });

    expect(screen.getByTestId('import-validation-preview')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Creating project…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('import-hub').getAttribute('aria-busy')).toBe('true');
  });

  it('renders externally supplied structured progress and delegates a recoverable retry', () => {
    const importRequest = request();
    const fingerprint = createImportRequestFingerprint(importRequest);
    const onRetry = vi.fn();

    renderHub({
      initialProjectName: importRequest.projectName,
      initialSourceUrl: importRequest.sourceUrl,
      onRetry,
      operation: {
        phase: 'failed',
        requestFingerprint: fingerprint,
        error: {
          title: 'Repository access expired',
          message: 'Reconnect the provider and retry without losing the validated request.',
          recoverable: true,
        },
        progress: [
          { id: 'validate', label: 'Validate source', status: 'complete' },
          { id: 'runtime', label: 'Detect runtime', status: 'complete' },
          { id: 'config', label: 'Generate configuration', detail: 'Provider access expired.', status: 'error' },
          { id: 'preview', label: 'Build preview', status: 'pending' },
        ],
      },
    });

    expect(screen.getByRole('alert').textContent).toContain('Repository access expired');

    const progress = screen.getByRole('list', { name: 'Import progress' });
    expect(within(progress).getAllByRole('listitem')).toHaveLength(4);
    expect(within(progress).getByText('Provider access expired.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry import' }));
    expect(onRetry).toHaveBeenCalledWith(importRequest);
  });
});
