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
    expect(() => parseAndValidateBedrockConfig('not json')).toThrow(/Invalid AWS Bedrock configuration format/);
  });

  /*
   * Bug under test: a syntactically valid but non-object JSON value must yield
   * the friendly format error, never a TypeError from destructuring `null`.
   */
  it('throws the format error for a bare JSON null (no TypeError)', () => {
    expect(() => parseAndValidateBedrockConfig('null')).toThrow(/Invalid AWS Bedrock configuration format/);
  });

  it('throws the format error for a bare JSON number', () => {
    expect(() => parseAndValidateBedrockConfig('42')).toThrow(/Invalid AWS Bedrock configuration format/);
  });

  it('throws the format error for a bare JSON string', () => {
    expect(() => parseAndValidateBedrockConfig('"foo"')).toThrow(/Invalid AWS Bedrock configuration format/);
  });

  it('throws the format error for a JSON array', () => {
    expect(() => parseAndValidateBedrockConfig('[1,2,3]')).toThrow(/Invalid AWS Bedrock configuration format/);
  });

  it('throws missing-credentials error for an object lacking required fields', () => {
    expect(() => parseAndValidateBedrockConfig('{}')).toThrow(/Missing required AWS credentials/);
  });
});
