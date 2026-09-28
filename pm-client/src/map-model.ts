import {
  descendants,
  makeIndex,
  matches,
  emptyFilters,
  type Filters,
  type Index,
  type RecordItem,
} from "./domain";

export function mapPrerequisites(item: RecordItem, index: Index): string[] {
  return [
    ...new Set([
      ...item.dependencies
        .filter((d) => d.type === "blocks")
        .map((d) => d.depends_on_id),
      ...(item.nativeBlockers ?? []),
    ]),
  ].filter((id) => index.byId.get(id)?.status !== "closed");
}

export function mapRelations(items: RecordItem[], index: Index) {
  return items
    .filter((item) => item.status !== "closed")
    .flatMap((item) =>
      mapPrerequisites(item, index).map((from) => ({ from, to: item.id })),
    );
}

export interface MapLink {
  source: string;
  target: string;
  tickets: { from: string; to: string }[];
}
/** Project only existing blocking edges onto visible nodes. These links are
 * presentation data and are never fed back into readiness or persisted in BD. */
export function projectLinks(
  items: RecordItem[],
  index: Index,
  visible: Set<string>,
  collapsed: Set<string>,
  foldable?: Set<string>,
): MapLink[] {
  const project = (id: string): string | undefined => {
    if (visible.has(id)) return id;
    if (foldable && !foldable.has(id)) return;
    let item = index.byId.get(id);
    const seen = new Set<string>();
    while (item?.parent && !seen.has(item.id)) {
      seen.add(item.id);
      if (collapsed.has(item.parent) && visible.has(item.parent))
        return item.parent;
      item = index.byId.get(item.parent);
    }
  };
  const links = new Map<string, MapLink>();
  for (const item of items.filter((i) => i.status !== "closed"))
    for (const blocker of mapPrerequisites(item, index)) {
      const source = project(blocker),
        target = project(item.id);
      if (!source || !target || source === target) continue;
      const key = `${source}:${target}`;
      const link = links.get(key) ?? { source, target, tickets: [] };
      link.tickets.push({ from: blocker, to: item.id });
      links.set(key, link);
    }
  return [...links.values()];
}
export function mapScope(projectId: string, index: Index): RecordItem[] {
  return descendants(projectId, index);
}

export interface Point {
  x: number;
  y: number;
}
export interface MapBox {
  id: string;
  parentId?: string;
  position: Point;
  absolute: Point;
  width: number;
  height: number;
  container: boolean;
  collapsed: boolean;
  contextOnly: boolean;
}
export type PositionMap = Record<string, Point>;
const compare = (a: RecordItem, b: RecordItem) =>
  a.title.localeCompare(b.title, "zh-CN", { numeric: true }) ||
  a.id.localeCompare(b.id);

/** Order sibling branches by real prerequisite edges, then natural title order.
 * All descendants participate so a ticket in one phase can order two phases. */
export function orderBranches(
  branches: RecordItem[],
  items: RecordItem[],
  index: Index,
) {
  const ids = new Set(branches.map((i) => i.id));
  const branchOf = (id: string) => {
    const seen = new Set<string>();
    while (!seen.has(id)) {
      if (ids.has(id)) return id;
      seen.add(id);
      const parent = index.byId.get(id)?.parent;
      if (!parent) break;
      id = parent;
    }
  };
  const outgoing = new Map(branches.map((i) => [i.id, new Set<string>()]));
  const incoming = new Map(branches.map((i) => [i.id, 0]));
  for (const item of items) {
    const target = branchOf(item.id);
    if (!target) continue;
    const prerequisites = new Set([
      ...item.dependencies
        .filter((d) => d.type === "blocks")
        .map((d) => d.depends_on_id),
      ...(item.nativeBlockers ?? []),
    ]);
    for (const id of prerequisites) {
      const source = branchOf(id);
      if (!source || source === target || outgoing.get(source)!.has(target))
        continue;
      outgoing.get(source)!.add(target);
      incoming.set(target, incoming.get(target)! + 1);
    }
  }
  const pending = [...branches].sort(compare),
    result: RecordItem[] = [];
  while (pending.length) {
    // Cycles keep a deterministic order, without inventing an edge or readiness.
    const n = Math.max(
      0,
      pending.findIndex((i) => !incoming.get(i.id)),
    );
    const [item] = pending.splice(n, 1);
    result.push(item);
    for (const id of outgoing.get(item.id)!)
      incoming.set(id, incoming.get(id)! - 1);
  }
  return result;
}

/** Geometry and containment share one source. Even executable records can own
 * children; filtering retains their structural context, never flattens it. */
export function layoutMap(
  items: RecordItem[],
  index: Index,
  collapsed = new Set<string>(),
  filters: Filters = { ...emptyFilters },
  overrides: PositionMap = {},
): MapBox[] {
  const ids = new Set(items.map((i) => i.id));
  const containers = new Set(
    items
      .filter(
        (i) =>
          i.role === "milestone" || (index.children.get(i.id)?.length ?? 0) > 0,
      )
      .map((i) => i.id),
  );
  const shown = new Set(
    items
      .filter(
        (i) =>
          i.role === "milestone" ||
          (i.status !== "closed" && matches(i, filters, index)),
      )
      .map((i) => i.id),
  );
  for (const id of [...shown]) {
    let parent = index.byId.get(id)?.parent;
    const seen = new Set<string>();
    while (parent && ids.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      shown.add(parent);
      parent = index.byId.get(parent)?.parent;
    }
  }
  const children = (parent?: string) =>
    orderBranches(
      items.filter(
        (i) =>
          shown.has(i.id) &&
          (parent ? i.parent === parent : !i.parent || !ids.has(i.parent)),
      ),
      items,
      index,
    );
  const result: MapBox[] = [];
  const visiting = new Set<string>();
  function build(item: RecordItem, parentId?: string): MapBox {
    visiting.add(item.id);
    const container = containers.has(item.id),
      folded = collapsed.has(item.id);
    const box: MapBox = {
      id: item.id,
      parentId,
      position: { x: 0, y: 0 },
      absolute: { x: 0, y: 0 },
      width: 304,
      height: 132,
      container,
      collapsed: folded,
      contextOnly: item.status === "closed" || !matches(item, filters, index),
    };
    result.push(box);
    if (container) {
      const kids = folded
        ? []
        : children(item.id)
            .filter((c) => !visiting.has(c.id))
            .map((c) => build(c, item.id));
      box.width = Math.max(368, ...kids.map((c) => c.width + 64));
      let y = 116;
      for (const child of kids) {
        const saved = overrides[child.id];
        child.position = {
          x: Math.max(32, saved?.x ?? 32),
          y: Math.max(116, saved?.y ?? y),
        };
        box.width = Math.max(box.width, child.position.x + child.width + 32);
        y = Math.max(y, child.position.y + child.height + 32);
      }
      box.height = folded ? 132 : Math.max(176, y + 38);
    }
    visiting.delete(item.id);
    return box;
  }
  let x = 0;
  for (const item of children()) {
    const box = build(item);
    box.position = overrides[item.id] ?? { x, y: 0 };
    x = Math.max(x, box.position.x + box.width + 144);
  }
  const byId = new Map(result.map((b) => [b.id, b]));
  for (const box of result) {
    const parent = box.parentId ? byId.get(box.parentId) : undefined;
    box.absolute = {
      x: box.position.x + (parent?.absolute.x ?? 0),
      y: box.position.y + (parent?.absolute.y ?? 0),
    };
  }
  return result;
}
export function initialPositions(items: RecordItem[]): PositionMap {
  return Object.fromEntries(
    layoutMap(items, makeIndex(items)).map((box) => [box.id, box.position]),
  );
}
