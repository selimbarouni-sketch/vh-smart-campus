import { defineConfig } from 'vitest/config';

// Tests des règles de sécurité : à lancer via « npm run test:regles » (émulateur Firestore).
export default defineConfig({
  // Un seul émulateur partagé : les fichiers de test s'exécutent l'un après l'autre.
  test: { include: ['tests/regles/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
});
