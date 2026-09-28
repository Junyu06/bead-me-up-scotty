import assert from "node:assert/strict";
import test from "node:test";
import { makeIndex, type RecordItem } from "../src/domain";
import {
  initialPositions,
  projectLinks,
  layoutMap,
  mapRelations,
} from "../src/map-model";

import { routeLink, crosses } from "../src/map-routing";

const row = (id: string, extra: Partial<RecordItem> = {}): RecordItem => ({
  id,
  title: id,
  role: "ticket",
  status: "open",
  priority: 2,
  labels: [],
  description: "",
  dependencies: [],
  ...extra,
});
const dependency = (id: string) => ({ depends_on_id: id, type: "blocks" });

test("Map lays out prerequisites before dependents even when BD returns the later stage first", () => {
  const items = [
    row("later", {
      role: "milestone",
      title: "4. Release",
      dependencies: [dependency("earlier")],
    }),
    row("earlier", { role: "milestone", title: "3. Build" }),
  ];
  const positions = initialPositions(items);
  assert.ok(
    positions.earlier.x < positions.later.x,
    "prerequisite must be on the left",
  );
  assert.deepEqual(
    initialPositions([...items].reverse()),
    positions,
    "CLI order must not change layout",
  );
});

test("filtering out a ticket must not turn its dependency into an edge from its parent", () => {
  const items = [
    row("phase", { role: "milestone" }),
    row("hidden", { parent: "phase" }),
    row("target", { dependencies: [dependency("hidden")] }),
  ];
  assert.deepEqual(
    projectLinks(
      items,
      makeIndex(items),
      new Set(["phase", "target"]),
      new Set(),
    ),
    [],
  );
  const folded = projectLinks(
    items,
    makeIndex(items),
    new Set(["phase", "target"]),
    new Set(["phase"]),
  );
  assert.equal(folded[0].source, "phase");
  assert.deepEqual(folded[0].tickets, [{ from: "hidden", to: "target" }]);
});

test("nested executable parents remain containers, and collapsed ancestors hide every descendant", () => {
  const items = [
    row("phase", { role: "milestone" }),
    row("parent", { parent: "phase" }),
    row("child", { parent: "parent" }),
    row("next", { parent: "phase", dependencies: [dependency("child")] }),
  ];
  const index = makeIndex(items),
    boxes = layoutMap(items, index),
    byId = new Map(boxes.map((b) => [b.id, b]));
  assert.equal(byId.get("parent")!.container, true);
  assert.equal(byId.get("child")!.parentId, "parent");
  for (const box of boxes)
    if (box.parentId) {
      const parent = byId.get(box.parentId)!;
      assert.ok(box.position.x >= 0 && box.position.y >= 100);
      assert.ok(
        box.position.x + box.width <= parent.width &&
          box.position.y + box.height < parent.height,
      );
    }
  assert.deepEqual(
    layoutMap(items, index, new Set(["phase"])).map((b) => b.id),
    ["phase"],
  );
  const folded = layoutMap(items, index, new Set(["parent"]));
  const links = projectLinks(
    items,
    index,
    new Set(folded.map((b) => b.id)),
    new Set(["parent"]),
  );
  assert.equal(links[0].source, "parent");
  assert.equal(links[0].target, "next");
});

test("default routes avoid every unrelated card and header, including a skipped phase", () => {
  const items = [
    row("last", { role: "milestone", dependencies: [dependency("first")] }),
    row("middle", { role: "milestone", title: "2. middle" }),
    row("first", { role: "milestone", title: "1. first" }),
    row("a", { parent: "first" }),
    row("b", { parent: "last", dependencies: [dependency("a")] }),
    row("c", { parent: "last", dependencies: [dependency("b")] }),
  ];
  const index = makeIndex(items),
    boxes = layoutMap(items, index),
    links = projectLinks(
      items,
      index,
      new Set(boxes.map((b) => b.id)),
      new Set(),
    );
  for (const link of links) {
    const route = routeLink(link, boxes);
    assert.ok(route, `route exists ${link.source} → ${link.target}`);
    for (const box of boxes) {
      if (box.id === link.source || box.id === link.target) continue;
      const rect = {
        ...box.absolute,
        width: box.width,
        height: box.container ? 100 : box.height,
      };
      for (let i = 1; i < route.points.length; i++)
        assert.equal(
          crosses(route.points[i - 1], route.points[i], rect),
          false,
          `${link.source} → ${link.target} crosses ${box.id}`,
        );
    }
  }
});

test("closed dependents do not reappear as active aggregate edges", () => {
  const items = [
    row("phase", { role: "milestone" }),
    row("a"),
    row("b", {
      parent: "phase",
      status: "closed",
      dependencies: [dependency("a")],
    }),
  ];
  assert.deepEqual(
    projectLinks(
      items,
      makeIndex(items),
      new Set(["a", "phase"]),
      new Set(["phase"]),
    ),
    [],
  );
});

test("native readiness does not erase explicit dependency edges or change their direction", () => {
  const items = [
    row("before"),
    row("after", { nativeBlockers: [], dependencies: [dependency("before")] }),
  ];
  assert.deepEqual(
    projectLinks(
      items,
      makeIndex(items),
      new Set(["before", "after"]),
      new Set(),
    ),
    [
      {
        source: "before",
        target: "after",
        tickets: [{ from: "before", to: "after" }],
      },
    ],
  );
});

test("overlapping endpoint reports an unroutable link instead of drawing through a card", () => {
  const items = [
    row("a"),
    row("b", { dependencies: [dependency("a")] }),
    row("cover"),
  ];
  const boxes = layoutMap(items, makeIndex(items), new Set(), undefined, {
    a: { x: 0, y: 0 },
    b: { x: 600, y: 0 },
    cover: { x: 304, y: 0 },
  });
  assert.equal(
    routeLink(
      { source: "a", target: "b", tickets: [{ from: "a", to: "b" }] },
      boxes,
    ),
    null,
  );
});

test("external and native-only prerequisites remain available when no endpoint is drawn", () => {
  const target = row("inside", {
    dependencies: [dependency("external")],
    nativeBlockers: ["native-external"],
  });
  const index = makeIndex([target, row("external"), row("native-external")]);
  assert.deepEqual(
    projectLinks([target], index, new Set([target.id]), new Set()),
    [],
  );
  assert.deepEqual(mapRelations([target], index), [
    { from: "external", to: "inside" },
    { from: "native-external", to: "inside" },
  ]);
});

test("a filtered-out descendant stays hidden even when its ancestor is also collapsed", () => {
  const items = [
    row("phase", { role: "milestone" }),
    row("hidden", { parent: "phase" }),
    row("shown", { dependencies: [dependency("hidden")] }),
  ];
  assert.deepEqual(
    projectLinks(
      items,
      makeIndex(items),
      new Set(["phase", "shown"]),
      new Set(["phase"]),
      new Set(["shown"]),
    ),
    [],
  );
});
