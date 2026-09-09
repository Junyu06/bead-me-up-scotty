import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type { UpdateStatus, UpdateStep, UpdateResult } from "./update-types";

export type { UpdateStatus, UpdateStep, UpdateResult };

/**
 * Self-update support (bead bgb). Detects when the app's own git clone is behind
 * the branch configured as its git upstream and applies an update: git pull → npm install (if deps changed) →
 * next build → relaunch. Only meaningful when the server runs from the app's own
 * git checkout (dev / self-host) — under the global `scotty` install there's no
 * source to pull and no devDeps to build with, so everything degrades to a no-op.
 *
 * The Next server always runs with cwd = the app package root (the launcher sets
 * cwd: ROOT; `npm run dev/start/serve` run from the repo), so appRoot = cwd.
 */

const pexec = promisify(execFile);
const GIT_TIMEOUT = 20_000;
/** Exit code the run route uses to ask the supervised launcher to relaunch. */
export const RESTART_EXIT_CODE = 75;

function appRoot(): string {
  return process.cwd();
}
export function isAppGitRepo(): boolean {
  try {
    return fs.existsSync(path.join(appRoot(), ".git"));
  } catch {
    return false;
  }
}
export function isSupervised(): boolean {
  return process.env.BMUS_SUPERVISED === "1";
}
async function git(args: string[]): Promise<string> {
  const { stdout } = await pexec("git", args, {
    cwd: appRoot(),
    timeout: GIT_TIMEOUT,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  const base: UpdateStatus = {
    isGitRepo: false,
    supervised: isSupervised(),
    behind: 0,
    localSha: "",
    remoteSha: "",
  };
  if (!isAppGitRepo()) return base;
  try {
    const localSha = await git(["rev-parse", "--short=7", "HEAD"]);
    // Follow this checkout's configured branch on the user's fork. Pulling
    // origin/main unconditionally would bypass the custom branch's history.
    await git(["fetch", "--quiet"]);
    const remoteSha = await git(["rev-parse", "--short=7", "@{upstream}"]);
    const behind = Number(await git(["rev-list", "--count", "HEAD..@{upstream}"])) || 0;
    return { ...base, isGitRepo: true, behind, localSha, remoteSha };
  } catch (e) {
    // Offline / no remote / detached HEAD — report but don't surface an indicator.
    return { ...base, isGitRepo: true, error: (e as Error).message };
  }
}

export async function runUpdate(): Promise<UpdateResult> {
  if (!isAppGitRepo()) throw new Error("Not running from a git checkout — cannot self-update.");
  // A dirty working tree makes `git pull --ff-only` abort with a cryptic message
  // and leaves the indicator stuck on "Update available". Catch it early with an
  // actionable error instead.
  const dirty = await git(["status", "--porcelain"]).catch(() => "");
  if (dirty.trim()) {
    throw new Error("Your checkout has uncommitted changes — commit or stash them, then try again.");
  }
  const steps: UpdateStep[] = [];
  const run = async (name: string, cmd: string, args: string[]) => {
    try {
      const { stdout, stderr } = await pexec(cmd, args, {
        cwd: appRoot(),
        timeout: 5 * 60_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      steps.push({ name, ok: true, output: `${stdout}${stderr}`.trim().slice(-4000) });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      steps.push({ name, ok: false, output: `${err.stdout ?? ""}${err.stderr ?? err.message ?? ""}`.trim().slice(-4000) });
      const last = (err.stderr || err.message || "").trim().split("\n").filter(Boolean).pop() || "failed";
      throw new Error(`${name} failed: ${last}`);
    }
  };

  const fromSha = await git(["rev-parse", "--short=7", "HEAD"]);
  await run("git pull", "git", ["pull", "--ff-only"]);
  const toSha = await git(["rev-parse", "--short=7", "HEAD"]);

  let depsChanged = false;
  try {
    const changed = await git(["diff", "--name-only", fromSha, "HEAD"]);
    // Match any manifest/lockfile by basename so nested packages and non-npm
    // package managers (pnpm/yarn) still trigger an install.
    const DEP_FILES = new Set(["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
    depsChanged = changed
      .split("\n")
      .map((f) => f.trim())
      .some((f) => f && DEP_FILES.has(f.split("/").pop() as string));
  } catch {
    /* if the diff fails, skip install (build will still run) */
  }
  if (depsChanged) await run("npm install", "npm", ["install", "--no-audit", "--no-fund"]);
  await run("next build", "npm", ["run", "build"]);

  return { ok: true, steps, restarting: isSupervised(), fromSha, toSha };
}
