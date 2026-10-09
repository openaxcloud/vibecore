export const REQUIRED_PR_CHECKS = Object.freeze([
  'Install, test, build, scan',
  'CodeQL Analysis (javascript)',
  'CodeQL Analysis (typescript)',
]);

export function requiredCheckState(checks) {
  const latest = new Map();
  for (const check of checks) {
    if (!REQUIRED_PR_CHECKS.includes(check.name)) continue;
    if (!latest.has(check.name) || check.id > latest.get(check.name).id) latest.set(check.name, check);
  }
  const failed = [];
  const pending = [];
  for (const name of REQUIRED_PR_CHECKS) {
    const check = latest.get(name);
    if (!check || check.status !== 'completed') pending.push(name);
    else if (check.conclusion !== 'success') failed.push(`${name}: ${check.conclusion ?? 'missing conclusion'}`);
  }
  return { failed, pending };
}

export async function waitRequiredPrChecks({
  listChecks,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  report = () => {},
  timeoutMs = 60 * 60 * 1000,
  intervalMs = 30 * 1000,
}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const { failed, pending } = requiredCheckState(await listChecks());
    if (failed.length) throw new Error(`Required checks failed: ${failed.join(', ')}`);
    if (!pending.length) return;
    if (now() >= deadline) throw new Error(`Timed out waiting for required checks: ${pending.join(', ')}`);
    report(`Waiting for: ${pending.join(', ')}`);
    await sleep(Math.min(intervalMs, deadline - now()));
  }
}
