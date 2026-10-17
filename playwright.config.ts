import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 412, height: 915 }, // téléphone
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris', // différent de Djerba : l'application doit utiliser Africa/Tunis
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    // Mode démonstration forcé : aucune variable Firebase.
    env: { VITE_FIREBASE_PROJECT_ID: '' },
  },
});
