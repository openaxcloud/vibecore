import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createEditorSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createEditorSurfacePage(params.id ?? 'unknown'));

export default function EditorSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createEditorSurfacePage(params.id ?? 'unknown')} />;
}
