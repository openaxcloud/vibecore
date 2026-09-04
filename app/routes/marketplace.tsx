import { Outlet } from 'react-router';

/*
 * Pathless-content layout for /marketplace.
 *
 * The marketplace overview page lives in `marketplace._index.tsx`; this layout
 * only renders the outlet so that nested routes such as
 * `marketplace.templates.tsx` (the /marketplace/templates alias of /templates)
 * actually render instead of being shadowed by the overview page, which has no
 * <Outlet /> of its own.
 */
export default function MarketplaceLayout() {
  return <Outlet />;
}
