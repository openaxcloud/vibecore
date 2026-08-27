#!/usr/bin/env node
/**
 * Fail closed unless every JS-rendered parity surface was captured by Chromium.
 *
 * The baseline collector intentionally records partial network failures in its
 * manifest. That behaviour remains useful for diagnostics, but CI must never
 * commit a daily baseline where a browser was unavailable (or a product route
 * failed to render). This gate validates both manifest metadata and the bytes
 * written to disk before the commit step is allowed to run.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyRenderedCapture,
  MIN_RENDERED_TEXT_BYTES,
  validateWarcResponseRecord,
} from './collector-integrity.mjs';

export const REQUIRED_RENDERED_SOURCES = Object.freeze({
  pricing: 'pricing.rendered.html',
  gallery: 'gallery.rendered.html',
  community: 'community.rendered.html',
});

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function validateRenderedBaseline(manifestPath) {
  const errors = [];

  if (!existsSync(manifestPath)) {
    return [`manifest missing: ${manifestPath}`];
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [`manifest is not valid JSON: ${String(error?.message ?? error)}`];
  }

  for (const [sourceId, source] of Object.entries(manifest.sources ?? {})) {
    if (source?.status !== 'OK') continue;
    if (!/^[a-z0-9-]+$/.test(sourceId)) {
      errors.push(`${sourceId}: unsafe source id`);
      continue;
    }
    if (typeof source.file !== 'string' || basename(source.file) !== source.file) {
      errors.push(`${sourceId}: source artifact path is unsafe`);
      continue;
    }

    const sourcePath = join(dirname(manifestPath), source.file);
    if (!existsSync(sourcePath)) {
      errors.push(`${sourceId}: source artifact missing: ${sourcePath}`);
      continue;
    }
    const sourceBody = readFileSync(sourcePath);
    const expectedArchiveFile = `${sourceId}.warc`;
    if (source.archiveFormat !== 'WARC/1.1' || source.archiveFile !== expectedArchiveFile) {
      errors.push(`${sourceId}: valid WARC/1.1 archive metadata is required`);
      continue;
    }
    const archivePath = join(dirname(manifestPath), expectedArchiveFile);
    if (!existsSync(archivePath)) {
      errors.push(`${sourceId}: WARC archive missing: ${archivePath}`);
      continue;
    }
    const archive = readFileSync(archivePath);
    if (source.archiveSha256 !== sha256(archive)) {
      errors.push(`${sourceId}: WARC archive sha256 does not match manifest`);
    }
    for (const archiveError of validateWarcResponseRecord(archive, {
      url: source.finalUrl ?? source.url,
      httpStatus: source.httpStatus,
      body: sourceBody,
    })) {
      errors.push(`${sourceId}: ${archiveError}`);
    }
  }

  for (const [sourceId, expectedFile] of Object.entries(REQUIRED_RENDERED_SOURCES)) {
    const source = manifest.sources?.[sourceId];

    if (!source) {
      errors.push(`${sourceId}: missing manifest source`);
      continue;
    }

    if (source.status !== 'OK') {
      errors.push(`${sourceId}: expected status OK, received ${String(source.status)}`);
      continue;
    }

    if (source.rendered !== true) {
      errors.push(`${sourceId}: rendered flag is not true`);
    }

    if (source.family !== 'product-route') {
      errors.push(`${sourceId}: expected family product-route, received ${String(source.family)}`);
    }

    if (source.file !== expectedFile) {
      errors.push(`${sourceId}: expected file ${expectedFile}, received ${String(source.file)}`);
      continue;
    }

    const renderedPath = join(dirname(manifestPath), expectedFile);
    if (!existsSync(renderedPath)) {
      errors.push(`${sourceId}: rendered artifact missing: ${renderedPath}`);
      continue;
    }

    const body = readFileSync(renderedPath);
    const text = body.toString('utf8');

    if (body.length < 1_000) {
      errors.push(`${sourceId}: rendered artifact is implausibly small (${body.length} bytes)`);
    }

    if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) {
      errors.push(`${sourceId}: rendered artifact is not a complete HTML document`);
    }

    if (source.bytes !== body.length) {
      errors.push(`${sourceId}: manifest bytes ${String(source.bytes)} do not match artifact bytes ${body.length}`);
    }

    const digest = sha256(body);
    if (source.sha256 !== digest) {
      errors.push(`${sourceId}: manifest sha256 does not match rendered artifact`);
    }

    const expectedTextFile = `${sourceId}.rendered.txt`;
    if (source.renderedTextFile !== expectedTextFile) {
      errors.push(`${sourceId}: expected rendered text file ${expectedTextFile}`);
    } else {
      const renderedTextPath = join(dirname(manifestPath), expectedTextFile);
      if (!existsSync(renderedTextPath)) {
        errors.push(`${sourceId}: rendered text artifact missing: ${renderedTextPath}`);
      } else {
        const renderedTextBody = readFileSync(renderedTextPath);
        const renderedText = renderedTextBody.toString('utf8');
        if (renderedTextBody.length < MIN_RENDERED_TEXT_BYTES) {
          errors.push(`${sourceId}: rendered text is implausibly small (${renderedTextBody.length} bytes)`);
        }
        if (source.renderedTextBytes !== renderedTextBody.length) {
          errors.push(`${sourceId}: rendered text byte count does not match manifest`);
        }
        if (source.renderedTextSha256 !== sha256(renderedTextBody)) {
          errors.push(`${sourceId}: rendered text sha256 does not match manifest`);
        }

        const capture = classifyRenderedCapture({
          sourceId,
          requestedUrl: source.url,
          finalUrl: source.finalUrl,
          httpStatus: source.httpStatus,
          html: text,
          text: renderedText,
        });
        if (capture.status !== 'OK') {
          errors.push(`${sourceId}: rendered capture classified as ${capture.status}`);
        }
      }
    }
  }

  return errors;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const configuredPath = argumentValue('--manifest');
  if (!configuredPath) {
    console.error('usage: node scripts/parity/assert-rendered-baseline.mjs --manifest <manifest.json>');
    process.exitCode = 2;
    return;
  }

  const manifestPath = isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath);
  const errors = validateRenderedBaseline(manifestPath);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[parity-render-gate] ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[parity-render-gate] pricing, gallery and community HTML, text and WARC artifacts verified from ${manifestPath}`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
