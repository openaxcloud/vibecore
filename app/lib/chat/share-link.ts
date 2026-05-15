/**
 * Share-link payload + URL builder for the agent panel (Sprint 7).
 *
 * The agent panel exposes a "Share this run" action that bundles the
 * current conversation snapshot into a signed link. The actual signing
 * + persistence happens server-side; this module owns:
 *
 *   - the typed payload contract (so server and client agree on the
 *     fields)
 *   - URL encode/decode helpers that survive routing through email +
 *     copy-paste (base64url + a small length cap)
 *
 * Pure node-testable; no React, no fetch.
 */

import type { Message } from 'ai';

export interface ShareLinkPayload {
  /** Conversation id that the snapshot was forked from. */
  conversationId: string;

  /** Optional title used as the share page heading. */
  title?: string;

  /** Project id the snapshot belongs to (server scopes ACLs to this). */
  projectId: string;

  /** Author user id at the moment of share. */
  authorUserId: string;

  /** ISO timestamp of when the share link was minted. */
  createdAt: string;

  /**
   * Message ids that should be visible in the share (callers strip out
   * private messages here). The viewer hydrates messages by joining
   * against the server-side snapshot keyed by this id list.
   */
  visibleMessageIds: string[];

  /**
   * Whether the receiver can fork the conversation when opened. False
   * by default — the share is read-only.
   */
  allowFork?: boolean;
}

/**
 * Maximum encoded payload size we accept. Way above realistic use but
 * guards against accidental embeds of huge fixtures.
 */
const MAX_PAYLOAD_BYTES = 64 * 1024;

function toBase64Url(input: string): string {
  const utf8 = new TextEncoder().encode(input);

  let binary = '';

  for (const byte of utf8) {
    binary += String.fromCharCode(byte);
  }

  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const padding = pad === 0 ? '' : '='.repeat(4 - pad);

  const binary =
    typeof atob === 'function' ? atob(padded + padding) : Buffer.from(padded + padding, 'base64').toString('binary');

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}

export function encodeShareLinkPayload(payload: ShareLinkPayload): string {
  const json = JSON.stringify(payload);

  if (new Blob([json]).size > MAX_PAYLOAD_BYTES) {
    throw new Error(`Share-link payload exceeds ${MAX_PAYLOAD_BYTES / 1024} KB`);
  }

  return toBase64Url(json);
}

export function decodeShareLinkPayload(encoded: string): ShareLinkPayload {
  const raw = fromBase64Url(encoded);
  const parsed = JSON.parse(raw) as ShareLinkPayload;

  if (
    typeof parsed.conversationId !== 'string' ||
    typeof parsed.projectId !== 'string' ||
    typeof parsed.authorUserId !== 'string' ||
    typeof parsed.createdAt !== 'string' ||
    !Array.isArray(parsed.visibleMessageIds)
  ) {
    throw new Error('Invalid share-link payload');
  }

  return parsed;
}

/**
 * Build the public-facing share URL the user can copy. The server side
 * exposes a route `/share/:token` that decodes the payload and renders
 * a read-only view.
 */
export function buildShareLinkUrl(origin: string, encoded: string): string {
  if (!encoded) {
    throw new Error('Cannot build share URL from an empty payload');
  }

  const base = origin.replace(/\/+$/, '');

  return `${base}/share/${encoded}`;
}

/**
 * Filter a message list down to the public-facing snapshot the share
 * link surfaces. Callers can pass `redactPrivate` to hide messages the
 * author marked as private (the marker convention is a tool annotation
 * — left to the caller to apply).
 */
export function selectShareableMessages(
  messages: readonly Message[],
  options: { allowedIds?: Set<string> } = {},
): Message[] {
  const allowed = options.allowedIds;

  if (!allowed) {
    return [...messages];
  }

  return messages.filter((message) => (message.id ? allowed.has(message.id) : false));
}
