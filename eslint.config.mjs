import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Use src/lib/logger.ts so logs stay structured and redacted.
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              importNames: ["createClient"],
              message:
                "Use the factories in @/lib/supabase/* so sessions, cookies and RLS context are handled correctly.",
            },
          ],
        },
      ],
    },
  },
  {
    // Places where console output or raw clients are the point.
    files: [
      "src/lib/logger.ts",
      "src/lib/supabase/admin.ts",
      "e2e/**",
      "supabase/tests/**",
      "*.config.{ts,mts,mjs}",
    ],
    rules: {
      "no-console": "off",
      "no-restricted-imports": "off",
    },
  },
  // Must stay last: disables stylistic rules that Prettier owns.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
    "next-env.d.ts",
  ]),
])
