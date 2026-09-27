import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Bundle the same ESM + existing Scotty TS boundary as Vite. No bd or browser
// process is involved; the tests only consume synthetic data.
await mkdir("test-results", { recursive: true });
await build({
  entryPoints: ["tests/domain.test.ts"],
  outfile: "test-results/domain.test.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  external: ["react", "react/*", "react-dom/*", "lucide-react"],
  sourcemap: "inline",
});
const result = spawnSync(
  process.execPath,
  ["--test", "test-results/domain.test.mjs"],
  { stdio: "inherit", timeout: 30000 },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
