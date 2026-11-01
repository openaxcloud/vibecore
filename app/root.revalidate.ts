import type { ShouldRevalidateFunction } from 'react-router';

/** Opening Editor must commit locally before a subsequent Back can leave the IDE. */
export const shouldRevalidateRoot: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  // Preserve explicit revalidation, submissions, locale changes and route changes.
  if (
    formMethod ||
    nextUrl.searchParams.get('panel') !== 'editor' ||
    currentUrl.origin !== nextUrl.origin ||
    currentUrl.pathname !== nextUrl.pathname ||
    !/^\/[^/]+\/[^/]+\/ide\/?$/.test(currentUrl.pathname) ||
    currentUrl.searchParams.get('panel') === nextUrl.searchParams.get('panel')
  ) {
    return defaultShouldRevalidate;
  }

  const current = new URL(currentUrl);
  const next = new URL(nextUrl);
  current.searchParams.delete('panel');
  next.searchParams.delete('panel');

  // Root data is locale/SEO metadata; neither depends on the IDE panel.
  return current.href === next.href ? false : defaultShouldRevalidate;
};
