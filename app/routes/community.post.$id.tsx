import { data as json, redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { MarketingStaticPage } from '~/components/marketing/EcodeMarketingPages';
import { buildCommunityPostPage, findCommunityPost } from '~/lib/marketing/community-content';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.page.title ?? 'Community discussion';

  return [
    { title: `${title} - E-Code Community` },
    {
      name: 'description',
      content:
        data?.page.description ??
        'Public E-Code community discussion rendered with the marketing header, footer and theme instead of authenticated workspace chrome.',
    },
  ];
};

export function loader({ params }: LoaderFunctionArgs) {
  const post = findCommunityPost(params.id);

  if (!post) {
    /*
     * Unknown post id: send visitors back to the public community index
     * instead of fabricating a generic templated page.
     */
    throw redirect('/community');
  }

  return json({ page: buildCommunityPostPage(post) });
}

export default function CommunityPostRoute() {
  const { page } = useLoaderData<typeof loader>();

  return <MarketingStaticPage page={page} />;
}
