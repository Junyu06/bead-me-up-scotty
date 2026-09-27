import { descendants, blockers, type Index, type RecordItem } from "./domain";

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
): MapLink[] {
  const project = (id: string): string | undefined => {
    let item = index.byId.get(id);
    const seen = new Set<string>();
    while (item && !seen.has(item.id)) {
      seen.add(item.id);
      if (visible.has(item.id)) return item.id;
      if (item.parent && collapsed.has(item.parent)) return item.parent;
      item = item.parent ? index.byId.get(item.parent) : undefined;
    }
  };
  const links = new Map<string, MapLink>();
  for (const item of items)
    for (const blocker of blockers(item, index)) {
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

export function initialPositions(items: RecordItem[]) {
  const groups = items.filter((i) => i.role === "milestone");
  const positions: Record<string, { x: number; y: number }> = {};
  groups.forEach((group, i) => {
    positions[group.id] = { x: i * 382, y: 0 };
  });
  const directColumn =
    groups.length && !items.some((i) => i.parent === groups.at(-1)?.id)
      ? groups.length - 1
      : groups.length;
  const counts = new Map<string, number>();
  for (const item of items.filter(
    (i) => i.role === "ticket" && i.status !== "closed",
  )) {
    const parent = groups.some((g) => g.id === item.parent)
      ? item.parent!
      : "direct";
    const slot = counts.get(parent) ?? 0;
    counts.set(parent, slot + 1);
    positions[item.id] =
      parent !== "direct"
        ? { x: 18, y: 88 + slot * 136 }
        : groups.length
          ? { x: directColumn * 382, y: 205 + slot * 146 }
          : { x: (slot % 3) * 382, y: Math.floor(slot / 3) * 146 };
  }
  return positions;
}
