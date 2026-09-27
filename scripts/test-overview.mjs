// Pure Overview view-model coverage. The fixtures stay synthetic and never
// read or mutate a project's local Beads store.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();

function load(url) {
  if (cache.has(url)) return cache.get(url).exports;
  const moduleRecord = { exports: {} };
  cache.set(url, moduleRecord);
  const source = readFileSync(new URL(url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: moduleRecord.exports,
    module: moduleRecord,
    require: (name) =>
      name.startsWith(".")
        ? load(new URL(`${name}.ts`, url).href)
        : nodeRequire(name),
  });
  return moduleRecord.exports;
}

const { defaultView, isView } = load(new URL("../lib/views.ts", import.meta.url).href);
const { overviewRows, overviewChildrenMap, overviewProgress, visibleOverviewChildren } = load(
  new URL("../lib/overview.ts", import.meta.url).href,
);

const bead = (id, extra = {}) => ({
  id,
  title: `Synthetic ${id}`,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});
const parent = (child, target) => ({ issue_id: child, depends_on_id: target, type: "parent-child" });

const beads = [
  bead("workstream", { issue_type: "epic" }),
  bead("open-child", { dependencies: [parent("open-child", "workstream")] }),
  bead("closed-child", { status: "closed", dependencies: [parent("closed-child", "workstream")] }),
  bead("archived-child", { labels: ["archived"], dependencies: [parent("archived-child", "workstream")] }),
  bead("independent-idea", { status: "idea" }),
  bead("independent-task"),
  bead("dotted-standalone.task"),
  bead("orphan", { dependencies: [parent("orphan", "missing-parent")] }),
  bead("closed-top", { status: "closed" }),
  bead("archived-top", { status: "closed", labels: ["archived"] }),
];

const topLevelIds = overviewRows(beads).map(({ bead: item }) => item.id).sort();
assert.deepEqual(topLevelIds, [
  "dotted-standalone.task",
  "independent-idea",
  "independent-task",
  "orphan",
  "workstream",
]);

const workstream = overviewRows(beads).find(({ bead: item }) => item.id === "workstream");
assert.ok(workstream);
assert.deepEqual(
  JSON.parse(JSON.stringify(workstream.progress)),
  { closed: 1, total: 3, pct: 33 },
  "progress counts hidden children accurately",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(workstream.children.map((item) => item.id).sort())),
  ["archived-child", "closed-child", "open-child"],
  "children come from parent-child edges rather than dotted IDs",
);

const children = overviewChildrenMap(beads);
assert.deepEqual(
  JSON.parse(JSON.stringify(visibleOverviewChildren(children.get("workstream")).map((item) => item.id))),
  ["open-child"],
  "closed and archived children are hidden by the default model filter",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(overviewProgress(children.get("workstream")))),
  { closed: 1, total: 3, pct: 33 },
);

const allRows = overviewRows(beads, { showClosed: true, showArchived: true });
assert.ok(allRows.some(({ bead: item }) => item.id === "closed-top"));
assert.ok(allRows.some(({ bead: item }) => item.id === "archived-top"));
assert.ok(
  overviewRows(beads, { showArchived: true }).some(({ bead: item }) => item.id === "archived-top"),
  "Show archived reveals archived rows even when archive also closed them",
);
assert.ok(!allRows.some(({ bead: item }) => item.id === "open-child"), "children never become top-level rows");
assert.equal(defaultView(false), "overview");
assert.equal(defaultView(true), "focus");
assert.equal(isView("overview"), true);
assert.equal(isView("unknown"), false);

console.log("PASS: Overview top-level relation filtering, standalone items, missing parents, hidden children, accurate progress, and default view");

const orderedChecklist = [
  bead("parent-list", { issue_type: "epic" }),
  bead("random-c", { title: "3. Verify delivery", dependencies: [parent("random-c", "parent-list")] }),
  bead("random-b", { title: "2. Connect the client", dependencies: [parent("random-b", "parent-list")] }),
  bead("random-z", { title: "1. Build the client", status: "closed", dependencies: [parent("random-z", "parent-list")] }),
];
assert.deepEqual(
  Array.from(overviewRows(orderedChecklist)[0].children, (item) => item.id),
  ["random-z", "random-b", "random-c"],
  "completed steps keep their authored checklist position instead of sorting by random ID",
);
console.log("PASS: numbered checklist order keeps completed steps in place");
