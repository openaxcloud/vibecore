import type { MetaFunction } from '@remix-run/cloudflare';
import { PublicShell, TemplateGallery, LinkButton } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Templates - E-Code' }];

export default function TemplatesPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Templates gallery</h1>
            <p className="mt-3 max-w-2xl text-sm text-bolt-elements-textSecondary">
              Curated Bolt starters with persistent project defaults, runtime setup and deployment paths.
            </p>
          </div>
          <LinkButton to="/login">Sign in to use templates</LinkButton>
        </div>
        <TemplateGallery />
      </section>
    </PublicShell>
  );
}
