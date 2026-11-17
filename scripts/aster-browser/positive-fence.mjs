import assert from 'node:assert/strict';
export const successMessage = 'runtime reseed: reconciled runtime toward persisted ide-state';
export function newPositiveCompletion(before, after, identity) {
  assert.deepEqual(after.process, before.process, 'INCONCLUSIVE_API_PROCESS_CHANGED');
  assert.ok(after.logs.startsWith(before.logs), 'INCONCLUSIVE_API_LOG_ROTATED');
  assert.ok(!before.logs || before.logs.endsWith('\n'), 'INCONCLUSIVE_PARTIAL_LOG_CURSOR');
  const fresh = after.logs.slice(before.logs.length).split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  });
  const matches = fresh.filter((e) => e?.msg === successMessage && e.workspaceId === identity.workspaceId && e.projectId === identity.projectId);
  assert.ok(matches.length <= 1, 'INCONCLUSIVE_MULTIPLE_RECONCILIATIONS');
  if (!matches.length) return null;
  const event = matches[0];
  assert.equal(event.missing, 1, 'INCONCLUSIVE_UNEXPECTED_MISSING_COUNT');
  assert.equal(event.diverged, 0, 'INCONCLUSIVE_UNEXPECTED_DIVERGENCE');
  return { workspaceId: event.workspaceId, projectId: event.projectId, missing: event.missing, diverged: event.diverged, msg: event.msg, time: event.time };
}
export async function positiveTreeFence({ inspect, removeMarker, snapshot, fetchTree, identity, proof, expected, deadlineMs = 30_000, intervalMs = 250 }) {
  assert.deepEqual(await inspect(identity.workspaceId, proof), expected, 'POD_IDENTITY_CHANGED');
  const before = await snapshot();
  newPositiveCompletion(before, before, identity);
  await removeMarker(identity.workspaceId, proof);
  await fetchTree();
  const deadline = Date.now() + deadlineMs;
  do {
    const event = newPositiveCompletion(before, await snapshot(), identity);
    if (event) {
      assert.deepEqual(await inspect(identity.workspaceId, proof), expected, 'POD_IDENTITY_CHANGED');
      return { event, apiProcess: before.process, markerRestored: true };
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
  throw new Error('INCONCLUSIVE_NO_POSITIVE_TREE_COMPLETION');
}
