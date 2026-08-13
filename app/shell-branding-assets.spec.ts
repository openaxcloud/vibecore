import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const publicRoot = join(repositoryRoot, 'public');

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

type EcodeManifest = {
  name: string;
  short_name: string;
  description: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
};

const servedManifests = [
  'public/manifest.webmanifest',
  'public/manifest.json',
  'public/ecode-static/manifest.json',
] as const;

const canonicalLogoSvgs = [
  'public/favicon.svg',
  'public/logo.svg',
  'public/assets/logo.svg',
  'public/ecode-static/favicon.svg',
  'public/ecode-static/assets/logo.svg',
] as const;

const shellBrandTextFiles = [
  ...servedManifests,
  ...canonicalLogoSvgs,
  'public/ecode-static/index.html',
  'public/offline.html',
  'public/ecode-static/offline.html',
] as const;

/*
 * Exact fingerprints of the public Bolt artwork that survived the product
 * rename. A binary asset cannot be audited reliably with a text grep, so keep
 * the known wordmarks and the old social card on a deny-list as well.
 */
const legacyBoltAssetHashes = new Map<string, string>([
  ['2e245508cc1e5447e8f30a521d1150d77946fa197bfbce29b5ea9d321a8e4f18', 'purple Bolt b glyph'],
  ['d94e6e74b85810fa072ff61c02d8122d32163d936524642fd65df6198f141084', 'bolt.diy light wordmark'],
  ['882830bc8f52402e9f7c77dbe3cafbe4192164de9b512173552ef5fa92592210', 'bolt.diy dark wordmark'],
  ['323bf0ce334898f2ad9faea27f35f207da663fa17b60323b6510dc6787acb4e6', 'bolt.diy styled wordmark'],
  ['998524ae93ae7c58050611cd4eaaef325d4cdee4ef9124a5c8e208620f5b3837', 'bolt.diy inverse wordmark'],
  ['0969775cb5cc7bd2f8eb597b821a3060e9add5d6494301e3b1d41e993c09c7ad', 'bolt.diy social preview'],
  ['faab915fc5d7932a1a744eb024f9e3ae162d6eef9dfcc608e43e41e087c8c9b9', 'Bolt desktop PNG icon'],
  ['bdbbffa57192d8acb18627d83d46230ece2f26e579d4bf1642da22595680065f', 'Bolt desktop Windows icon'],
  ['7429cfee82b692f620424b30c4a6d767972cb0b07a0e9c1f1c8e77d98f8a8aef', 'Bolt desktop macOS icon'],
  ['244dc2cebe251a2b839ee09107308bbdfeeac4e2831f6f7c6ddffd96929eacbe', 'Bolt lightning SVG'],
  ['e249bc0c8c50d59480e911f487cae8414812be6d7daeee53d432b1aa547b5ebb', 'Bolt wordmark SVG'],
]);

const publicBrandRasterCandidates = [
  'public/favicon.ico',
  'public/apple-touch-icon.png',
  'public/apple-touch-icon-precomposed.png',
  'public/logo-light.png',
  'public/logo-dark.png',
  'public/logo-light-styled.png',
  'public/logo-dark-styled.png',
  'public/social_preview_index.jpg',
] as const;

const desktopBrandAssets = [
  'assets/icons/icon.png',
  'assets/icons/icon.ico',
  'assets/icons/icon.icns',
  'icons/logo.svg',
  'icons/logo-text.svg',
] as const;

describe('served E-Code shell branding', () => {
  it('keeps the document links, fallback title and social metadata on the E-Code identity', () => {
    const rootSource = readRepositoryText('app/root.tsx');
    const homeRouteSource = readRepositoryText('app/routes/_index.tsx');
    const socialMetaSource = readRepositoryText('app/utils/social-meta.ts');

    expect(rootSource).toMatch(
      /rel:\s*'icon',[\s\S]{0,100}?href:\s*'\/favicon\.svg',[\s\S]{0,100}?type:\s*'image\/svg\+xml'/,
    );
    expect(rootSource).toContain("rel: 'manifest', href: '/manifest.webmanifest'");
    expect(rootSource).toContain("rel: 'apple-touch-icon', href: '/apple-touch-icon.png'");
    expect(rootSource).toContain('<meta name="apple-mobile-web-app-title" content="E-Code" />');
    expect(
      /export const meta[\s\S]{0,600}?title:\s*['"`][^'"`]*E-Code[^'"`]*/.test(rootSource),
      'app/root.tsx must provide an E-Code fallback title',
    ).toBe(true);

    expect(homeRouteSource).toMatch(/title:\s*['"`]E-Code\b/);
    expect(socialMetaSource).toContain("export const MARKETING_SITE_URL = 'https://e-code.ai'");
    expect(socialMetaSource).toContain('`${MARKETING_SITE_URL}/social_preview_index.jpg`');
    expect(socialMetaSource).toContain("{ property: 'og:image', content: DEFAULT_OG_IMAGE }");
    expect(socialMetaSource).toContain("{ name: 'twitter:image', content: DEFAULT_OG_IMAGE }");

    expect(`${rootSource}\n${homeRouteSource}\n${socialMetaSource}`).not.toMatch(/bolt[.\s_-]*diy/i);
  });

  it('serves one coherent E-Code PWA identity and real icons at every declared size', () => {
    const manifests = servedManifests.map((file) => ({ file, manifest: readManifest(file) }));

    for (const { file, manifest } of manifests) {
      expect(manifest.name, `${file} name`).toBe('E-Code.ai');
      expect(manifest.short_name, `${file} short_name`).toBe('E-Code');
      expect(manifest.description, `${file} description`).toMatch(/E-Code|AI-powered coding platform/i);
      expect(manifest.icons.length, `${file} icons`).toBeGreaterThan(0);
      expect(
        manifest.icons.some((icon) => icon.sizes === '192x192'),
        `${file} 192px icon`,
      ).toBe(true);
      expect(
        manifest.icons.some((icon) => icon.sizes === '512x512'),
        `${file} 512px icon`,
      ).toBe(true);
      expect(
        manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose?.split(/\s+/).includes('maskable')),
        `${file} maskable icon`,
      ).toBe(true);

      for (const icon of manifest.icons) {
        expect(icon.src, `${file} icon URL`).toMatch(/^\//);
        expect(icon.type, `${file} ${icon.src} MIME type`).toBe('image/png');

        const assetPath = join(publicRoot, icon.src.slice(1));
        expect(existsSync(assetPath), `${file} references missing ${icon.src}`).toBe(true);

        const declaredSize = parseSquareSize(icon.sizes, `${file} ${icon.src}`);
        expect(readPngSize(readFileSync(assetPath)), `${file} ${icon.src} dimensions`).toEqual({
          width: declaredSize,
          height: declaredSize,
        });
      }
    }

    expect(new Set(manifests.map(({ manifest }) => manifest.theme_color)).size, 'manifest theme colors').toBe(1);
    expect(new Set(manifests.map(({ manifest }) => manifest.background_color)).size, 'manifest backgrounds').toBe(1);

    expect(readPngSize(readFileSync(join(publicRoot, 'apple-touch-icon.png')))).toEqual({ width: 180, height: 180 });
  });

  it('uses the canonical E plus chevron mark in every public SVG logo', () => {
    for (const file of canonicalLogoSvgs) {
      expect(existsSync(join(repositoryRoot, file)), `${file} must be served`).toBe(true);

      const svg = readRepositoryText(file);

      expect(svg, `${file} is SVG`).toContain('<svg');
      expect(svg, `${file} must stay self-contained`).not.toMatch(/<image\b|(?:href|src)=["'](?:https?:|\/)/i);
      expect(svg, `${file} still names Bolt`).not.toMatch(/bolt[.\s_-]*diy|stackblitz-labs/i);
      expect(hasCanonicalEPath(svg), `${file} is missing the E glyph`).toBe(true);
      expect(hasCanonicalChevronPath(svg), `${file} is missing the code chevron`).toBe(true);
    }
  });

  it('does not ship any known Bolt wordmark or legacy Bolt social card', () => {
    for (const file of publicBrandRasterCandidates) {
      const absolutePath = join(repositoryRoot, file);

      if (!existsSync(absolutePath)) {
        continue;
      }

      const hash = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
      const legacyDescription = legacyBoltAssetHashes.get(hash);

      expect(
        legacyDescription,
        `${file} still serves the ${legacyDescription ?? 'unknown legacy asset'}`,
      ).toBeUndefined();
    }

    for (const file of shellBrandTextFiles) {
      expect(existsSync(join(repositoryRoot, file)), `${file} must be served`).toBe(true);
      expect(readRepositoryText(file), `${file} leaks the upstream product name`).not.toMatch(
        /bolt[.\s_-]*diy|stackblitz-labs/i,
      );
    }
  });

  it('publishes a production-size E-Code image for both Open Graph and Twitter cards', () => {
    const socialImagePath = join(publicRoot, 'social_preview_index.jpg');

    expect(existsSync(socialImagePath)).toBe(true);
    expect(extname(socialImagePath)).toBe('.jpg');
    expect(readJpegSize(readFileSync(socialImagePath))).toEqual({ width: 1200, height: 630 });

    const socialImageHash = createHash('sha256').update(readFileSync(socialImagePath)).digest('hex');
    expect(
      legacyBoltAssetHashes.get(socialImageHash),
      'the default social card is still the Bolt artwork',
    ).toBeUndefined();
  });

  it('packages the E-Code identity in the Electron desktop binaries', () => {
    const builderSource = readRepositoryText('electron-builder.yml');
    const generatorSource = readRepositoryText('scripts/generate-ecode-brand-assets.mjs');

    expect(builderSource).toContain('icon: assets/icons/icon.icns');
    expect(builderSource).toContain('icon: assets/icons/icon.ico');
    expect(builderSource).toContain('icon: assets/icons/icon.png');
    expect(generatorSource).toContain("desktopIconDocument(512), 'assets/icons/icon.png'");
    expect(generatorSource).toContain("resolve(repoRoot, 'assets/icons/icon.ico')");
    expect(generatorSource).toContain("resolve(repoRoot, 'assets/icons/icon.icns')");
    expect(hasCanonicalEPath(generatorSource), 'desktop asset generator is missing the E glyph').toBe(true);
    expect(hasCanonicalChevronPath(generatorSource), 'desktop asset generator is missing the code chevron').toBe(true);

    expect(readPngSize(readFileSync(join(repositoryRoot, 'assets/icons/icon.png')))).toEqual({
      width: 512,
      height: 512,
    });

    const ico = readFileSync(join(repositoryRoot, 'assets/icons/icon.ico'));
    expect(ico.readUInt16LE(2), 'desktop ICO type').toBe(1);
    expect(ico.readUInt16LE(4), 'desktop ICO image count').toBeGreaterThanOrEqual(7);
    expect(readIcoPngSizes(ico)).toEqual([
      { width: 16, height: 16 },
      { width: 24, height: 24 },
      { width: 32, height: 32 },
      { width: 48, height: 48 },
      { width: 64, height: 64 },
      { width: 128, height: 128 },
      { width: 256, height: 256 },
    ]);

    const icns = readFileSync(join(repositoryRoot, 'assets/icons/icon.icns'));
    expect(icns.subarray(0, 4).toString('ascii'), 'desktop ICNS signature').toBe('icns');
    expect(readIcnsPngSizes(icns)).toContainEqual({ width: 512, height: 512 });

    for (const file of desktopBrandAssets) {
      const contents = readFileSync(join(repositoryRoot, file));
      const hash = createHash('sha256').update(contents).digest('hex');

      expect(legacyBoltAssetHashes.get(hash), `${file} still packages Bolt artwork`).toBeUndefined();
    }

    for (const file of ['icons/logo.svg', 'icons/logo-text.svg']) {
      const svg = readRepositoryText(file);
      expect(svg).not.toMatch(/bolt[.\s_-]*diy|stackblitz|lightning/i);
      expect(hasCanonicalEPath(svg), `${file} is missing the E glyph`).toBe(true);
      expect(hasCanonicalChevronPath(svg), `${file} is missing the code chevron`).toBe(true);
    }
  });
});

function readRepositoryText(file: string): string {
  return readFileSync(join(repositoryRoot, file), 'utf8');
}

function readManifest(file: string): EcodeManifest {
  return JSON.parse(readRepositoryText(file)) as EcodeManifest;
}

function parseSquareSize(value: string, context: string): number {
  const match = /^(\d+)x\1$/.exec(value);

  expect(match, `${context} has an invalid sizes declaration`).not.toBeNull();

  return Number(match?.[1]);
}

function readPngSize(contents: Buffer): { width: number; height: number } {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  expect(contents.subarray(0, pngSignature.length), 'invalid PNG signature').toEqual(pngSignature);

  return { width: contents.readUInt32BE(16), height: contents.readUInt32BE(20) };
}

function readJpegSize(contents: Buffer): { width: number; height: number } {
  expect(contents.readUInt16BE(0), 'invalid JPEG signature').toBe(0xffd8);

  let offset = 2;

  while (offset + 9 < contents.length) {
    if (contents[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = contents[offset + 1];

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = contents.readUInt16BE(offset + 2);

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return { width: contents.readUInt16BE(offset + 7), height: contents.readUInt16BE(offset + 5) };
    }

    offset += 2 + segmentLength;
  }

  throw new Error('JPEG has no start-of-frame dimensions');
}

function readIcoPngSizes(contents: Buffer): Array<{ width: number; height: number }> {
  const imageCount = contents.readUInt16LE(4);
  const sizes: Array<{ width: number; height: number }> = [];

  for (let index = 0; index < imageCount; index += 1) {
    const entryOffset = 6 + index * 16;
    const declaredWidth = contents[entryOffset] || 256;
    const declaredHeight = contents[entryOffset + 1] || 256;
    const imageLength = contents.readUInt32LE(entryOffset + 8);
    const imageOffset = contents.readUInt32LE(entryOffset + 12);
    const payload = contents.subarray(imageOffset, imageOffset + imageLength);
    const actualSize = readPngSize(payload);

    expect(actualSize, `ICO entry ${index} dimensions`).toEqual({
      width: declaredWidth,
      height: declaredHeight,
    });
    sizes.push(actualSize);
  }

  return sizes;
}

function readIcnsPngSizes(contents: Buffer): Array<{ width: number; height: number }> {
  const declaredLength = contents.readUInt32BE(4);

  expect(declaredLength, 'desktop ICNS declared length').toBe(contents.length);

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const sizes: Array<{ width: number; height: number }> = [];

  let offset = 8;

  while (offset + 8 <= contents.length) {
    const chunkLength = contents.readUInt32BE(offset + 4);

    expect(chunkLength, `invalid ICNS chunk at ${offset}`).toBeGreaterThanOrEqual(8);
    expect(offset + chunkLength, `ICNS chunk at ${offset} exceeds the file`).toBeLessThanOrEqual(contents.length);

    const payload = contents.subarray(offset + 8, offset + chunkLength);

    if (payload.subarray(0, pngSignature.length).equals(pngSignature)) {
      sizes.push(readPngSize(payload));
    }

    offset += chunkLength;
  }

  expect(offset, 'desktop ICNS chunk boundary').toBe(contents.length);

  return sizes;
}

function hasCanonicalEPath(svg: string): boolean {
  const acceptedCoordinates = [
    [10, 8, 10, 16, 10, 24, 10, 8, 18, 8, 10, 16, 16, 16, 10, 24, 18, 24],
    [14, 12, 14, 20, 14, 28, 14, 12, 22, 12, 14, 20, 20, 20, 14, 28, 22, 28],
    [34, 27, 42, 34, 27, 22, 34, 48, 17, 34, 69, 22],
  ];

  return extractPathCoordinates(svg).some((coordinates) =>
    acceptedCoordinates.some((accepted) => coordinates.join(',') === accepted.join(',')),
  );
}

function hasCanonicalChevronPath(svg: string): boolean {
  const acceptedCoordinates = [
    [20, 13, 23, 16, 20, 19],
    [26, 16, 30, 20, 26, 24],
    [62, 38, 11, 10, -11, 10],
  ];

  return extractPathCoordinates(svg).some((coordinates) =>
    acceptedCoordinates.some((accepted) => coordinates.join(',') === accepted.join(',')),
  );
}

function extractPathCoordinates(svg: string): number[][] {
  return [...svg.matchAll(/<path\b[^>]*\bd=["']([^"']+)["']/gi)].map((match) =>
    [...match[1].matchAll(/-?\d+(?:\.\d+)?/g)].map((coordinate) => Number(coordinate[0])),
  );
}
