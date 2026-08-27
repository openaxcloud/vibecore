import { data as json, redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';

import { MarketingStaticPage } from '~/components/marketing/EcodeMarketingPages';
import {
  formatMarketingCommunityRouteCopy,
  getMarketingCommunityRouteCopy,
} from '~/lib/i18n/catalogs/marketing-community-route';
import { buildRemainingRouteMeta } from '~/lib/i18n/catalogs/remaining-route-shells';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { buildCommunityPostPage, findCommunityPost } from '~/lib/marketing/community-content';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const detail = getMarketingCommunityRouteCopy(data?.language).communityRoute.detail;
  const postTitle = data?.post.title ?? detail.seoFallbackTitle;
  const title = formatMarketingCommunityRouteCopy(detail.seoTitle, { title: postTitle });

  return buildRemainingRouteMeta({
    title,
    description: data?.post.summary ?? detail.seoDescription,
    path: `/community/post/${encodeURIComponent(data?.post.id ?? '')}`,
    language: data?.language,
  });
};

export function loader({ params, request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, localeResolution);
  const post = findCommunityPost(params.id, localeResolution.language);

  if (!post) {
    /*
     * Unknown post id: send visitors back to the public community index
     * instead of fabricating a generic templated page.
     */
    throw redirect('/community', { headers });
  }

  return json({ language: localeResolution.language, post }, { headers });
}

export default function CommunityPostRoute() {
  const { language, post } = useLoaderData<typeof loader>();
  const page = buildCommunityPostPage(post, language);

  return <MarketingStaticPage page={page} />;
}
