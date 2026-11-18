import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'bootstrap.pw.ts',workers:1,retries:0,timeout:210_000,globalTimeout:240_000,reporter:[['./reporter.ts']],use:{headless:true,actionTimeout:15_000,navigationTimeout:90_000,trace:'off',screenshot:'off',video:'off'},outputDir:process.env.VC_IDE_PRIVATE_RESULTS??'/tmp/vc-ide-probe-results'});
