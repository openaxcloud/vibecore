import type { MetaFunction } from 'react-router';
import PublicTeamPage from '~/components/marketing/ecode-exact/pages/PublicTeamPage';

/*
 * Dedicated React route for /marketing/teams — more specific than the
 * `marketing.$slug` catch-all (which serves the old blue/purple static bundle),
 * so RR7 renders the on-theme (E-Code orange) React page here instead.
 */
export const meta: MetaFunction = () => [
  { title: 'Teams — E-Code' },
  {
    name: 'description',
    content: 'Build together and ship faster with E-Code — collaborative AI development for teams.',
  },
];

export default function MarketingTeamsRoute() {
  return <PublicTeamPage />;
}
