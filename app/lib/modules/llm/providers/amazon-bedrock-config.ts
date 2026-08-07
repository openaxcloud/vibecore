import { formatBedrockConfigFailure } from '~/lib/i18n/catalogs/client-visible-errors';

/**
 * Pure, dependency-free parsing/validation for the Amazon Bedrock provider
 * configuration JSON. Kept in its own module (no BaseProvider import) so it can
 * be unit-tested without pulling in the provider registry import cycle.
 */
export interface AWSBedRockConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export function parseAndValidateBedrockConfig(apiKey: string, language?: string | null): AWSBedRockConfig {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(apiKey);
  } catch {
    throw new Error(formatBedrockConfigFailure('invalidFormat', language));
  }

  /*
   * A syntactically valid but non-object JSON value (e.g. `42`, `"foo"`, `null`,
   * or an array) must yield the friendly format error rather than a TypeError
   * from destructuring (e.g. destructuring `null` throws).
   */
  if (typeof parsedConfig !== 'object' || parsedConfig === null || Array.isArray(parsedConfig)) {
    throw new Error(formatBedrockConfigFailure('invalidFormat', language));
  }

  const { region, accessKeyId, secretAccessKey, sessionToken } = parsedConfig as Partial<AWSBedRockConfig>;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(formatBedrockConfigFailure('missingCredentials', language));
  }

  return {
    region,
    accessKeyId,
    secretAccessKey,
    ...(sessionToken && { sessionToken }),
  };
}
