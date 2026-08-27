import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { formatStarterTemplatesCopy, getStarterTemplatesCopy } from '~/lib/i18n/catalogs/starter-templates';
import type { Template } from '~/types/template';
import { getStarterTemplates } from '~/utils/constants';

interface FrameworkLinkProps {
  template: Template;
  startLabel: string;
  onNavigate: (href: string, event: React.MouseEvent) => void;
}

const FrameworkLink: React.FC<FrameworkLinkProps> = ({ template, startLabel, onNavigate }) => {
  const href = `/git?url=https://github.com/${template.githubRepo}.git`;

  return (
    <a
      href={href}
      data-state="closed"
      data-discover="true"
      data-discard-guard="true"
      aria-label={startLabel}
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getStarterTemplatesCopy(language);
  const starterTemplates = getStarterTemplates(language);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const handleNavigate = (href: string, event: React.MouseEvent) => {
    if (hasUnsentDraft) {
      event.preventDefault();
      setPendingHref(href);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-4 px-3 sm:px-4">
      <span className="max-w-xl text-center text-sm leading-relaxed text-bolt-elements-textSecondary">
        {copy['starterTemplates.intro']}
      </span>
      <div className="flex w-full justify-center">
        <div className="flex w-full max-w-lg flex-wrap items-center justify-center gap-3 sm:gap-4">
          {starterTemplates.map((template) => (
            <FrameworkLink
              key={template.name}
              template={template}
              startLabel={formatStarterTemplatesCopy(copy['starterTemplates.startAria'], {
                template: template.label,
              })}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={pendingHref !== null}
        title={copy['starterTemplates.discardTitle']}
        description={copy['starterTemplates.discardDescription']}
        confirmLabel={copy['starterTemplates.discardConfirm']}
        cancelLabel={copy['starterTemplates.discardCancel']}
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
