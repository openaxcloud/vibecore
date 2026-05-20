import type { MetaFunction } from '@remix-run/cloudflare';
import {
  EcodeSurfacePageBySlug,
  getEcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) => {
  const page = getEcodeSurfacePage(params.slug ?? '');

  return page ? makeEcodeSurfaceMetaTags(page) : [{ title: 'E-Code surface not found' }];
};

export default function EcodeRootSurfaceRoute() {
  return <EcodeSurfacePageBySlug />;
}
