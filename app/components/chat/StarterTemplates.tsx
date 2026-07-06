import React, { useState } from 'react';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

interface FrameworkLinkProps {
  template: Template;
  onNavigate: (href: string, event: React.MouseEvent) => void;
}

const FrameworkLink: React.FC<FrameworkLinkProps> = ({ template, onNavigate }) => {
  const href = `/git?url=https://github.com/${template.githubRepo}.git`;

  return (
    <a
      href={href}
      data-state="closed"
      data-discover="true"
      data-discard-guard="true"
      aria-label={`Start a ${template.label} app`}
      title={template.label}
      onClick={(event) => onNavigate(href, event)}
      className="inline-flex items-center justify-center rounded-md p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
    >
      <div
        className={`inline-block ${template.icon} w-8 h-8 text-4xl transition-theme text-bolt-elements-textPrimary hover:text-bolt-elements-item-contentAccent dark:opacity-50 dark:hover:opacity-100 transition-all grayscale hover:grayscale-0 transition`}
        aria-hidden
      />
    </a>
  );
};

/*
 * Starter templates navigate to the git-import flow. When the composer holds an
 * unsent prompt, that same-tab navigation would silently discard it — so guard
 * the click with an in-app confirm (never a native dialog) instead of losing the
 * draft. `hasUnsentDraft` is supplied by the composer host.
 */
const StarterTemplates: React.FC<{ hasUnsentDraft?: boolean }> = ({ hasUnsentDraft = false }) => {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const handleNavigate = (href: string, event: React.MouseEvent) => {
    if (hasUnsentDraft) {
      event.preventDefault();
      setPendingHref(href);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-sm text-bolt-elements-textSecondary">or start a blank app with your favorite stack</span>
      <div className="flex justify-center">
        <div className="flex flex-wrap justify-center items-center gap-4 max-w-sm">
          {STARTER_TEMPLATES.map((template) => (
            <FrameworkLink key={template.name} template={template} onNavigate={handleNavigate} />
          ))}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={pendingHref !== null}
        title="Discard your prompt?"
        description="You have an unsent prompt in the composer. Starting a template will leave this page and discard it."
        confirmLabel="Discard & continue"
        cancelLabel="Keep editing"
        variant="destructive"
        onConfirm={() => {
          if (pendingHref) {
            window.location.href = pendingHref;
          }
        }}
        onClose={() => setPendingHref(null)}
      />
    </div>
  );
};

export default StarterTemplates;
