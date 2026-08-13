import type { MetaFunction } from 'react-router';

import { PublicShell } from '~/components/dashboard/SaaSLayout';

/**
 * Public licensing page (Replit parity: legal-and-security/licensing-info). The
 * E-Code platform is MIT-licensed (see repo LICENSE, derived from bolt.diy);
 * apps you build are owned by you. Static SSR, e-code public shell.
 */
export const meta: MetaFunction = () => [
  { title: 'Licensing — E-Code' },
  {
    name: 'description',
    content: 'How the E-Code platform is licensed (MIT) and what licensing applies to the apps you build.',
  },
];

const SECTIONS: Array<{ title: string; body: string; points?: string[] }> = [
  {
    title: 'Platform license (MIT)',
    body: 'The E-Code platform source is distributed under the MIT License (derived from the bolt.diy project). You may use, copy, modify and distribute it under the terms of that license, included in full in the project repository as LICENSE.',
  },
  {
    title: 'Your apps belong to you',
    body: 'Code and content you create with the AI agent in your workspace are yours. E-Code claims no ownership over the applications you build, and you are free to deploy, publish and relicense them as you see fit, subject to the licenses of any third-party dependencies you add.',
  },
  {
    title: 'Third-party dependencies',
    body: 'Templates and generated projects may pull in open-source packages under their own licenses (MIT, Apache-2.0, BSD, etc.). You are responsible for complying with those licenses in anything you ship.',
    points: ['Review your dependency licenses before publishing', 'Keep attribution where a license requires it'],
  },
  {
    title: 'Trademarks',
    body: 'The E-Code and E-Code names and logos are trademarks of their respective owners and are not licensed for use except to identify the platform.',
  },
];

export default function LicensingRoute() {
  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page="licensing">
        <section className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ecode-accent)]">Legal</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl md:text-5xl">Licensing</h1>
          <p className="mt-4 text-base text-[var(--ecode-text-muted,#6E7681)] sm:text-lg">
            How the platform is licensed, and what applies to the apps you build with it.
          </p>

          <div className="mt-10 grid gap-6">
            {SECTIONS.map((section) => (
              <article
                key={section.title}
                className="rounded-xl border border-[var(--ecode-border,#E5E7EB)] bg-[var(--ecode-surface,#FFFFFF)] p-5"
              >
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="mt-2 text-sm text-[var(--ecode-text-muted,#6E7681)] sm:text-base">{section.body}</p>
                {section.points ? (
                  <ul className="mt-3 list-disc pl-5 text-sm text-[var(--ecode-text-muted,#6E7681)]">
                    {section.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
