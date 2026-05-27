import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

test('E-Code marketing routes expose imported source content', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('Workbench, terminal, preview, Git, LSP and collaborative presence in one workspace.'),
  ).toBeVisible();
  await expect(
    page.getByText('Cloud Build, Artifact Registry, Cloud Run, traffic splitting, domains and monitoring.'),
  ).toBeVisible();
  await expect(page.getByText('E-code Inc. Privacy-first analytics. Google Cloud native.')).toBeVisible();

  await page.goto('/product', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('Panels, terminal, Git, preview, problems and settings built for repeated engineering work.'),
  ).toBeVisible();
  await expect(page.getByText('Visible plan, tool calls, artifacts, pause, resume and commit handoff.')).toBeVisible();
  await expect(page.getByText('Presence, shared editing, public projects, fork flow and moderation.')).toBeVisible();

  await page.goto('/customers', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Customers and showcase' })).toBeVisible();
  await expect(
    page.getByText('Teams build dashboards, automations and back-office apps with Cloud Run deployment.'),
  ).toBeVisible();
  await expect(
    page.getByText('Founders generate, iterate and ship model-powered apps from validated templates.'),
  ).toBeVisible();

  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('$20 per user monthly for private projects, agents and deploys.')).toBeVisible();
  await expect(
    page.getByText('Annual billing receives a discount. Compute, storage and AI quotas are visible before use.'),
  ).toBeVisible();

  await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Why Cloud Run for developer workspaces' })).toBeVisible();
  await expect(
    page.getByText(
      'Cloud Run gives stateless services, gVisor isolation, regional deploys and predictable scaling for modern IDE workloads.',
    ),
  ).toBeVisible();

  await page.goto('/changelog', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText(
      'GCP storage, deployer, creation flow, AI generator, mobile shipping kit, marketing and docs foundations.',
    ),
  ).toBeVisible();

  await page.goto('/privacy', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText(
      'Project data is used to provide the workspace, AI, deployment and support workflows. Secrets stay server-side.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Google Cloud, Stripe, Sentry, email delivery and analytics providers support the service.'),
  ).toBeVisible();
});
