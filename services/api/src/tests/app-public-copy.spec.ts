import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The repository scanner is an ESM build script without a TypeScript declaration file.
import { scanSource } from '../../../../scripts/i18n/source-scanner.mjs';
import {
  appPublicCopy,
  appPublicCopyKeys,
  localizeAppPublicErrorPayload,
  localizeAppPublicMessage,
  localizeAppValidationIssues,
  localizeCreditLedgerReason,
  type AppPublicCopyKey,
} from '../app-public-copy.js';

type Catalogue = Record<AppPublicCopyKey, { en: string; fr: string }>;

const cataloguePath = fileURLToPath(new URL('../app-public-copy.json', import.meta.url));
const appPath = fileURLToPath(new URL('../app.ts', import.meta.url));
const creditsServicePath = fileURLToPath(new URL('../credits-service.ts', import.meta.url));
const meteringServicePath = fileURLToPath(new URL('../metering-service.ts', import.meta.url));
const prismaStorePath = fileURLToPath(new URL('../prisma-store.ts', import.meta.url));
const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8')) as Catalogue;

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1] ?? '').sort();
}

const forbiddenFrenchGlossaryResidue =
  /\b(?:preview|logs?|marketplace|snapshots?|packages?|builds?|workspace|runtime|stack|starter|typecheck|full-stack|tokens?|tags?|tenants?)\b|feature flag/iu;

function withoutProtectedTechnicalIdentifiers(value: string): string {
  return value
    .replace(/\{[A-Za-z][A-Za-z0-9_]*\}/gu, '')
    .replace(/\bpackage\.json\b/giu, '')
    .replace(/\.ecode\/deploy\.json/gu, '');
}

describe('backend application copy catalogue', () => {
  it('provides non-empty EN/FR variants, unique English sources, and matching interpolation tokens', () => {
    const entries = Object.entries(catalogue) as Array<[AppPublicCopyKey, { en: string; fr: string }]>;

    expect(entries.length).toBeGreaterThanOrEqual(120);
    expect(appPublicCopyKeys()).toEqual(entries.map(([key]) => key));
    expect(new Set(entries.map(([, entry]) => entry.en)).size).toBe(entries.length);

    for (const [key, entry] of entries) {
      expect(entry.en.trim(), `${key}.en`).not.toBe('');
      expect(entry.fr.trim(), `${key}.fr`).not.toBe('');
      expect(placeholders(entry.fr), `${key} interpolation parity`).toEqual(placeholders(entry.en));
    }
  });

  it('keeps glossary-governed English terms out of French platform copy', () => {
    for (const [key, entry] of Object.entries(catalogue) as Array<[AppPublicCopyKey, { en: string; fr: string }]>) {
      expect(withoutProtectedTechnicalIdentifiers(entry.fr), `${key}.fr`).not.toMatch(forbiddenFrenchGlossaryResidue);
    }
  });

  it('interpolates French values while preserving code identifiers, brands, and URLs', () => {
    expect(appPublicCopy('VALIDATION_TOO_SMALL', 'fr', { minimum: 3 })).toBe(
      'La valeur doit respecter le minimum de 3.',
    );
    expect(appPublicCopy('OIDC_JWKS_UNAVAILABLE', 'fr')).toContain('id_token OIDC');
    expect(appPublicCopy('OIDC_JWKS_UNAVAILABLE', 'fr')).toContain('JWKS');
    expect(appPublicCopy('CONNECTOR_USE_BACKEND_GIT', 'fr')).toContain('/api/projects/:projectId/git/*');
    expect(appPublicCopy('SIEM_TEST_EVENT', 'fr')).toContain('E-Code');
  });

  it('keeps English contracts exact and never exposes an invalid catalogue key', () => {
    expect(appPublicCopy('PROJECT_NOT_FOUND', 'en')).toBe('Project not found');
    expect(appPublicCopy('GIT_INITIAL_COMMIT_MESSAGE', 'fr')).toBe('chore: initial scaffold');

    const invalid = appPublicCopy('DOES_NOT_EXIST' as AppPublicCopyKey, 'fr');
    expect(invalid).toBe('La requête n’a pas pu aboutir. Veuillez réessayer.');
    expect(invalid).not.toContain('DOES_NOT_EXIST');
  });
});

describe('backend application response localization', () => {
  it('localizes exact backend-owned messages without translating arbitrary user content', () => {
    expect(localizeAppPublicMessage('Project not found', 'fr')).toEqual({
      matched: true,
      value: 'Projet introuvable.',
    });
    expect(localizeAppPublicMessage('My project is called Project not found', 'fr')).toEqual({
      matched: false,
      value: 'My project is called Project not found',
    });
  });

  it('localizes only platform-owned credit ledger reasons and preserves operator copy', () => {
    expect(localizeCreditLedgerReason('workspace compute', 'CONSUMPTION', 'fr')).toBe('Calcul de l’espace de travail');
    expect(localizeCreditLedgerReason('deployment reserved-vm', 'CONSUMPTION', 'fr')).toBe('Déploiement reserved-vm');
    expect(localizeCreditLedgerReason('agent checkpoint (overdraw reversal)', 'CONSUMPTION', 'fr')).toBe(
      'Point de contrôle de l’agent (contrepassation du dépassement de solde)',
    );
    expect(localizeCreditLedgerReason('pro monthly grant', 'GRANT', 'fr')).toBe('Attribution mensuelle du forfait pro');
    expect(localizeCreditLedgerReason('workspace compute', 'ADJUSTMENT', 'fr')).toBe('workspace compute');
    expect(localizeCreditLedgerReason('Customer-requested correction', 'ADJUSTMENT', 'fr')).toBe(
      'Customer-requested correction',
    );
    expect(localizeCreditLedgerReason('custom metering label', 'CONSUMPTION', 'fr')).toBe('custom metering label');
  });

  it('localizes anchored interpolated backend copy while preserving technical values', () => {
    expect(
      localizeAppPublicMessage('Server deploy: ready at https://preview.example.test; active replicas: 2.', 'fr'),
    ).toEqual({
      matched: true,
      value: 'Déploiement serveur : prêt à l’adresse https://preview.example.test ; instances actives : 2.',
    });
    expect(
      localizeAppPublicMessage('Server deploy: ready with 1 replica(s) at https://legacy.example.test', 'fr'),
    ).toMatchObject({
      matched: true,
      value: 'Déploiement serveur : prêt à l’adresse https://legacy.example.test ; instances actives : 1.',
    });
    expect(localizeAppPublicMessage('User note: Server deploy ready', 'fr')).toEqual({
      matched: false,
      value: 'User note: Server deploy ready',
    });
  });

  it('localizes persisted deployment framing while preserving commands, paths, and user output', () => {
    expect(localizeAppPublicMessage('Static deploy: detected pnpm (lockfile-based)', 'fr')).toEqual({
      matched: true,
      value: 'Déploiement statique : pnpm détecté à partir du lockfile',
    });
    expect(
      localizeAppPublicMessage(
        'Workspace deploy: the build produced no dist/ output. Check the build command and output directory.',
        'fr',
      ),
    ).toEqual({
      matched: true,
      value:
        'Déploiement depuis l’espace de travail : la compilation n’a produit aucun contenu dans dist/. Vérifiez la commande de compilation et le répertoire de sortie.',
    });
    expect(localizeAppPublicMessage('[snapshot] uploaded 4096 bytes to object storage', 'fr')).toEqual({
      matched: true,
      value: '[instantané] 4096 octets envoyés vers le stockage d’objets',
    });
    expect(localizeAppPublicMessage('[build] User output stays English', 'fr')).toEqual({
      matched: false,
      value: '[build] User output stays English',
    });
  });

  it('localizes billing limits, Stripe signatures, and cluster-capacity alerts from indirect packages', () => {
    expect(localizeAppPublicMessage('Concurrent published-app limit reached (20).', 'fr')).toEqual({
      matched: true,
      value: 'La limite de 20 applications publiées simultanément est atteinte.',
    });
    expect(localizeAppPublicMessage('Quota exceeded for deployments.count', 'fr')).toEqual({
      matched: true,
      value: 'Le quota deployments.count est dépassé.',
    });
    expect(localizeAppPublicMessage('Le quota deployments.count est dépassé.', 'fr')).toEqual({
      matched: true,
      value: 'Le quota deployments.count est dépassé.',
    });
    expect(localizeAppPublicMessage('Invalid Stripe signature header', 'fr')).toEqual({
      matched: true,
      value: 'L’en-tête de signature Stripe est invalide.',
    });
    expect(localizeAppPublicMessage('Stripe request failed: 502', 'fr')).toEqual({
      matched: true,
      value: 'La requête Stripe a échoué (statut 502).',
    });
    expect(
      localizeAppPublicMessage(
        'Node pool "pool-a" is at 4/5 nodes (80% of the autoscaling max). Approaching the ceiling — consider raising the max node count.',
        'fr',
      ),
    ).toEqual({
      matched: true,
      value:
        'Le pool de nœuds « pool-a » utilise 4/5 nœuds (80 % du maximum d’autoscaling). Il approche de la limite ; envisagez d’augmenter le nombre maximal de nœuds.',
    });
    expect(
      localizeAppPublicMessage(
        'Reserved CPU on "pool-a" is 96% of allocatable — new workspaces may fail to schedule. Free idle workspaces or raise the autoscaling max.',
        'fr',
      ),
    ).toEqual({
      matched: true,
      value:
        'Le CPU réservé sur « pool-a » atteint 96 % de la capacité allouable ; la planification de nouveaux espaces de travail risque d’échouer. Libérez les espaces de travail inactifs ou augmentez le maximum d’autoscaling.',
    });
  });

  it('localizes platform-service failures while preserving safe technical values', () => {
    expect(localizeAppPublicMessage('The embedding request failed.', 'fr')).toEqual({
      matched: true,
      value: 'La requête de vectorisation a échoué.',
    });
    expect(
      localizeAppPublicMessage(
        'No TXT record was found at _vibecore.example.test. Add a TXT record with the value "vibecore-domain-verification=token", then try again after DNS propagation.',
        'fr',
      ),
    ).toEqual({
      matched: true,
      value:
        'Aucun enregistrement TXT n’a été trouvé sur _vibecore.example.test. Ajoutez un enregistrement TXT avec la valeur « vibecore-domain-verification=token », puis réessayez après la propagation DNS.',
    });
    expect(localizeAppPublicMessage('Timed out while waiting for the project lock for proj_1.', 'fr')).toEqual({
      matched: true,
      value: 'Le délai d’attente du verrou du projet proj_1 est dépassé.',
    });
    expect(localizeAppPublicMessage('[image] build build-1 queued (context gs://bucket/object.tgz)', 'fr')).toEqual({
      matched: true,
      value: '[image] compilation build-1 mise en file (contexte gs://bucket/object.tgz)',
    });
  });

  it('renders localized template onboarding without translating project and code identifiers', () => {
    expect(
      appPublicCopy('TEMPLATE_WELCOME_HEADING', 'fr', {
        projectName: 'Acme API',
        description: appPublicCopy('TEMPLATE_FASTIFY_API_DESCRIPTION', 'fr'),
      }),
    ).toBe(
      '👋 Bienvenue dans **Acme API** — une API Fastify + TypeScript de démarrage avec des routes d’exemple et de la validation.',
    );
    expect(appPublicCopy('TEMPLATE_REACT_SAAS_STEP_HERO', 'fr')).toContain('`src/App.tsx`');
    expect(appPublicCopy('SERVER_RUNTIME_NO_START_COMMAND', 'fr')).toContain('.ecode/deploy.json');
    expect(appPublicCopy('SERVER_RUNTIME_NO_START_COMMAND', 'fr')).toContain('"<command>"');
  });

  it('localizes nested error contracts and masks unknown nested technical errors in French', () => {
    expect(
      localizeAppPublicErrorPayload(
        { error: { code: 'SHARE_LINK_INVALID', message: 'Share link is invalid, expired, or revoked.' } },
        'fr',
      ),
    ).toEqual({
      handled: true,
      payload: {
        error: { code: 'SHARE_LINK_INVALID', message: 'Le lien de partage est invalide, expiré ou révoqué.' },
      },
    });

    const masked = localizeAppPublicErrorPayload(
      { error: { code: 'UPSTREAM_FAILURE', message: 'ECONNRESET from 10.0.0.12' }, requestId: 'req_1' },
      'fr',
    );
    expect(masked.payload).toEqual({
      error: {
        code: 'UPSTREAM_FAILURE',
        message: 'La requête n’a pas pu aboutir. Veuillez réessayer.',
      },
      requestId: 'req_1',
    });
  });

  it('localizes custom Zod messages and masks unknown issue text while preserving paths and limits', () => {
    expect(
      localizeAppValidationIssues(
        [
          {
            code: 'custom',
            path: ['company'],
            message: 'Provide a company (sales) or a topic (general contact).',
          },
          {
            code: 'too_small',
            path: ['name'],
            minimum: 2,
            message: 'Too small: expected string to have >=2 characters',
          },
        ],
        'fr',
      ),
    ).toEqual([
      {
        code: 'custom',
        path: ['company'],
        message: 'Indiquez une entreprise (ventes) ou un sujet (contact général).',
      },
      { code: 'too_small', path: ['name'], minimum: 2, message: 'La valeur doit respecter le minimum de 2.' },
    ]);

    expect(
      localizeAppValidationIssues(
        [{ code: 'custom', path: ['alias'], message: appPublicCopy('MCP_ALIAS_FORMAT_INVALID', 'en') }],
        'fr',
      ),
    ).toEqual([
      {
        code: 'custom',
        path: ['alias'],
        message: 'L’alias ne peut contenir que des lettres, des chiffres, des tirets et des traits de soulignement.',
      },
    ]);
  });
});

describe('app.ts i18n source guard', () => {
  it('leaves only exact internal codes, telemetry labels, and machine contracts', () => {
    const result = scanSource(readFileSync(appPath, 'utf8'), 'services/api/src/app.ts');
    const allowedInternalFindings = new Set([
      // Metrics/audit dimensions and reconciliation state codes; never rendered.
      'invalid_credentials',
      'mfa_required',
      'invalid_mfa',
      // Dimension de `auth_failures_total`, comme ses voisines : jamais rendue.
      // La réponse vue par l'utilisateur passe par le catalogue
      // (`AUTH_INVALID_CREDENTIALS`) et reste volontairement identique à celle
      // d'un mauvais mot de passe, pour ne pas révéler qu'un compte existe.
      'account_locked',
      'suspended',
      'sso_enforced',
      'token_expired_or_revoked',
      'agent-unreachable',
      'persisted-read-failed',
      'no-persisted-files',
      'already-synced',
      'reconciled-from-persisted',
      'missing_storage_key',
      'durable_archive_missing',
      'checksum_mismatch',
      'manager_failed',
      // Stable billing/policy identifiers consumed as machine data.
      'chat.completion',
      'chat.completion.{…}',
      'plan-allows-byok',
      'org-blocks-external-ai',
      'managed-mode-plan',
      // Internal deploy-manifest outcomes are discarded before the public response.
      'Open the project workspace before deploying.',
      'Workspace is starting — please retry.',
      /*
       * P0-V3-09 — motifs internes de la machine à états du checkpoint. Écrits
       * dans `ProjectCheckpoint.error` ou portés par une Error typée dont le
       * CODE (CHECKPOINT_INADMISSIBLE, CHECKPOINT_UNVERIFIED) est ce que voit
       * l'appelant ; les messages destinés à l'utilisateur, eux, passent
       * désormais par le catalogue (CHECKPOINT_*_MESSAGE). Les traduire
       * masquerait le motif technique dans l'audit sans rien apporter.
       */
      'quiesce inadmissible',
      'quiesce without finite timeout + guaranteed thaw',
      'checkpoint inadmissible',
      'manifest not visible',
      // Libellé d'instantané du stockage (`checkpoint <barrierId>`) : identifiant
      // interne corrélé aux journaux, pas de la copie destinée à l'utilisateur.
      'checkpoint {…}',
      // Security audit/SIEM framing and internal-secret maintenance response.
      '{…} (trigger={…})',
      'DB_ROLLBACK_ENABLED is off',
      /*
       * P104: boot-time misconfiguration guard. Thrown only when NODE_ENV is
       * production and no deployment-access HMAC secret is configured at all —
       * it aborts the request path rather than signing tokens with a fallback
       * key. The text goes to logs; the client sees the generic 500 body. Same
       * class as 'DB_ROLLBACK_ENABLED is off' above: an operator diagnostic, not
       * user copy, so localizing it would hide the failing env var name.
       */
      'No deployment-access HMAC secret (DEPLOYMENT_ACCESS_TOKEN_SECRET or a base secret) configured',
    ]);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings.filter((finding: { text: string }) => !allowedInternalFindings.has(finding.text))).toEqual(
      [],
    );
    expect(new Set(result.findings.map((finding: { text: string }) => finding.text))).toEqual(allowedInternalFindings);
  });
});

describe('credit-ledger persistence source guard', () => {
  it.each([
    {
      file: 'services/api/src/credits-service.ts',
      path: creditsServicePath,
      expected: [
        // Machine-only policy/report outcomes; callers never render these values.
        'service_shutdown_limit_reached',
        'shadow',
        'no_stripe_client',
        'no_payg_price',
        'no_overage',
        'no_subscription',
        'no_metered_item',
        // Stable persisted system reasons localized by localizeCreditLedgerReason at the HTTP boundary.
        '{…} (overdraw reversal)',
        'agent checkpoint',
        'rollover cap exceeded',
        'prior grant expired (no rollover)',
        '{…} {…} grant',
      ],
    },
    {
      file: 'services/api/src/metering-service.ts',
      path: meteringServicePath,
      expected: ['workspace compute', 'object storage', 'database compute', 'database storage', 'deployment {…}'],
    },
    {
      file: 'services/api/src/prisma-store.ts',
      path: prismaStorePath,
      expected: ['PAYG overage (billed to Stripe metered usage)'],
    },
  ])(
    'classifies every scanner finding in $file as internal or localized persisted data',
    ({ file, path, expected }) => {
      const result = scanSource(readFileSync(path, 'utf8'), file);

      expect(result.parseErrors).toEqual([]);
      expect(new Set(result.findings.map((finding: { text: string }) => finding.text))).toEqual(new Set(expected));
    },
  );
});
