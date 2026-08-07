import { describe, expect, it } from 'vitest';
import { parseAndValidateBedrockConfig } from './amazon-bedrock-config';

describe('parseAndValidateBedrockConfig', () => {
  it('parses a valid config object', () => {
    expect(
      parseAndValidateBedrockConfig(
        JSON.stringify({ region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'secret' }),
      ),
    ).toEqual({ region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'secret' });
  });

  it('includes sessionToken when provided', () => {
    expect(
      parseAndValidateBedrockConfig(
        JSON.stringify({ region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'secret', sessionToken: 'tok' }),
      ).sessionToken,
    ).toBe('tok');
  });

  it('throws a friendly error for non-JSON input', () => {
    expect(() => parseAndValidateBedrockConfig('not json', 'en')).toThrow(/Invalid AWS Bedrock configuration/);
  });

  /*
   * Bug under test: a syntactically valid but non-object JSON value must yield
   * the friendly format error, never a TypeError from destructuring `null`.
   */
  it('throws the format error for a bare JSON null (no TypeError)', () => {
    expect(() => parseAndValidateBedrockConfig('null', 'en')).toThrow(/Invalid AWS Bedrock configuration/);
  });

  it('throws the format error for a bare JSON number', () => {
    expect(() => parseAndValidateBedrockConfig('42', 'en')).toThrow(/Invalid AWS Bedrock configuration/);
  });

  it('throws the format error for a bare JSON string', () => {
    expect(() => parseAndValidateBedrockConfig('"foo"', 'en')).toThrow(/Invalid AWS Bedrock configuration/);
  });

  it('throws the format error for a JSON array', () => {
    expect(() => parseAndValidateBedrockConfig('[1,2,3]', 'en')).toThrow(/Invalid AWS Bedrock configuration/);
  });

  it('throws missing-credentials error for an object lacking required fields', () => {
    expect(() => parseAndValidateBedrockConfig('{}', 'en')).toThrow(/AWS credentials are incomplete/);
  });

  it('localizes validation while preserving AWS credential field identifiers', () => {
    expect(() => parseAndValidateBedrockConfig('not json', 'fr')).toThrow(
      'La configuration AWS Bedrock n’est pas valide. Saisissez un JSON valide contenant region, accessKeyId et secretAccessKey.',
    );
    expect(() => parseAndValidateBedrockConfig('{}', 'fr')).toThrow(
      'Les identifiants AWS sont incomplets. Ajoutez region, accessKeyId et secretAccessKey.',
    );
  });
});
