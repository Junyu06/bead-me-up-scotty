import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
const protocol = { protocol: "beads-create", version: 1, scheme: "typed-sequential-v1" };
function compatible(value) {
  return Object.entries(protocol).every(([key, expected]) => value?.[key] === expected);
}

export async function resolveCreator() {
  const candidates = [];
  if (process.env.BEADS_CREATE_BIN) candidates.push(process.env.BEADS_CREATE_BIN);
  else {
    for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
      candidates.push(path.join(dir, "crates/beads-core/target/release/beads-create"));
      if (path.dirname(dir) === dir) break;
    }
    for (const dir of (process.env.PATH || "").split(path.delimiter)) {
      if (dir) candidates.push(path.join(dir, "beads-create"));
    }
    if (process.platform === "darwin") {
      for (const base of [path.join(os.homedir(), "Applications"), "/Applications"]) {
        const app = path.join(base, "Beads PM.app/Contents");
        try {
          // Older app binaries launch a window instead of handling CLI requests.
          if (compatible(JSON.parse(fs.readFileSync(path.join(app, "Resources/numbering.json"), "utf8")))) {
            candidates.push(path.join(app, "MacOS/beads-pm"));
          }
        } catch { /* No compatible installed app. */ }
      }
    }
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const { stdout } = await exec(candidate, ["protocol"], { timeout: 5000, maxBuffer: 4096 });
      if (compatible(JSON.parse(stdout))) return candidate;
    } catch { /* Try the next candidate; never fall back to raw bd create. */ }
  }
  throw new Error("Sequential creator unavailable. Build crates/beads-core, install the current Beads PM app, or set BEADS_CREATE_BIN to beads-create.");
}

/** Keep the helper alive through HTTP disconnects: it owns the workspace lock.
 * Each BD subprocess has its own bounded timeout in the shared Rust core. */
export async function createBead(workspace, bd, actor, input) {
  const executable = await resolveCreator();
  const operation = input.operation || randomUUID();
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ executable, ["create", "--workspace", workspace, "--bd", bd, "--actor", actor, "--input-json"], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "", stderr = "", oversized = false;
    const collect = (which, chunk) => {
      if (oversized) return;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(chunk) > 32 * 1024 * 1024) { oversized = true; return; }
      if (which === "out") stdout += chunk; else stderr += chunk;
    };
    child.stdout.on("data", c => collect("out", c));
    child.stderr.on("data", c => collect("err", c));
    child.stdin.on("error", () => { /* close reports the operation result */ });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || oversized) return reject(new Error(`${stderr.trim() || "Creation result could not be confirmed"}\nRetry operation: ${operation}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`Invalid creation result. Check operation ${operation} before retrying.`)); }
    });
    child.stdin.end(JSON.stringify({ ...input, operation }));
  });
}
