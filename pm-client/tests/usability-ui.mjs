// Tauri IPC is mocked with synthetic records; this never opens a BD database.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const base = process.env.PM_TEST_URL;
assert.ok(base);
const browser = await (
  process.env.PM_BROWSER === "webkit" ? webkit : chromium
).launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    const row = (fields) => ({
      priority: 2,
      updated_at: "2026-09-29T10:00:00Z",
      description: "",
      labels: [],
      ...fields,
    });
    const items = [
      row({
        id: "proj-1",
        title: "Active line",
        issue_type: "epic",
        status: "in_progress",
      }),
      row({
        id: "proj-2",
        title: "Finished line",
        issue_type: "epic",
        status: "closed",
        closed_at: "2026-09-22T12:00:00Z",
      }),
      row({
        id: "proj-3",
        title: "Paused line",
        issue_type: "epic",
        status: "deferred",
      }),
      row({
        id: "id-1",
        title: "Open child",
        issue_type: "task",
        status: "idea",
        parent: "proj-1",
      }),
      row({
        id: "id-2",
        title: "Closed child",
        issue_type: "task",
        status: "closed",
        parent: "proj-1",
        closed_at: "2026-09-28T12:00:00Z",
      }),
      row({
        id: "id-3",
        title: "Needs a person",
        issue_type: "task",
        status: "in_progress",
        parent: "proj-3",
        labels: ["human"],
        notes: "Please look",
      }),
    ];
    let version = 0;
    window.saves = [];
    const find = (id) => items.find((i) => i.id === id);
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
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
            workspace: "usability",
            name: "Synthetic",
            now: "2026-09-29T16:00:00Z",
            items: items.map((i) => ({ ...i })),
            ready: [],
            blocked: [],
          };
        if (command === "read_issue")
          return { ...find(args.id), _pm_version: `v${version}` };
        if (command === "save_issue") {
          window.saves.push(args.patch);
          Object.assign(find(args.patch.id), args.patch.fields);
          version++;
          return { ...find(args.patch.id), _pm_version: `v${version}` };
        }
        throw `Unexpected ${command}`;
      },
    };
  });
  await page.goto(base);

  // Projects: finished lines leave the table and the sidebar.
  const table = page.locator(".project-table");
  await table.getByText("Active line", { exact: true }).waitFor();
  assert.equal(await table.getByText("Finished line").count(), 0);
  assert.equal(
    await table
      .locator(".project-table-row", { hasText: "Paused line" })
      .getByText("On hold")
      .count(),
    1,
  );
  const sidebar = page.locator(".sidebar-projects");
  assert.equal(await sidebar.getByText("Finished line").count(), 0);
  assert.equal(await sidebar.getByText("Active line").count(), 1);
  const toggle = page.getByRole("button", { name: /已结束/ });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await toggle.click();
  const finished = page.locator(".finished-row", { hasText: "Finished line" });
  await finished.getByText("9月22日关闭").waitFor();

  // A project with an open child cannot be closed, and says why.
  await table.getByText("Active line", { exact: true }).click();
  await page.getByRole("button", { name: "打开详情", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const close = dialog.getByRole("button", { name: "关闭工单", exact: true });
  assert.equal(await close.isDisabled(), true);
  await dialog.getByText("还有 1 张子工单未关闭").waitFor();
  await dialog.getByRole("button", { name: "关闭详情", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });

  // Status changes without entering edit mode and sends only the status.
  await page
    .locator("aside")
    .getByRole("button", { name: "Board", exact: true })
    .click();
  await page.locator(".ticket-card", { hasText: "Open child" }).click();
  dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator(".status-quick select").selectOption("parked");
  await dialog.locator(".detail-status .stage-parked").waitFor();
  const saves = await page.evaluate(() => window.saves);
  assert.deepEqual(
    saves.map((s) => s.fields),
    [{ status: "parked" }],
  );
  await dialog.getByRole("button", { name: "关闭详情", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const parked = page.locator(".board-column", { hasText: "Parked" });
  await parked.locator(".ticket-card", { hasText: "Open child" }).waitFor();
  assert.ok(
    (await page.locator(".board-column.collapsed").count()) > 0,
    "empty status columns collapse",
  );

  // Need Me opens on all projects even after browsing one project.
  await sidebar.getByText("Active line").click();
  await page
    .locator("aside")
    .getByRole("button", { name: /Need Me/ })
    .click();
  await page.locator(".request-row", { hasText: "Needs a person" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: finished projects fold away, open children block closing with a reason, quick status change, Parked column, Need Me scope",
  );
} finally {
  await browser.close();
}
