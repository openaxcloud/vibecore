import type { MetaFunction } from '@remix-run/cloudflare';
import {
  EcodeAdvancedSurfaceRoute,
  getEcodeAdvancedSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) => {
  const page = getEcodeAdvancedSurfacePage(params.section ?? '');

  return page ? makeEcodeSurfaceMetaTags(page) : [{ title: 'Advanced E-Code surface not found' }];
};

export default function AdvancedEcodeSurfaceRoute() {
  return <EcodeAdvancedSurfaceRoute />;
}
