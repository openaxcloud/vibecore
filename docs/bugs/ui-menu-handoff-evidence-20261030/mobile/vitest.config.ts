import { defineConfig } from 'vitest/config';
export default defineConfig({root:'/workspace/ui856-menu-diagnostic',resolve:{alias:{'~':'/workspace/vibecore-ui-terminal-handoff/app'}},esbuild:{jsx:'automatic'},test:{environment:'jsdom'}});
