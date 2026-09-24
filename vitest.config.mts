import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // `server-only` throws outside Next's react-server build; tests run
      // server modules directly, so replace it with an empty module.
      "server-only": fromRoot("./src/test/stubs/server-only.ts"),
    },
  },
  test: {
    // Non-secret placeholders: modules that read the public env contract at
    // import (e.g. client components showing the app URL) need well-formed
    // values. Tests never make network calls.
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
    // Keep the three suites separate so each gets the right environment and
    // can be run on its own (npm run test:unit / test:db).
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "e2e/support/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup-dom.ts"],
          // jsdom + portalled menus can exceed the 5s default on a loaded machine
          // (e.g. with Docker running); a real hang still fails.
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["supabase/tests/**/*.test.ts"],
          // Booting WASM Postgres and applying migrations takes a moment.
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
