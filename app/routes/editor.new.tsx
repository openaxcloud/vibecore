import {
  EcodeSurfacePage,
  getEcodeStandaloneSurfacePage,
  makeEcodeSurfaceMeta,
} from '~/components/marketing/EcodeSurfacePages';

const page = getEcodeStandaloneSurfacePage('editor/new')!;

export const meta = makeEcodeSurfaceMeta(page);

export default function EditorNewRoute() {
  return <EcodeSurfacePage page={page} />;
}
