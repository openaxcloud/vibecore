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

export function parseAndValidateBedrockConfig(apiKey: string): AWSBedRockConfig {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(apiKey);
  } catch {
    throw new Error(
      'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing region, accessKeyId, and secretAccessKey.',
    );
  }

  /*
   * A syntactically valid but non-object JSON value (e.g. `42`, `"foo"`, `null`,
   * or an array) must yield the friendly format error rather than a TypeError
   * from destructuring (e.g. destructuring `null` throws).
   */
  if (typeof parsedConfig !== 'object' || parsedConfig === null || Array.isArray(parsedConfig)) {
    throw new Error(
      'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing region, accessKeyId, and secretAccessKey.',
    );
  }

  const { region, accessKeyId, secretAccessKey, sessionToken } = parsedConfig as Partial<AWSBedRockConfig>;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing required AWS credentials. Configuration must include region, accessKeyId, and secretAccessKey.',
    );
  }

  return {
    region,
    accessKeyId,
    secretAccessKey,
    ...(sessionToken && { sessionToken }),
  };
}
