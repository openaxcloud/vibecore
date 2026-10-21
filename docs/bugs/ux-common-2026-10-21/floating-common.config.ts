import config from '../../playwright.mobile-gate-audit.config';
export default {...config,testDir:'../../tests/e2e',testMatch:['ide-floating-file-tabs.spec.ts','ide-floating-viewport.spec.ts'],outputDir:'/workspace/ux-artifacts/common-749-750-753/floating-results',reporter:[['list'],['json',{outputFile:'/workspace/ux-artifacts/common-749-750-753/floating-results.json'}]]};
