import {
  EcodeSurfacePage,
  getEcodeStandaloneSurfacePage,
  makeEcodeSurfaceMeta,
} from '~/components/marketing/EcodeSurfacePages';

const page = getEcodeStandaloneSurfacePage('ai-agent/studio')!;

export const meta = makeEcodeSurfaceMeta(page);

export default function AiAgentStudioRoute() {
  return <EcodeSurfacePage page={page} />;
}
