#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolveCreator } from "../lib/beads-create.mjs";
try {
  const built = fileURLToPath(new URL("../crates/beads-core/target/release/beads-create", import.meta.url));
  if (!process.env.BEADS_CREATE_BIN && existsSync(built)) process.env.BEADS_CREATE_BIN = built;
  const executable = await resolveCreator();
  const args = process.argv.slice(2);
  const child = spawn(executable, args.length ? args : ["--help"], { stdio: "inherit" });
  child.on("error", e => { console.error(e.message); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
