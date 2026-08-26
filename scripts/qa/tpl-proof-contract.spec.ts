import { describe, expect, it } from 'vitest';
import {
  assertIbanWasMasked,
  assertQaProjectIdentity,
  loadTplProofConfig,
  tplProofProdAck,
} from './tpl-proof-contract.js';

const validLocalEnv = {
  TPL_PROOF_RUN: '1',
  TPL_PROOF_TARGET: 'local',
  TPL_PROOF_RUN_ID: 'run-20260826',
  PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:5173',
  PLAYWRIGHT_API_URL: 'http://127.0.0.1:3001',
  TPL_PROOF_USER_EMAIL: 'qa@example.test',
  TPL_PROOF_USER_PASSWORD: 'secret',
  TPL_PROOF_USER_ORG_ID: 'organization_qa_123',
  TPL_PROOF_REMIX_SLUG: 'proof-app',
  TPL_PROOF_REMIX_READY_SELECTOR: '[data-proof="ready"]',
  TPL_PROOF_REMIX_ACTION_SELECTOR: '[data-proof="action"]',
  TPL_PROOF_REMIX_RESULT_SELECTOR: '[data-proof="result"]',
  TPL_PROOF_REMIX_INITIAL_RESULT_TEXT: '0',
  TPL_PROOF_REMIX_RESULT_TEXT: '1',
} as const;

describe('TPL proof opt-in guard', () => {
  it('refuses discovery unless the destructive proof is explicitly enabled', () => {
    expect(() => loadTplProofConfig({})).toThrow(/TPL_PROOF_RUN=1/);
  });

  it('refuses a remote origin when the operator selected local', () => {
    expect(() => loadTplProofConfig({ ...validLocalEnv, PLAYWRIGHT_BASE_URL: 'https://app.e-code.ai' })).toThrow(
      /local target only accepts/,
    );
  });

  it('refuses an origin input that silently includes an application path', () => {
    expect(() => loadTplProofConfig({ ...validLocalEnv, PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:5173/app' })).toThrow(
      /credential-free HTTP\(S\) origin/,
    );
  });

  it('refuses production without the exact destructive-run acknowledgement', () => {
    expect(() =>
      loadTplProofConfig({
        ...validLocalEnv,
        TPL_PROOF_TARGET: 'prod',
        PLAYWRIGHT_BASE_URL: 'https://app.e-code.ai',
        PLAYWRIGHT_API_URL: 'https://api.e-code.ai',
        TPL_PROOF_INCLUDE_IBAN: '0',
      }),
    ).toThrow(/TPL_PROOF_PROD_ACK/);
  });

  it('requires explicit admin and source-fixture inputs in IBAN mode', () => {
    expect(() => loadTplProofConfig({ ...validLocalEnv, TPL_PROOF_INCLUDE_IBAN: '1' })).toThrow(
      /TPL_PROOF_IBAN_SOURCE_PROJECT_ID/,
    );
  });

  it('does not accept an IBAN fixture without explicit admin credentials', () => {
    expect(() =>
      loadTplProofConfig({
        ...validLocalEnv,
        TPL_PROOF_INCLUDE_IBAN: '1',
        TPL_PROOF_IBAN_SOURCE_PROJECT_ID: 'project_fixture_123',
        TPL_PROOF_IBAN_SOURCE_PROJECT_NAME: 'IBAN fixture',
        TPL_PROOF_IBAN_SLUG: 'iban-fixture',
        TPL_PROOF_IBAN_FULL_VALUE: 'FR76 3000 6000 0112 3456 7890 189',
        TPL_PROOF_IBAN_TRAILING_FRAGMENT: '189',
        TPL_PROOF_IBAN_SAFE_MARKER: 'TPL_IBAN_FIXTURE',
      }),
    ).toThrow(/TPL_PROOF_ADMIN_EMAIL/);
  });

  it('accepts a fully explicit production contract without inventing credentials', () => {
    const config = loadTplProofConfig({
      ...validLocalEnv,
      TPL_PROOF_TARGET: 'prod',
      PLAYWRIGHT_BASE_URL: 'https://app.e-code.ai',
      PLAYWRIGHT_API_URL: 'https://api.e-code.ai',
      TPL_PROOF_PROD_ACK: tplProofProdAck,
      TPL_PROOF_INCLUDE_IBAN: '0',
    });

    expect(config.target).toBe('prod');
    expect(config.iban).toBeUndefined();
    expect(config.projectPrefix).toBe('tpl-proof-run-20260826');
  });

  it('accepts IBAN mode only with the complete production admin contract', () => {
    const config = loadTplProofConfig({
      ...validLocalEnv,
      TPL_PROOF_TARGET: 'prod',
      PLAYWRIGHT_BASE_URL: 'https://app.e-code.ai',
      PLAYWRIGHT_API_URL: 'https://api.e-code.ai',
      TPL_PROOF_PROD_ACK: tplProofProdAck,
      TPL_PROOF_INCLUDE_IBAN: '1',
      TPL_PROOF_ADMIN_EMAIL: 'admin@example.test',
      TPL_PROOF_ADMIN_PASSWORD: 'admin-secret',
      TPL_PROOF_IBAN_SOURCE_PROJECT_ID: 'project_fixture_123',
      TPL_PROOF_IBAN_SOURCE_PROJECT_NAME: 'IBAN fixture',
      TPL_PROOF_IBAN_SLUG: 'iban-fixture',
      TPL_PROOF_IBAN_FULL_VALUE: 'FR76 3000 6000 0112 3456 7890 189',
      TPL_PROOF_IBAN_TRAILING_FRAGMENT: '189',
      TPL_PROOF_IBAN_SAFE_MARKER: 'TPL_IBAN_FIXTURE',
    });

    expect(config.iban?.adminEmail).toBe('admin@example.test');
    expect(config.iban?.sourceProjectId).toBe('project_fixture_123');
  });

  it('refuses an owner self-remix as an IBAN masking proof', () => {
    expect(() =>
      loadTplProofConfig({
        ...validLocalEnv,
        TPL_PROOF_INCLUDE_IBAN: '1',
        TPL_PROOF_ADMIN_EMAIL: validLocalEnv.TPL_PROOF_USER_EMAIL,
        TPL_PROOF_ADMIN_PASSWORD: 'admin-secret',
        TPL_PROOF_IBAN_SOURCE_PROJECT_ID: 'project_fixture_123',
        TPL_PROOF_IBAN_SOURCE_PROJECT_NAME: 'IBAN fixture',
        TPL_PROOF_IBAN_SLUG: 'iban-fixture',
        TPL_PROOF_IBAN_FULL_VALUE: 'FR76 3000 6000 0112 3456 7890 189',
        TPL_PROOF_IBAN_TRAILING_FRAGMENT: '189',
        TPL_PROOF_IBAN_SAFE_MARKER: 'TPL_IBAN_FIXTURE',
      }),
    ).toThrow(/must be distinct accounts/);
  });
});

describe('TPL proof destructive-scope guard', () => {
  const project = {
    id: 'project_qa_123',
    organizationId: 'organization_qa_123',
    name: 'tpl-proof-run-20260826-import',
    sourceType: 'zip',
    createdAt: '2026-08-26T10:00:01.000Z',
  };

  it('accepts only an identity created by the active flow', () => {
    expect(() =>
      assertQaProjectIdentity(project, {
        organizationId: 'organization_qa_123',
        sourceType: 'zip',
        startedAtMs: Date.parse('2026-08-26T10:00:00.000Z'),
        name: { exact: project.name },
      }),
    ).not.toThrow();
  });

  it('fails closed on a pre-existing or differently sourced project', () => {
    expect(() =>
      assertQaProjectIdentity(
        { ...project, sourceType: 'blank', createdAt: '2026-08-25T10:00:00.000Z' },
        {
          organizationId: project.organizationId,
          sourceType: 'zip',
          startedAtMs: Date.parse('2026-08-26T10:00:00.000Z'),
          name: { exact: project.name },
        },
      ),
    ).toThrow(/cleanup refused/);
  });
});

describe('TPL-02.6 IBAN before/after proof', () => {
  const fullIban = 'FR76 3000 6000 0112 3456 7890 189';
  const safeMarker = 'TPL_IBAN_FIXTURE_20260826';

  it('requires the real source value, an explicit mask marker, and no terminal fragment', () => {
    expect(() =>
      assertIbanWasMasked({
        sourceText: `${safeMarker}\n${fullIban}`,
        cloneText: `${safeMarker}\n[PII:iban masked on remix]`,
        fullIban,
        trailingFragment: '189',
        safeMarker,
      }),
    ).not.toThrow();
  });

  it('rejects the old partial-mask failure where the terminal group survives', () => {
    expect(() =>
      assertIbanWasMasked({
        sourceText: `${safeMarker}\n${fullIban}`,
        cloneText: `${safeMarker}\n[PII:iban masked on remix] 189`,
        fullIban,
        trailingFragment: '189',
        safeMarker,
      }),
    ).toThrow(/terminal IBAN fragment survived/);
  });

  it('rejects a false positive whose source never contained the asserted IBAN', () => {
    expect(() =>
      assertIbanWasMasked({
        sourceText: safeMarker,
        cloneText: `${safeMarker}\n[PII:iban masked on remix]`,
        fullIban,
        trailingFragment: '189',
        safeMarker,
      }),
    ).toThrow(/source export does not contain/);
  });
});
