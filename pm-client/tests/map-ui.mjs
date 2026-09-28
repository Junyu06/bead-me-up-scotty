// Synthetic Tauri IPC. No BD process or real user records.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const base = process.env.PM_TEST_URL;
assert.ok(base);
const browser = await (
  process.env.PM_BROWSER === "webkit" ? webkit : chromium
).launch();
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    const issue = (
      id,
      title,
      parent,
      issue_type = "task",
      dependencies = [],
    ) => ({
      id,
      title,
      parent,
      issue_type,
      dependencies,
      status: "open",
      priority: 2,
      updated_at: "2026-09-27T00:00:00Z",
      description: "",
    });
    const dep = (id) => ({ depends_on_id: id, type: "blocks" });
    const items = [
      issue("project", "Synthetic map", undefined, "epic"),
      issue("phase-5", "5. Deliver", "project", "epic", [dep("phase-4")]),
      issue("phase-4", "4. Verify", "project", "epic", [dep("phase-3")]),
      issue("phase-3", "3. Implement", "project", "epic", [dep("phase-2")]),
      issue("phase-2", "2. Prepare", "project", "epic"),
      issue("parent", "Implementation group", "phase-3"),
      issue("a", "First implementation", "parent"),
      issue("b", "Second implementation", "parent", "task", [dep("a")]),
      issue("c", "Verification", "phase-4", "task", [
        dep("b"),
        dep("external"),
        dep("missing-external"),
      ]),
      issue("direct", "Project task", "project", "task", [dep("a")]),
    ];
    items.push(
      issue("external-project", "Another project", undefined, "epic"),
      issue("external", "External prerequisite", "external-project"),
    );
    window.__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === "workspace_settings")
          return {
            config: {
              workspace: "/synthetic",
              executable: "/synthetic/bd",
              actor: "",
            },
          };
        if (command === "read_workspace")
          return {
            workspace: "map-test",
            name: "Synthetic",
            now: "2026-09-27T16:00:00Z",
            items,
            ready: [],
            blocked: [],
          };
        throw new Error(`Unexpected mutation ${command}`);
      },
    };
  });
  await page.goto(base);
  await page
    .locator("aside")
    .getByRole("button", { name: "Map", exact: true })
    .click();
  await page.locator('[data-id="c"]').waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__edge-path").length >= 6,
  );
  const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
  const bounds = {};
  for (const id of [
    "phase-2",
    "phase-3",
    "phase-4",
    "phase-5",
    "parent",
    "a",
    "b",
  ])
    bounds[id] = await node(id).boundingBox();
  assert.ok(
    bounds["phase-2"].x < bounds["phase-3"].x &&
      bounds["phase-3"].x < bounds["phase-4"].x &&
      bounds["phase-4"].x < bounds["phase-5"].x,
  );
  assert.ok(
    bounds.parent.x >= bounds["phase-3"].x &&
      bounds.parent.y > bounds["phase-3"].y,
  );
  assert.ok(
    bounds.a.x > bounds.parent.x &&
      bounds.a.y > bounds.parent.y &&
      bounds.a.y + bounds.a.height < bounds.parent.y + bounds.parent.height,
  );
  const clearPaths = async () => {
    const hits = await page.evaluate(() => {
      const blocks = [
        ...document.querySelectorAll(".map-ticket,.map-group-header"),
      ].map((e) => ({
        id: e.closest(".react-flow__node")?.getAttribute("data-id"),
        box: e.getBoundingClientRect(),
      }));
      const hits = [];
      for (const p of document.querySelectorAll(".react-flow__edge-path")) {
        const matrix = p.getScreenCTM(),
          length = p.getTotalLength();
        for (let n = 3; n < length - 3; n += 3) {
          const q = p.getPointAtLength(n),
            point = new DOMPoint(q.x, q.y).matrixTransform(matrix);
          for (const { id, box } of blocks)
            if (
              point.x > box.left + 2 &&
              point.x < box.right - 2 &&
              point.y > box.top + 2 &&
              point.y < box.bottom - 2
            ) {
              hits.push({
                edge: p.closest(".react-flow__edge")?.getAttribute("data-id"),
                card: id,
              });
              n = length;
              break;
            }
        }
      }
      return hits;
    });
    assert.deepEqual(
      hits,
      [],
      "SVG routes must not cross rendered cards or headers",
    );
  };
  await clearPaths();
  await page.screenshot({
    path: `test-results/map-${process.env.PM_BROWSER ?? "chromium"}.png`,
  });
  await page
    .getByRole("button", { name: "收起 Implementation group", exact: true })
    .click();
  assert.equal(await node("a").count(), 0);
  assert.equal(await node("b").count(), 0);
  await clearPaths();
  await page
    .getByRole("button", { name: "展开 Implementation group", exact: true })
    .click();
  await node("a").waitFor();
  await page
    .getByRole("textbox", { name: "搜索标题或 ID", exact: true })
    .fill("Verification");
  assert.equal(await node("a").count(), 0);
  assert.equal(
    await page.locator('.react-flow__edge[data-id="parent:c"]').count(),
    0,
    "filtering must not invent a parent dependency",
  );
  await page.getByRole("button", { name: "清空搜索", exact: true }).click();
  await node("a").waitFor();
  await clearPaths();
  await page.getByRole("button", { name: "查看依赖", exact: true }).click();
  assert.ok(
    await page
      .locator(".edge-detail")
      .getByRole("button", { name: "External prerequisite", exact: true })
      .isVisible(),
  );
  const missing = page.locator(".edge-detail").getByRole("button", {
    name: "missing-external",
    exact: true,
  });
  assert.ok(await missing.isVisible());
  assert.ok(await missing.isDisabled());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: dependency order, nested containment, rendered SVG obstacle avoidance, collapse and filter truthfulness",
  );
} finally {
  await browser.close();
}
