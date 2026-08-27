import { describe, expect, it } from 'vitest';

import { createI18nInstance } from './runtime';

const OWNER_RESERVED_PREFIXES = ['baseChatAst.'] as const;

const FORBIDDEN_VISIBLE_TERMS =
  /\b(?:apps?|back-?end|builds?|dashboards?|feature[ -]flags?|fork\p{L}*|front-?end|full(?:[ -]?stack)|logs?|marketplaces?|packages?|previews?|runtimes?|snapshots?|storages?|tags?|tenants?|tokens?|type[ -]checks?|workspaces?)\b|Balises|Cloud Object Storage/iu;

function stripApprovedTechnicalIdentifiers(value: string): string {
  return value
    .replace(/\{[^{}]+\}/gu, '')
    .replace(/\bpackage\.json\b/giu, '')
    .replace(/\b(?:npm run|pnpm|Yarn)\s+build\b/gu, '')
    .replace(/\/snapshot\b/gu, '')
    .replace(/~\/workspace\b/gu, '')
    .replace(/\bapp\.example\.com\b/gu, '')
    .replace(/\bapp\.use\b/gu, '')
    .replace(/\bsrc\/App\.tsx\b/gu, '')
    .replace(/(?:https?:\/\/|git@)\S+/gu, '');
}

describe('French runtime glossary', () => {
  it('rejects untranslated product terminology outside owner-reserved and technical content', () => {
    const frenchBundle = createI18nInstance('fr').getResourceBundle('fr', 'translation') as Record<string, unknown>;

    const residuals = Object.entries(frenchBundle)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .filter(([key]) => !OWNER_RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map(([key, value]) => [key, stripApprovedTechnicalIdentifiers(value)] as const)
      .filter(([, value]) => FORBIDDEN_VISIBLE_TERMS.test(value))
      .map(([key, value]) => `${key}: ${value}`);

    expect(residuals).toEqual([]);
  });
});
