import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
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
