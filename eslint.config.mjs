import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["scripts/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design export (Claude Design runtime + prototype) — reference only.
    "design/**",
    // Claude Code git worktrees — transient repo copies + vendored design JS,
    // never our source. Linting them floods the output (bead kgq).
    ".claude/**",
    // Vite/Tauri client build artifacts; its source still receives lint checks.
    "desktop/target/**",
    "pm-client/src-tauri/gen/**",
    "pm-client/dist/**",
    "pm-client/src-tauri/target/**",
    "pm-client/test-results/**",
  ]),
]);

export default eslintConfig;
