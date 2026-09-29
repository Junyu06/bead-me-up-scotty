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
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    const project = {
      id: "test-project",
      title: "Synthetic project",
      issue_type: "epic",
      status: "open",
      priority: 2,
      updated_at: "same-second",
      description: "",
    };
    let ticket = {
      ...project,
      id: "test-0123456789abcdef0123456789abcdef",
      title: "Synthetic request",
      issue_type: "task",
      parent: project.id,
      notes: "Review this work",
      labels: ["human"],
      _pm_version: "fingerprint-0",
    };
    let version = 0,
      failSave = true,
      failRead = false;
    window.testBridge = {
      failRead: () => {
        failRead = true;
      },
    };
    const withoutVersion = ({ ...row }) => {
      delete row._pm_version;
      return row;
    };
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
        if (command === "read_workspace") {
          if (failRead) throw "Synthetic read failure";
          return {
            workspace: "synthetic-workspace",
            name: "Synthetic",
            now: "2026-09-27T16:00:00Z",
            items: [project, withoutVersion(ticket)],
            ready: [],
            blocked: [],
          };
        }
        if (command === "read_issue") return { ...ticket };
        if (command === "save_issue") {
          if (failSave) {
            failSave = false;
            throw "Synthetic save conflict";
          }
          if (args.patch.version !== ticket._pm_version)
            throw "Wrong fingerprint";
          ticket = {
            ...ticket,
            ...args.patch.fields,
            _pm_version: `fingerprint-${++version}`,
          };
          return { ...ticket };
        }
        if (command === "issue_action") {
          if (args.input.version !== ticket._pm_version)
            throw "Wrong fingerprint";
          ticket = {
            ...ticket,
            labels: [],
            notes: "Answer saved",
            _pm_version: `fingerprint-${++version}`,
          };
          return { ...ticket };
        }
        throw `Unexpected ${command}`;
      },
    };
  });
  await page.goto(base);
  assert.equal(await page.locator(".demo-badge").count(), 0);
  await page
    .locator("aside")
    .getByRole("button", { name: "Board", exact: true })
    .click();
  const card = page
    .locator(".ticket-card")
    .filter({ hasText: "Synthetic request" });
  const code = card.locator("code");
  const codeBox = await code.boundingBox();
  const priorityBox = await card.locator(".priority").boundingBox();
  assert.ok(
    codeBox.x + codeBox.width < priorityBox.x,
    "legacy IDs must not overlap priority",
  );
  assert.equal(
    await code.getAttribute("title"),
    "test-0123456789abcdef0123456789abcdef",
  );
  await page
    .locator("aside")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  await page.getByRole("button", { name: /Synthetic request/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByText("待处理", { exact: true }).count(), 1);
  await dialog.getByRole("button", { name: "编辑", exact: true }).click();
  const title = dialog.getByRole("textbox", { name: "标题", exact: true });
  await title.fill("Changed once");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "Synthetic save conflict" })
    .waitFor();
  assert.equal(
    await title.inputValue(),
    "Changed once",
    "failed save preserves draft",
  );
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog
    .getByRole("heading", { name: "Changed once", exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "编辑", exact: true }).click();
  await title.fill("Changed twice");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog
    .getByRole("heading", { name: "Changed twice", exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "提交答复", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "答复", exact: true })
    .fill("An answer");
  await dialog
    .locator(".detail-confirm")
    .getByRole("button", { name: "提交答复", exact: true })
    .click();
  await dialog.getByText("Answer saved", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "编辑", exact: true }).click();
  await title.fill("Saved but refresh failed");
  await page.evaluate(() => window.testBridge.failRead());
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "修改已写入 BD" })
    .waitFor();
  assert.equal(await title.inputValue(), "Saved but refresh failed");
  await dialog.getByRole("button", { name: "关闭详情", exact: true }).click();
  await dialog.getByRole("button", { name: "放弃草稿", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });

  await page.evaluate(() => window.testBridge.failRead());
  await page.getByRole("button", { name: "刷新工作区", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Synthetic read failure" })
    .waitFor();
  assert.equal(
    await page.locator(".demo-badge").count(),
    0,
    "failure never switches to fixtures",
  );
  assert.equal(
    await page
      .locator("aside")
      .getByRole("button", { name: "新建工单", exact: true })
      .isDisabled(),
    true,
    "failed refresh disables writes",
  );
  assert.equal(
    await page.getByRole("button", { name: /工作空间更新/ }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live-mode save error keeps draft, repeated save retains content fingerprint, response readback and connection failure do not fall back to fixtures",
  );
} finally {
  await browser.close();
}
