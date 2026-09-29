import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBead } from "../lib/beads-create.mjs";
const dir = mkdtempSync(path.join(os.tmpdir(), "beads-creator-output-"));
const binary = path.join(dir, "creator");
writeFileSync(binary, `#!${process.execPath}
if (process.argv[2] === 'protocol') {
  console.log(JSON.stringify({protocol:'beads-create',version:1,scheme:'typed-sequential-v1'}));
} else {
  process.stdin.resume();
  process.stdin.on('end', () => {
    const b = Buffer.from(JSON.stringify({id:'id-1',title:'中文标题'}));
    const split = b.indexOf(Buffer.from('中')) + 1;
    process.stdout.write(b.subarray(0,split));
    setTimeout(() => process.stdout.write(b.subarray(split)), 30);
  });
}
`, { mode: 0o700 });
const previous = process.env.BEADS_CREATE_BIN;
process.env.BEADS_CREATE_BIN = binary;
try {
  const record = await createBead(dir, "unused", "test", { title: "中文标题" });
  assert.equal(record.title, "中文标题");
  console.log("PASS split UTF-8 output preserves Chinese fields");
} finally {
  if (previous === undefined) delete process.env.BEADS_CREATE_BIN;
  else process.env.BEADS_CREATE_BIN = previous;
}
