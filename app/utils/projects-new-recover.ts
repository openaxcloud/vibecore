/*
 * Idempotency recovery for prompt-driven project creation.
 *
 * The `/orgs/:id/projects/from-ai` endpoint creates the project, consumes the
 * `projects.count` quota, and returns 201 *before* the client reads the
 * response body. If the response is lost while reading it (socket reset, read
 * timeout — `fetch` resolves but `response.text()` rejects), the action throws
 * even though the project already exists. Blindly creating a second "empty
 * fallback" project then double-charges the org and orphans the scaffolded
 * project.
 *
 * To stay idempotent without a server-side idempotency key, the action
 * re-fetches the org's project list after such a failure and looks for the
 * project the lost request most likely created. These pure helpers encapsulate
 * that decision so it can be unit-tested in isolation.
 */

export type RecoverableProject = {
  id: string;
  slug?: string;
  name?: string;
  sourceType?: string;
  createdAt?: string;
};

/*
 * Whether a thrown error could have left a project created on the server.
 *
 * A real `Response` error means the api pod *replied* with an HTTP error status
 * (4xx/5xx) — the request completed end-to-end and, for a non-2xx reply, no
 * project was committed, so the empty fallback is safe and necessary. Anything
 * else (a `fetch` network rejection, an `AbortError`/`TimeoutError` from the
 * body read, a `TypeError: terminated`) is ambiguous: the request may have
 * reached the server and created the project before the connection dropped, so
 * we must check before creating a second one.
 */
export function mayHaveCreatedProject(error: unknown): boolean {
  // A thrown `Response` is an HTTP-level error reply: the call completed, no create on non-2xx.
  if (error instanceof Response) {
    return false;
  }

  return true;
}

/*
 * From the org's current project list, pick the project the lost from-ai
 * request most plausibly created, so we can reuse it instead of creating a
 * duplicate.
 *
 * Matching is deliberately conservative:
 *  - sourceType must be 'ai' (the empty fallback is 'blank'; templates differ),
 *  - the name must match the name we submitted (the server derives the slug
 *    from the name, and uses the submitted name verbatim),
 *  - createdAt must be at/after the moment we began the attempt, so we never
 *    latch onto a pre-existing same-named project from an earlier session.
 *
 * Among candidates the newest one wins. Returns `undefined` when nothing
 * matches, signalling the caller to fall back to creating an empty project.
 */
export function findRecentlyCreatedAiProject(
  projects: readonly RecoverableProject[] | null | undefined,
  options: { name: string; attemptStartedAt: number },
): RecoverableProject | undefined {
  if (!Array.isArray(projects) || projects.length === 0) {
    return undefined;
  }

  const targetName = options.name.trim();

  if (!targetName) {
    return undefined;
  }

  // Allow a little clock skew between the web pod and the api/db clock.
  const minCreatedAt = options.attemptStartedAt - 60_000;

  let best: RecoverableProject | undefined;
  let bestCreatedAt = -Infinity;

  for (const project of projects) {
    if (!project || typeof project.id !== 'string' || project.id.length === 0) {
      continue;
    }

    if (project.sourceType !== 'ai') {
      continue;
    }

    if ((project.name ?? '').trim() !== targetName) {
      continue;
    }

    const createdAt = project.createdAt ? Date.parse(project.createdAt) : NaN;

    if (Number.isNaN(createdAt) || createdAt < minCreatedAt) {
      continue;
    }

    if (createdAt > bestCreatedAt) {
      best = project;
      bestCreatedAt = createdAt;
    }
  }

  return best;
}
