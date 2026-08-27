import { createHash, randomUUID } from 'node:crypto';

const BOT_BLOCK_PATTERN = /been blocked|security service to protect|verify (?:that )?you are human|captcha/i;
const AUTH_ROUTE_PATTERN = /\/(?:auth|login|log-in|signin|sign-in)(?:[/?#]|$)/i;
const AUTH_FORM_PATTERN = /<input\b[^>]*\btype\s*=\s*["']password["']/i;
const MIN_RENDERED_TEXT_BYTES = 200;
const REQUIRED_RENDER_TEXT_PATTERNS = Object.freeze({
  pricing: /\bpricing\b/i,
  gallery: /\b(?:replit\s+gallery|gallery)\b/i,
  community: /\bcommunity\b/i,
});

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest();
}

function digestLabel(buffer) {
  // IIPC WARC 1.1 implementation guidance recommends lowercase Base16 for
  // SHA-256; unlike padded Base32, it also remains a legal `token` value.
  return `sha256:${sha256(buffer).toString('hex')}`;
}

function normalizedHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0;
}

/**
 * Turn browser observations into a fail-closed collector result.  The caller
 * must never infer success merely because page.evaluate() returned HTML: a
 * deleted route, an auth redirect, a bot challenge, or an unhydrated shell are
 * all explicit non-OK outcomes.
 */
export function classifyRenderedCapture(input) {
  const httpStatus = normalizedHttpStatus(input.httpStatus);
  const text = String(input.text ?? '').trim();
  const html = String(input.html ?? '');
  const finalUrl = String(input.finalUrl ?? input.requestedUrl ?? '');
  const renderedTextBytes = Buffer.byteLength(text, 'utf8');

  if (BOT_BLOCK_PATTERN.test(text)) {
    return { status: 'BLOCKED', httpStatus: httpStatus || 403, error: 'bot-detection block' };
  }

  if (httpStatus === 404 || httpStatus === 410) {
    return { status: 'ROUTE_REMOVED', httpStatus, error: `route returned HTTP ${httpStatus}` };
  }

  const authWall = AUTH_FORM_PATTERN.test(html) && renderedTextBytes < 2_000 && /\b(?:sign in|log in)\b/i.test(text);
  if (httpStatus === 401 || httpStatus === 403 || AUTH_ROUTE_PATTERN.test(finalUrl) || authWall) {
    return { status: 'AUTH_REQUIRED', httpStatus: httpStatus || 401, error: 'route now requires authentication' };
  }

  if (httpStatus < 200 || httpStatus >= 400) {
    return { status: 'FAILED', httpStatus, error: `route returned HTTP ${httpStatus || 'unknown'}` };
  }

  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html) || renderedTextBytes < MIN_RENDERED_TEXT_BYTES) {
    return {
      status: 'INCOMPLETE_RENDER',
      httpStatus,
      error: `rendered route did not hydrate (${renderedTextBytes} text bytes)`,
    };
  }

  const requiredTextPattern = input.sourceId ? REQUIRED_RENDER_TEXT_PATTERNS[input.sourceId] : undefined;
  if (requiredTextPattern && !requiredTextPattern.test(text)) {
    return {
      status: 'INCOMPLETE_RENDER',
      httpStatus,
      error: `rendered route is missing its ${input.sourceId} semantic marker`,
    };
  }

  return { status: 'OK', httpStatus, error: null };
}

function statusText(status) {
  const labels = new Map([
    [200, 'OK'],
    [201, 'Created'],
    [204, 'No Content'],
    [301, 'Moved Permanently'],
    [302, 'Found'],
    [307, 'Temporary Redirect'],
    [308, 'Permanent Redirect'],
  ]);
  return labels.get(status) ?? 'Captured';
}

/** Create one self-contained WARC/1.1 response record. */
export function createWarcResponseRecord(input) {
  const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body ?? '');
  const httpStatus = normalizedHttpStatus(input.httpStatus);
  if (httpStatus === 0) throw new TypeError('WARC response requires a valid HTTP status');

  const capturedAt = new Date(input.capturedAt);
  if (!Number.isFinite(capturedAt.getTime())) throw new TypeError('WARC response requires a valid capture date');

  let target;
  try {
    target = new URL(input.url).toString();
  } catch {
    throw new TypeError('WARC response requires an absolute target URL');
  }

  const httpHead = Buffer.from(
    `HTTP/1.1 ${httpStatus} ${statusText(httpStatus)}\r\n` +
      `Content-Type: ${input.contentType ?? 'application/octet-stream'}\r\n` +
      `Content-Length: ${body.length}\r\n\r\n`,
    'utf8',
  );
  const block = Buffer.concat([httpHead, body]);
  const recordId = input.recordId ?? randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)) {
    throw new TypeError('WARC record id must be an RFC 4122 UUID');
  }

  const warcHead = Buffer.from(
    'WARC/1.1\r\n' +
      'WARC-Type: response\r\n' +
      `WARC-Record-ID: <urn:uuid:${recordId}>\r\n` +
      `WARC-Date: ${capturedAt.toISOString()}\r\n` +
      `WARC-Target-URI: ${target}\r\n` +
      'Content-Type: application/http; msgtype=response\r\n' +
      `Content-Length: ${block.length}\r\n` +
      `WARC-Block-Digest: ${digestLabel(block)}\r\n` +
      `WARC-Payload-Digest: ${digestLabel(body)}\r\n\r\n`,
    'utf8',
  );

  return Buffer.concat([warcHead, block, Buffer.from('\r\n\r\n', 'utf8')]);
}

function parseHeaders(lines, errors, prefix) {
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      errors.push(`${prefix}: malformed header ${JSON.stringify(line)}`);
      continue;
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(name)) errors.push(`${prefix}: duplicate header ${name}`);
    headers.set(name, value);
  }
  return headers;
}

/**
 * Strictly validate a single response record.  It rejects truncation, trailing
 * bytes, malformed headers, target/status drift, and both block and payload
 * digest corruption.
 */
export function validateWarcResponseRecord(record, expected = {}) {
  const errors = [];
  const bytes = Buffer.isBuffer(record) ? record : Buffer.from(record ?? '');
  const headerEnd = bytes.indexOf('\r\n\r\n');
  if (headerEnd < 0) return ['WARC: header terminator missing'];

  const headerLines = bytes.subarray(0, headerEnd).toString('utf8').split('\r\n');
  if (headerLines.shift() !== 'WARC/1.1') errors.push('WARC: version must be WARC/1.1');
  const headers = parseHeaders(headerLines, errors, 'WARC');
  const contentLength = Number(headers.get('content-length'));
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) errors.push('WARC: invalid Content-Length');

  const blockStart = headerEnd + 4;
  const blockEnd = blockStart + (Number.isSafeInteger(contentLength) ? contentLength : 0);
  const block = bytes.subarray(blockStart, blockEnd);
  if (block.length !== contentLength) errors.push('WARC: truncated response block');
  if (!bytes.subarray(blockEnd).equals(Buffer.from('\r\n\r\n'))) errors.push('WARC: trailing bytes are invalid');

  if (headers.get('warc-type') !== 'response') errors.push('WARC: WARC-Type must be response');
  if (headers.get('content-type') !== 'application/http; msgtype=response') {
    errors.push('WARC: Content-Type must describe an HTTP response');
  }
  if (
    !/^<urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}>$/i.test(
      headers.get('warc-record-id') ?? '',
    )
  ) {
    errors.push('WARC: invalid WARC-Record-ID');
  }
  const warcDate = headers.get('warc-date') ?? '';
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(warcDate) ||
    !Number.isFinite(Date.parse(warcDate))
  ) {
    errors.push('WARC: invalid WARC-Date');
  }
  let targetUri;
  try {
    targetUri = new URL(headers.get('warc-target-uri') ?? '').toString();
  } catch {
    errors.push('WARC: invalid WARC-Target-URI');
  }
  if (expected.url) {
    try {
      if (targetUri !== new URL(expected.url).toString())
        errors.push('WARC: target URI does not match manifest source');
    } catch {
      errors.push('WARC: manifest source URL is invalid');
    }
  }
  if (headers.get('warc-block-digest') !== digestLabel(block)) errors.push('WARC: block digest mismatch');

  const httpHeaderEnd = block.indexOf('\r\n\r\n');
  if (httpHeaderEnd < 0) {
    errors.push('WARC: embedded HTTP header terminator missing');
    return errors;
  }
  const httpLines = block.subarray(0, httpHeaderEnd).toString('utf8').split('\r\n');
  const statusMatch = /^HTTP\/1\.1 (\d{3})\b/.exec(httpLines.shift() ?? '');
  if (!statusMatch) errors.push('WARC: invalid embedded HTTP status line');
  const httpHeaders = parseHeaders(httpLines, errors, 'WARC HTTP');
  const payload = block.subarray(httpHeaderEnd + 4);
  const httpLength = Number(httpHeaders.get('content-length'));
  if (!Number.isSafeInteger(httpLength) || httpLength !== payload.length) {
    errors.push('WARC: embedded HTTP Content-Length mismatch');
  }
  if (expected.httpStatus && Number(statusMatch?.[1]) !== expected.httpStatus) {
    errors.push('WARC: embedded HTTP status does not match manifest source');
  }
  if (expected.body && !payload.equals(expected.body)) errors.push('WARC: payload does not match archived artifact');
  if (headers.get('warc-payload-digest') !== digestLabel(payload)) errors.push('WARC: payload digest mismatch');

  return errors;
}

export { MIN_RENDERED_TEXT_BYTES };
