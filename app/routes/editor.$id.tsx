import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import {
  createEditorSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return makeEcodeSurfaceMetaTags(createEditorSurfacePage(params.id ?? '—'), rootData?.language);
};

export default function EditorSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createEditorSurfacePage(params.id ?? '—')} />;
}
