/**
 * Keyboard "skip to content" link, shared by the marketing shell and the app
 * AppShell. Rendered as the first focusable element of the page: invisible and
 * out of the way until it receives keyboard focus, then shown as a small
 * floating pill. The target container must carry id="main-content" and
 * tabIndex={-1} so focus lands on it after activation.
 */
export function SkipLink({
  label,
  targetId = 'main-content',
}: {
  /*
   * OBLIGATOIRE, et non un défaut anglais. Le défaut `'Skip to content'`
   * partait en silence dans TOUTE la zone authentifiée : la coquille marketing
   * passait bien un libellé localisé, `SaaSLayout` non — un visiteur français
   * recevait donc de l'anglais sur le PREMIER élément focusable de chaque page.
   * Le scanner de résidus ne le voyait pas : une valeur par défaut de paramètre
   * n'est pas un littéral rendu. Rendre le prop requis fait échouer la
   * compilation plutôt que la traduction.
   */
  label: string;
  targetId?: string;
}) {
  return (
    <a
      href={`#${targetId}`}
      className="fixed left-4 top-4 z-[10000] inline-flex min-h-11 min-w-11 -translate-y-24 items-center rounded-lg border bg-bolt-elements-background-depth-2 px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary shadow-md focus:translate-y-0"
      style={{ borderColor: 'var(--ecode-focus-ring)' }}
    >
      {label}
    </a>
  );
}
