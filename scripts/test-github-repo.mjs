import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const output = ts.transpileModule(readFileSync("lib/github-repo.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { githubRepo } = await import(`data:text/javascript;base64,${Buffer.from(output.outputText).toString("base64")}`);
for (const remote of ["https://github.com/example/scotty.git", "git@github.com:example/scotty.git", "ssh://git@github.com/example/scotty.git", "https://credential@example.invalid/x"]) {
  assert.equal(githubRepo(remote), remote.includes("github.com") ? "example/scotty" : "");
}
assert.equal(githubRepo("https://placeholder-token@github.com/example/scotty.git"), "example/scotty");
for (const remote of ["/Users/sample/repo", "https://github.com/example/scotty?token=placeholder", "https://github.com.evil.invalid/example/scotty", ""]) assert.equal(githubRepo(remote), "");
console.log("GitHub metadata checks passed");
