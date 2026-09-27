import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/Markdown";
import { dependencySchema } from "../../lib/schema";
import { checklistProgress } from "../../lib/beads-view";
import { createFixture, DEMO_NOW } from "../src/fixtures";
import {
  acceptExample,
  assignees,
  createIdeaExample,
  respondExample,
  isBlocked,
  ancestry,
  blockers,
  dateLabel,
  dayOffset,
  descendants,
  emptyFilters,
  inDoneWindow,
  localDate,
  makeIndex,
  matches,
  progress,
  stageOf,
  timelineOrder,
  type RecordItem,
} from "../src/domain";
import { projectLinks } from "../src/map-model";
import { historyScope, projectScope } from "../src/navigation";
import { Projects, ProjectOverview } from "../src/Projects";
import { Detail } from "../src/Detail";

test("manual blocking is counted and prevents closing a Review ticket", () => {
  const original = createFixture();
  const s = {
    ...original,
    items: original.items.map((i) =>
      i.id === "demo-a" ? { ...i, status: "blocked" } : i,
    ),
  };
  const index = makeIndex(s.items);
  const item = index.byId.get("demo-a")!;
  assert.equal(stageOf(item, s, index), "Review");
  assert.deepEqual(blockers(item, index), []);
  assert.equal(isBlocked(item, index), true);
  assert.equal(progress("demo-atlas", s, index).blocked, 4);
  assert.equal(acceptExample(s, item.id), s);
  const html = renderToStaticMarkup(
    createElement(Detail, {
      item,
      index,
      snapshot: s,
      onClose() {},
      onOpen() {},
      onSave() {},
      onAccept() {},
      onRequestChanges() {},
      onRespond() {},
    }),
  );
  assert.match(html, /人工标记受阻/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*title="工单仍受阻，无法关闭"/,
  );
});

test("acceptance leaves containers out of executable readiness", () => {
  const s = acceptExample(createFixture(), "demo-a");
  const index = makeIndex(s.items);
  assert.equal(s.ready.has("demo-delivery"), false);
  assert.equal(
    stageOf(
      index.byId.get("demo-delivery")!,
      { ...s, ready: new Set([...s.ready, "demo-delivery"]) },
      index,
    ),
    "待分类",
  );
  assert.equal(index.byId.get("demo-delivery")!.status, "open");
  assert.equal(stageOf(index.byId.get("demo-b")!, s, index), "Ready");
  assert.equal(stageOf(index.byId.get("demo-e")!, s, index), "Blocked");
});

test("new Idea tickets remain independent and appear in the global Board scope", () => {
  const original = createFixture();
  const s = createIdeaExample(original, "  新工单  ", "描述");
  const item = s.items.at(-1)!;
  const index = makeIndex(s.items);
  assert.equal(item.title, "新工单");
  assert.equal(item.parent, undefined);
  assert.equal(item.role, "ticket");
  assert.equal(stageOf(item, s, index), "Idea");
  assert.equal(matches(item, emptyFilters, index), true);
  assert.equal(
    matches(item, { ...emptyFilters, project: "demo-atlas" }, index),
    false,
  );
  assert.equal(progress("demo-atlas", s, index).total, 231);
  assert.equal(original.items.length + 1, s.items.length);
  assert.equal(createIdeaExample(s, "  ", ""), s);
});

test("decision and action responses retain evidence without closing or unblocking tickets", () => {
  const original = createFixture();
  const reviewed = respondExample(original, "demo-a", "不能用答复替代验收");
  assert.equal(reviewed, original);
  assert.equal(respondExample(original, "demo-f", "   "), original);
  let s = original;
  for (const id of ["demo-f", "demo-independent"]) {
    const before = s.items.find((i) => i.id === id)!;
    s = respondExample(s, id, "  本轮已确认处理范围。  ");
    const item = s.items.find((i) => i.id === id)!;
    assert.equal(item.request, undefined);
    assert.equal(item.responses?.[0].body, "本轮已确认处理范围。");
    assert.deepEqual(item.responses?.[0].request, before.request);
    assert.equal(item.responses?.[0].at, s.now);
    assert.equal(item.status, before.status);
    assert.equal(item.assignee, before.assignee);
    assert.equal(item.description, before.description);
    assert.deepEqual(item.dependencies, before.dependencies);
    assert.equal(isBlocked(item, makeIndex(s.items)), true);
    assert.equal(respondExample(s, id, "重复提交"), s);
  }
  assert.equal(
    s.items.filter((i) => i.request && i.status !== "closed").length,
    2,
  );
  assert.equal(progress("demo-atlas", s, makeIndex(s.items)).decision, 0);
  assert.equal(
    original.items.find((i) => i.id === "demo-f")!.responses,
    undefined,
  );
});

test("project navigation separates project lookup from ticket filters and history opens full scope", () => {
  const s = createFixture(),
    index = makeIndex(s.items);
  const filters = {
    ...emptyFilters,
    search: "阅读",
    owner: "reviewer",
    project: "demo-atlas",
    milestone: "demo-content",
  };
  const next = projectScope(filters, "demo-notes", true);
  assert.equal(next.search, "");
  assert.equal(next.milestone, "all");
  assert.equal(next.owner, "reviewer");
  assert.equal(matches(index.byId.get("demo-note-b")!, next, index), true);
  assert.equal(projectScope(filters, "demo-notes", false).search, "阅读");
  const history = historyScope("demo-atlas");
  assert.equal(history.search, "");
  assert.equal(history.owner, "all");
  assert.equal(
    s.items.filter((i) => i.status === "closed" && matches(i, history, index))
      .length,
    223,
  );
  assert.equal(
    historyScope("demo-atlas", "demo-content").milestone,
    "demo-content",
  );
});

test("project surfaces expose decision and action requests and project ID lookup", () => {
  const original = createFixture();
  const s = {
    ...original,
    items: original.items.map((i) =>
      i.id === "demo-independent" ? { ...i, parent: "demo-atlas" } : i,
    ),
  };
  const index = makeIndex(s.items);
  const html = renderToStaticMarkup(
    createElement(Projects, {
      snapshot: s,
      index,
      search: "demo-atlas",
      onProject() {},
      onOpen() {},
    }),
  );
  assert.match(html, /223 \/ 232 已关闭/);
  assert.match(html, /1 待决策/);
  assert.match(html, /1 待操作/);
  assert.match(html, /4 受阻/);
  assert.doesNotMatch(html, /8 \/ 10 已关闭/);
  const overview = renderToStaticMarkup(
    createElement(ProjectOverview, {
      snapshot: s,
      index,
      project: index.byId.get("demo-atlas")!,
      filters: emptyFilters,
      onView() {},
      onOpen() {},
      onHistory() {},
    }),
  );
  assert.match(overview, /1 待验收 · 1 待决策 · 1 待操作/);
});

test("mixed hierarchy includes direct tickets, nested milestones and standalone tickets", () => {
  const s = createFixture(),
    i = makeIndex(s.items);
  assert.equal(i.diagnostics.length, 0);
  assert.ok(descendants("demo-atlas", i).some((t) => t.id === "demo-f"));
  assert.ok(descendants("demo-atlas", i).some((t) => t.id === "demo-a"));
  assert.deepEqual(
    ancestry(i.byId.get("demo-a")!, i).map((t) => t.id),
    ["demo-atlas", "demo-content"],
  );
  assert.deepEqual(ancestry(i.byId.get("demo-independent")!, i), []);
  assert.equal(descendants("demo-later", i).length, 0);
});
test("progress counts tickets once, not containers or average milestone percentages", () => {
  const s = createFixture(),
    i = makeIndex(s.items),
    p = progress("demo-atlas", s, i);
  assert.equal(p.total, 231);
  assert.equal(p.closed, 223);
  assert.equal(p.review, 1);
  assert.equal(p.blocked, 3);
  assert.equal(p.decision, 1);
  assert.equal(p.action, 0);
  assert.equal(progress("demo-notes", s, i).total, 10);
  assert.equal(progress("demo-empty", s, i).total, 0);
  const nested = s.items.map((t) =>
    t.id === "demo-delivery" ? { ...t, parent: "demo-content" } : t,
  );
  assert.equal(
    progress("demo-atlas", { ...s, items: nested }, makeIndex(nested)).total,
    231,
  );
});
test("filters and historical visibility do not alter the global progress denominator", () => {
  const s = createFixture(),
    i = makeIndex(s.items);
  const filtered = s.items.filter((t) =>
    matches(
      t,
      { ...emptyFilters, project: "demo-atlas", owner: "reviewer" },
      i,
    ),
  );
  assert.equal(filtered.length, 2);
  assert.equal(progress("demo-atlas", s, i).total, 231);
  assert.equal(s.items.filter((t) => t.status === "closed").length, 231);
  assert.equal(
    s.items.filter(
      (t) =>
        t.status === "closed" && inDoneWindow(t, "48h", new Date(DEMO_NOW)),
    ).length,
    25,
  );
});
test("unknown and incomplete readiness never silently become Ready", () => {
  const s = createFixture(),
    i = makeIndex(s.items),
    item = i.byId.get("demo-d")!;
  assert.equal(stageOf(item, s, i), "Ready");
  assert.equal(stageOf({ ...item, status: "surprise" }, s, i), "待分类");
  assert.equal(stageOf(item, { ...s, complete: false }, i), "待分类");
  assert.equal(stageOf({ ...item, id: "not-ready" }, s, i), "待分类");
});
test("Review keeps blocking dependencies visible and cannot be accepted through an unresolved blocker", () => {
  const s = createFixture(),
    i = makeIndex(s.items);
  assert.equal(stageOf(i.byId.get("demo-a")!, s, i), "Review");
  assert.equal(stageOf(i.byId.get("demo-b")!, s, i), "Blocked");
  const b = {
    ...i.byId.get("demo-b")!,
    request: { kind: "review" as const, reason: "ready for review" },
  };
  const dual = { ...s, items: s.items.map((t) => (t.id === b.id ? b : t)) };
  assert.equal(stageOf(b, dual, makeIndex(dual.items)), "Review");
  assert.deepEqual(blockers(b, i), ["demo-a"]);
  assert.equal(acceptExample(dual, "demo-b"), dual);
});
test("accepting one example only unblocks dependents whose remaining prerequisites are closed", () => {
  const s = acceptExample(createFixture(), "demo-a"),
    i = makeIndex(s.items);
  assert.equal(i.byId.get("demo-a")!.status, "closed");
  assert.equal(i.byId.get("demo-content")!.status, "in_progress");
  assert.equal(stageOf(i.byId.get("demo-b")!, s, i), "Ready");
  assert.equal(stageOf(i.byId.get("demo-e")!, s, i), "Blocked");
  assert.deepEqual(blockers(i.byId.get("demo-e")!, i), ["demo-c"]);
  assert.equal(i.byId.get("demo-note-b")!.request?.kind, "review");
});
test("human decision and action requests are not review", () => {
  const s = createFixture(),
    i = makeIndex(s.items);
  assert.equal(i.byId.get("demo-f")!.request?.kind, "decision");
  assert.equal(i.byId.get("demo-independent")!.request?.kind, "action");
  assert.equal(acceptExample(s, "demo-f"), s);
});
test("historical closure stays unknown; cancelled work is accounted separately", () => {
  const s = createFixture(),
    i = makeIndex(s.items);
  assert.equal(progress("demo-atlas", s, i).historical, 223);
  const items = s.items.map((t) =>
    t.id === "demo-done-009" ? { ...t, closure: "cancelled" as const } : t,
  );
  const p = progress("demo-atlas", { ...s, items }, makeIndex(items));
  assert.equal(p.closed, 222);
  assert.equal(p.cancelled, 1);
  assert.equal(p.total, 231);
});
test("Done uses closed timestamp, inclusive rolling boundary, and excludes future closures", () => {
  const item = createFixture().items.find((t) => t.status === "closed")!;
  const now = new Date(DEMO_NOW);
  assert.equal(
    inDoneWindow(
      { ...item, closedAt: new Date(+now - 48 * 3600000).toISOString() },
      "48h",
      now,
    ),
    true,
  );
  assert.equal(
    inDoneWindow(
      { ...item, closedAt: new Date(+now - 48 * 3600000 - 1).toISOString() },
      "48h",
      now,
    ),
    false,
  );
  assert.equal(
    inDoneWindow(
      { ...item, closedAt: new Date(+now + 1).toISOString() },
      "48h",
      now,
    ),
    false,
  );
  assert.equal(
    inDoneWindow({ ...item, closedAt: undefined }, "48h", now),
    false,
  );
  assert.equal(
    inDoneWindow({ ...item, closedAt: undefined }, "all", now),
    true,
  );
});
test("five-hour and three-day Done windows use exact rolling close-time boundaries", () => {
  const item = createFixture().items.find((t) => t.status === "closed")!;
  const now = new Date(DEMO_NOW);
  for (const [window, hours] of [
    ["5h", 5],
    ["3d", 72],
  ] as const) {
    const boundary = +now - hours * 3600000;
    for (const [time, expected] of [
      [boundary, true],
      [boundary - 1, false],
      [+now + 1, false],
    ] as const) {
      assert.equal(
        inDoneWindow(
          { ...item, closedAt: new Date(time).toISOString() },
          window,
          now,
        ),
        expected,
      );
    }
  }
  const sixHoursAgo = {
    ...item,
    closedAt: new Date(+now - 6 * 3600000).toISOString(),
  };
  assert.equal(inDoneWindow(sixHoursAgo, "5h", now), false);
  assert.equal(inDoneWindow(sixHoursAgo, "24h", now), true);
  const twoDaysAgo = {
    ...item,
    closedAt: new Date(+now - 48 * 3600000).toISOString(),
  };
  assert.equal(inDoneWindow(twoDaysAgo, "24h", now), false);
  assert.equal(inDoneWindow(twoDaysAgo, "3d", now), true);
});
test("local today differs from a rolling 24h window across DST", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const item = createFixture().items[0];
    const now = new Date("2026-11-01T17:00:00Z");
    const lateYesterday = { ...item, closedAt: "2026-11-01T03:30:00Z" };
    assert.equal(inDoneWindow(lateYesterday, "today", now), false);
    assert.equal(inDoneWindow(lateYesterday, "24h", now), true);
    assert.equal(
      inDoneWindow({ ...item, closedAt: "2026-11-01T04:30:00Z" }, "today", now),
      true,
    );
    assert.equal(dayOffset("2026-11-02", "2026-10-31"), 2);
    assert.equal(localDate("2026-09-25").getDate(), 25);
    assert.equal(dateLabel("2026-09-25"), "9月25日");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("custom Done dates are inclusive of the selected local end day", () => {
  const item = createFixture().items[0],
    now = new Date(DEMO_NOW),
    range = { start: "2026-09-23", end: "2026-09-24" };
  const date = new Date(2026, 8, 24, 23, 59, 59).toISOString();
  assert.equal(
    inDoneWindow({ ...item, closedAt: date }, "custom", now, range),
    true,
  );
  assert.equal(
    inDoneWindow({ ...item, closedAt: date }, "custom", now, {
      start: "2026-09-25",
      end: "2026-09-23",
    }),
    false,
  );
});
test("collapsed map aggregates existing edges without mutating readiness or relations", () => {
  const s = createFixture(),
    i = makeIndex(s.items);
  const before = JSON.stringify(s.items);
  const links = projectLinks(
    descendants("demo-atlas", i),
    i,
    new Set(["demo-content", "demo-delivery"]),
    new Set(["demo-content", "demo-delivery"]),
  );
  assert.equal(links.length, 1);
  assert.equal(links[0].tickets.length, 3);
  assert.equal(links[0].source, "demo-content");
  assert.equal(links[0].target, "demo-delivery");
  assert.equal(JSON.stringify(s.items), before);
  assert.equal(stageOf(i.byId.get("demo-b")!, s, i), "Blocked");
});
test("missing links and hierarchy cycles are visible diagnostics, traversal terminates", () => {
  const items = createFixture().items;
  items[0] = { ...items[0], parent: "demo-content" };
  items.push({ ...items[0], id: "orphan", parent: "absent" });
  const i = makeIndex(items);
  assert.ok(i.diagnostics.some((d) => d.includes("层级存在环")));
  assert.ok(i.diagnostics.some((d) => d.includes("父项 absent 未找到")));
  assert.ok(descendants("demo-atlas", i).length > 0);
});
test("reused Scotty schema normalizes flat and expanded dependency shapes", () => {
  const flat = dependencySchema.parse({
    depends_on_id: "demo-a",
    type: "blocks",
  });
  const expanded = dependencySchema.parse({
    id: "demo-a",
    dependency_type: "blocks",
    title: "example",
  });
  assert.deepEqual(flat, expanded);
  assert.deepEqual(checklistProgress("- [x] 已测试\n- [ ] 待验收"), {
    done: 1,
    total: 2,
  });
});

test("untrusted Markdown cannot create scripts, navigable links or remote images", () => {
  const html = renderToStaticMarkup(
    createElement(
      Markdown,
      null,
      "<script>alert(1)</script>\n\n[link](javascript:alert(1))\n\n![tracking](https://example.test/pixel.png)\n\n[external](https://example.test)",
    ),
  );
  assert.ok(!/<script|<img|<a\s|href=|src=/.test(html));
  assert.ok(html.includes("tracking"));
});
test("1000-record fixture indexing and progress retain all records", () => {
  const original = createFixture();
  const items = [...original.items];
  for (let n = items.length; n < 1000; n++)
    items.push({
      ...items[8],
      id: `perf-${n}`,
      parent: "demo-delivery",
      dependencies: [
        { depends_on_id: "demo-a", type: "blocks" },
        { depends_on_id: "demo-c", type: "blocks" },
        { depends_on_id: "demo-d", type: "related" },
      ],
    } satisfies RecordItem);
  const start = performance.now(),
    i = makeIndex(items),
    p = progress("demo-atlas", { ...original, items }, i);
  const elapsed = performance.now() - start;
  assert.equal(i.byId.size, 1000);
  assert.equal(p.total, 982);
  console.log(
    `1000 records, ${items.reduce((n, t) => n + t.dependencies.length, 0)} relations: index + project progress ${elapsed.toFixed(2)}ms`,
  );
});

test("Timeline puts tickets immediately under their milestone and keeps filtered parent context", () => {
  const s = createFixture(),
    index = makeIndex(s.items);
  const expanded = new Set(["demo-content", "demo-delivery"]);
  const rows = timelineOrder("demo-atlas", index, emptyFilters, expanded);
  assert.equal(rows[0].id, "demo-content");
  assert.equal(rows[1].id, "demo-a");
  assert.equal(
    rows[rows.findIndex((i) => i.id === "demo-delivery") + 1].id,
    "demo-b",
  );
  const filtered = timelineOrder(
    "demo-atlas",
    index,
    { ...emptyFilters, owner: "reviewer" },
    expanded,
  );
  assert.ok(filtered.some((i) => i.id === "demo-content"));
  assert.ok(filtered.some((i) => i.id === "demo-a"));
  assert.ok(!filtered.some((i) => i.id === "demo-c"));
});

test("assignee choices follow workspace data and preserve an edited owner", () => {
  const items = createFixture().items.map((item, index) => ({
    ...item,
    assignee: index % 2 ? "sample-owner" : undefined,
  }));
  assert.deepEqual(assignees(items), ["sample-owner"]);
  assert.deepEqual(assignees(items, "new-owner"), [
    "new-owner",
    "sample-owner",
  ]);
  assert.deepEqual(assignees([]), []);
});
