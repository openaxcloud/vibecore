import type { RegistryRef } from './artifact-promotion.js';
import type { AccessTokenProvider } from './artifact-registry-adapter.js';
import { ArtifactRegistryError, GoogleAdcAccessTokenProvider } from './artifact-registry-adapter.js';

const POLICY_RE =
  /^projects\/(?<project>[a-z][a-z0-9-]{4,61}[a-z0-9])\/platforms\/gke\/policies\/(?<policy>[a-z][a-z0-9-]{0,61}[a-z0-9])$/u;

const K8S_NAME_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u;

export interface BinaryAuthorizationPolicy {
  resourceName: string;

  /** Immutable policy revision returned by GET PlatformPolicy. */
  etag: string;
  namespace?: string;
  serviceAccount?: string;
}

export interface BinaryAuthorizationEvaluation {
  admitted: boolean;
  verdict: 'CONFORMANT' | 'NON_CONFORMANT' | 'ERROR';
  policyEtag: string;
}

export interface BinaryAuthorizationClientOptions {
  tokenProvider?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export function validateBinaryAuthorizationPolicy(policy: BinaryAuthorizationPolicy): BinaryAuthorizationPolicy {
  if (!POLICY_RE.test(policy.resourceName)) {
    throw new ArtifactRegistryError('BINAUTHZ_POLICY_INVALID', 'Binary Authorization policy resource name is invalid.');
  }

  if (!/^[A-Za-z0-9+/_=-]{8,256}$/u.test(policy.etag)) {
    throw new ArtifactRegistryError('BINAUTHZ_POLICY_INVALID', 'Binary Authorization policy etag is invalid.');
  }

  for (const [field, value] of [
    ['namespace', policy.namespace],
    ['serviceAccount', policy.serviceAccount],
  ] as const) {
    if (value !== undefined && (!K8S_NAME_RE.test(value) || value.length > 253)) {
      throw new ArtifactRegistryError('BINAUTHZ_POLICY_INVALID', `Binary Authorization ${field} is invalid.`);
    }
  }

  return policy;
}

/**
 * Live Binary Authorization policy evaluator. Any HTTP, auth, malformed-body,
 * NON_CONFORMANT or ERROR result is denied; only an explicit CONFORMANT verdict
 * can advance the promotion state machine.
 */
export class BinaryAuthorizationClient {
  readonly #tokenProvider: AccessTokenProvider;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: BinaryAuthorizationClientOptions = {}) {
    this.#tokenProvider = options.tokenProvider ?? new GoogleAdcAccessTokenProvider();
    this.#fetch = options.fetchImpl ?? fetch;
    this.#requestTimeoutMs = Math.max(1_000, Math.min(options.requestTimeoutMs ?? 30_000, 120_000));
  }

  async evaluate(policyInput: BinaryAuthorizationPolicy, target: RegistryRef): Promise<BinaryAuthorizationEvaluation> {
    const policy = validateBinaryAuthorizationPolicy(policyInput);
    const token = await this.#tokenProvider.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);

    try {
      const policyResponse = await this.#fetch(`https://binaryauthorization.googleapis.com/v1/${policy.resourceName}`, {
        signal: controller.signal,
        headers: { authorization: `Bearer ${token}` },
      });

      if (!policyResponse.ok) {
        throw new ArtifactRegistryError(
          'BINAUTHZ_POLICY_LOOKUP_FAILED',
          `Binary Authorization policy lookup failed with HTTP ${policyResponse.status}.`,
        );
      }

      const policyDocument = (await policyResponse.json()) as { name?: unknown; etag?: unknown };

      if (policyDocument.name !== policy.resourceName || policyDocument.etag !== policy.etag) {
        throw new ArtifactRegistryError(
          'BINAUTHZ_POLICY_REVISION_MISMATCH',
          'Binary Authorization policy changed or did not match the configured revision.',
        );
      }

      const response = await this.#fetch(
        `https://binaryauthorization.googleapis.com/v1/${policy.resourceName}:evaluate`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            resource: {
              apiVersion: 'v1',
              kind: 'Pod',
              metadata: {
                name: 'ecode-promotion-evaluation',
                namespace: policy.namespace ?? 'default',
              },
              spec: {
                serviceAccountName: policy.serviceAccount ?? 'default',
                containers: [{ name: 'application', image: `${target.repo}@${target.digest}` }],
              },
            },
          }),
        },
      );

      if (!response.ok) {
        throw new ArtifactRegistryError(
          'BINAUTHZ_EVALUATION_FAILED',
          `Binary Authorization evaluation failed with HTTP ${response.status}.`,
        );
      }

      const body = (await response.json()) as {
        verdict?: string;
        results?: Array<{
          podName?: string;
          kubernetesNamespace?: string;
          kubernetesServiceAccount?: string;
          verdict?: string;
          imageResults?: Array<{
            imageUri?: string;
            verdict?: string;
            checkSetResult?: {
              checkResults?: {
                results?: Array<{
                  allowlistResult?: unknown;
                  evaluationResult?: { verdict?: string };
                }>;
              };
            };
          }>;
        }>;
      };

      if (!['CONFORMANT', 'NON_CONFORMANT', 'ERROR'].includes(body.verdict ?? '')) {
        throw new ArtifactRegistryError('BINAUTHZ_RESPONSE_INVALID', 'Binary Authorization verdict is missing.');
      }

      const verdict = body.verdict as BinaryAuthorizationEvaluation['verdict'];
      const expectedImage = `${target.repo}@${target.digest}`;
      const result = body.results?.length === 1 ? body.results[0] : undefined;
      const imageResult = result?.imageResults?.length === 1 ? result.imageResults[0] : undefined;
      const checks = imageResult?.checkSetResult?.checkResults?.results;

      const checksPassed =
        Array.isArray(checks) &&
        checks.length > 0 &&
        checks.every(
          (check) => check.allowlistResult === undefined && check.evaluationResult?.verdict === 'CONFORMANT',
        );
      const responseMatchesRequest =
        result?.podName === 'ecode-promotion-evaluation' &&
        result.kubernetesNamespace === (policy.namespace ?? 'default') &&
        result.kubernetesServiceAccount === (policy.serviceAccount ?? 'default') &&
        result.verdict === verdict &&
        imageResult?.imageUri === expectedImage &&
        imageResult.verdict === verdict &&
        (verdict !== 'CONFORMANT' || checksPassed);

      if (!responseMatchesRequest) {
        throw new ArtifactRegistryError(
          'BINAUTHZ_RESPONSE_INVALID',
          'Binary Authorization response does not match the evaluated image.',
        );
      }

      return { admitted: verdict === 'CONFORMANT', verdict, policyEtag: policy.etag };
    } catch (error) {
      if (error instanceof ArtifactRegistryError) {
        throw error;
      }

      throw new ArtifactRegistryError('BINAUTHZ_EVALUATION_FAILED', 'Binary Authorization evaluation failed.', {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
