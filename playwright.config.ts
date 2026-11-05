import { defineConfig,devices } from '@playwright/test';
export default defineConfig({testDir:'./e2e',fullyParallel:true,use:{baseURL:process.env.HORIZON_E2E_URL??'http://localhost:8889',trace:'off',screenshot:'off',video:'off'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],browserName:'chromium'}}]});
