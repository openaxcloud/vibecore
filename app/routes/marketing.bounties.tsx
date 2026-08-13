import type { MetaFunction } from 'react-router';
import MarketingBounties from '~/components/marketing/ecode-exact/pages/Bounties';

/*
 * Dedicated React route for /marketing/bounties — more specific than the
 * `marketing.$slug` catch-all (which serves the old purple static bundle), so
 * RR7 renders the on-theme (E-Code orange) React page here instead.
 */
export const meta: MetaFunction = () => [
  { title: 'Bounties — E-Code' },
  { name: 'description', content: 'Earn rewards building and improving on E-Code — open bounties for the community.' },
];

export default function MarketingBountiesRoute() {
  return <MarketingBounties />;
}
