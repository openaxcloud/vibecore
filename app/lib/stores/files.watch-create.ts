/*
 * Helpers for interpreting a content-less file-watch 'create' event.
 *
 * In remote-kubernetes (production) mode the only live watch signal is the API
 * poller (services/api/src/app.ts), which emits create/delete events with NO
 * content and NO type discriminator — it calls emit(path, 'create') for both
 * files AND directories. The legacy FilesStore behaviour treated EVERY
 * content-less create as a folder, so any newly-created FILE (build output, npm
 * install, agent write, external tool) showed up in the IDE tree as an
 * unopenable phantom folder until a full reloadFromRuntime.
 *
 * Because the wire frame can't be widened from the client, we resolve the node
 * type lazily: attempt to read the path; a successful read means it is a real
 * file (register it with the fetched content), a failed read means it is a
 * directory (register a folder). These pure helpers keep that decision testable.
 */

export interface ResolvedContentlessCreate {
  type: 'file' | 'folder';
  content: string;
  isBinary: boolean;
}

/**
 * Decide how to register a content-less 'create' from the result of attempting
 * to read the path as a file. A resolved read => file; a rejected read (it is a
 * directory, or transiently unreadable) => folder.
 */
export function resolveContentlessCreate(
  read: { content: string; encoding?: 'utf8' | 'base64' } | undefined,
): ResolvedContentlessCreate {
  if (!read) {
    return { type: 'folder', content: '', isBinary: false };
  }

  return {
    type: 'file',
    content: read.content ?? '',
    isBinary: read.encoding === 'base64',
  };
}
