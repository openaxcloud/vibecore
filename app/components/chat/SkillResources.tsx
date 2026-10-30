import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface SkillResourceSnapshot {
  path: string;
  kind: string;
  bytes: number;
  content?: string;
  contentHash?: string;
}

/** Saved text only: this component never fetches, interprets or executes a resource. */
export function SkillResources({ resources }: { resources: readonly SkillResourceSnapshot[] }) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (!resources.length) {
    return null;
  }

  const toggle = (path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  return (
    <section
      role="group"
      className="mt-2 min-w-0 text-xs text-bolt-elements-textSecondary"
      aria-labelledby={`${id}-title`}
    >
      <h4 id={`${id}-title`} className="font-medium">
        {t('chat.skills.resourcesTitle')}
      </h4>
      <ul className="mt-1 grid min-w-0 gap-2">
        {resources.map((resource, index) => {
          const available = typeof resource.content === 'string';
          const open = expanded.has(resource.path);
          const contentId = `${id}-content-${index}`;

          return (
            <li key={resource.path} className="min-w-0 rounded border border-bolt-elements-borderColor p-2">
              {available ? (
                <button
                  type="button"
                  className="grid w-full min-w-0 gap-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-bolt-elements-focus"
                  aria-expanded={open}
                  aria-controls={contentId}
                  onClick={() => toggle(resource.path)}
                >
                  <span className="font-mono" style={{ overflowWrap: 'anywhere' }}>
                    {resource.path}
                  </span>
                  <span className="text-[11px] text-bolt-elements-textTertiary">
                    {t('chat.skills.resourceAvailable', { bytes: resource.bytes })}
                  </span>
                </button>
              ) : (
                <div className="grid min-w-0 gap-1">
                  <span className="font-mono" style={{ overflowWrap: 'anywhere' }}>
                    {resource.path}
                  </span>
                  <span className="text-[11px] text-bolt-elements-textTertiary">
                    {t('chat.skills.resourceMissing')}
                  </span>
                </div>
              )}
              {available && open ? (
                <div className="mt-2 min-w-0">
                  <p className="mb-1 text-[11px] text-bolt-elements-textTertiary">
                    {t('chat.skills.resourceReadOnly')}
                  </p>
                  <pre
                    id={contentId}
                    role="region"
                    aria-label={t('chat.skills.resourceContentLabel', { path: resource.path })}
                    tabIndex={0}
                    className="max-h-64 max-w-full overflow-auto whitespace-pre rounded bg-bolt-elements-background-depth-3 p-2 text-xs text-bolt-elements-textPrimary"
                  >
                    {resource.content}
                  </pre>
                  {resource.contentHash ? (
                    <p
                      className="mt-1 text-[11px] text-bolt-elements-textTertiary"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {t('chat.skills.resourceHash', { hash: resource.contentHash })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
