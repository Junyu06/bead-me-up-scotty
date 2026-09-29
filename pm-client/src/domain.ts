import type { Dependency } from "../../lib/schema";

export const stages = [
  "Idea",
  "Ready",
  "In progress",
  "Review",
  "Blocked",
  "On hold",
  "Done",
  "待分类",
] as const;
export type Stage = (typeof stages)[number];
export type Role = "project" | "milestone" | "ticket";
export type RequestKind = "review" | "decision" | "action" | "attention";
export type DateOnly = string;
export interface RecordItem {
  id: string;
  version?: string;
  nativeBlockers?: string[];
  nativeBlocked?: boolean;
  notes?: string;
  title: string;
  role: Role;
  status: string;
  parent?: string;
  priority: number;
  assignee?: string;
  labels: string[];
  description: string;
  acceptance?: string;
  dependencies: Dependency[];
  request?: {
    kind: RequestKind;
    reason: string;
    evidence?: string;
    revision?: string;
  };
  responses?: {
    request: NonNullable<RecordItem["request"]>;
    body: string;
    at: string;
  }[];
  closedAt?: string;
  closure?: "accepted" | "historical" | "cancelled";
  due?: DateOnly;
  plan?: { start: DateOnly; end: DateOnly };
  forecast?: {
    start: DateOnly;
    end: DateOnly;
    reason: string;
    updated: string;
  };
}
export interface Snapshot {
  workspace: string;
  name?: string;
  source?: "bd";
  complete: boolean;
  now: string;
  items: RecordItem[];
  ready: Set<string>;
}
export interface Index {
  byId: Map<string, RecordItem>;
  children: Map<string, RecordItem[]>;
  diagnostics: string[];
}
export function makeIndex(items: RecordItem[]): Index {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, RecordItem[]>();
  const diagnostics: string[] = [];
  for (const item of items) {
    if (item.parent) {
      children.set(item.parent, [...(children.get(item.parent) ?? []), item]);
      if (!byId.has(item.parent))
        diagnostics.push(`${item.id}: 父项 ${item.parent} 未找到`);
    }
    const seen = new Set([item.id]);
    let parent = item.parent;
    while (parent) {
      if (seen.has(parent)) {
        diagnostics.push(`${item.id}: 层级存在环`);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)?.parent;
    }
    for (const dep of item.dependencies)
      if (!byId.has(dep.depends_on_id))
        diagnostics.push(`${item.id}: 依赖 ${dep.depends_on_id} 未找到`);
  }
  return { byId, children, diagnostics: [...new Set(diagnostics)] };
}
export function descendants(id: string, index: Index): RecordItem[] {
  const result = new Map<string, RecordItem>();
  const pending = [...(index.children.get(id) ?? [])];
  while (pending.length) {
    const item = pending.shift()!;
    if (result.has(item.id) || item.id === id) continue;
    result.set(item.id, item);
    pending.push(...(index.children.get(item.id) ?? []));
  }
  return [...result.values()];
}
export function ancestry(item: RecordItem, index: Index): RecordItem[] {
  const result: RecordItem[] = [];
  const seen = new Set([item.id]);
  let parent = item.parent;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const node = index.byId.get(parent);
    if (!node) break;
    result.unshift(node);
    parent = node.parent;
  }
  return result;
}
// UI-01 fixture rules only. UI-02 must use native ready/blocked results for
// parent-child, gates, conditional-blocks and waits-for; do not generalize this.
export function blockers(item: RecordItem, index: Index): string[] {
  if (item.nativeBlockers !== undefined) return item.nativeBlockers;
  return item.dependencies
    .filter(
      (dep) =>
        dep.type === "blocks" &&
        index.byId.get(dep.depends_on_id)?.status !== "closed",
    )
    .map((dep) => dep.depends_on_id);
}
export function isBlocked(item: RecordItem, index: Index): boolean {
  return (
    item.status !== "closed" &&
    (item.status === "blocked" ||
      item.nativeBlocked === true ||
      blockers(item, index).length > 0)
  );
}
export function stageOf(
  item: RecordItem,
  snapshot: Snapshot,
  index: Index,
): Stage {
  if (item.status === "closed") return "Done";
  if (
    !["idea", "deferred", "open", "in_progress", "blocked"].includes(
      item.status,
    )
  )
    return "待分类";
  if (item.status === "idea") return "Idea";
  if (item.status === "deferred") return "On hold";
  if (item.request?.kind === "review") return "Review";
  if (isBlocked(item, index)) return "Blocked";
  if (item.status === "in_progress") return "In progress";
  if (
    item.role === "ticket" &&
    snapshot.complete &&
    snapshot.ready.has(item.id)
  )
    return "Ready";
  return "待分类";
}
export function progress(id: string, snapshot: Snapshot, index: Index) {
  const tickets = descendants(id, index).filter(
    (item) => item.role === "ticket",
  );
  // An explicitly executable record with children is retained, rather than
  // silently discarded as a container. The fixture uses pure containers.
  return {
    total: tickets.length,
    closed: tickets.filter(
      (t) => t.status === "closed" && t.closure !== "cancelled",
    ).length,
    cancelled: tickets.filter(
      (t) => t.status === "closed" && t.closure === "cancelled",
    ).length,
    review: tickets.filter(
      (t) => t.status !== "closed" && t.request?.kind === "review",
    ).length,
    decision: tickets.filter(
      (t) => t.status !== "closed" && t.request?.kind === "decision",
    ).length,
    attention: tickets.filter(
      (t) => t.status !== "closed" && t.request?.kind === "attention",
    ).length,
    action: tickets.filter(
      (t) => t.status !== "closed" && t.request?.kind === "action",
    ).length,
    blocked: tickets.filter((t) => isBlocked(t, index)).length,
    historical: tickets.filter(
      (t) => t.status === "closed" && t.closure === "historical",
    ).length,
    complete: snapshot.complete,
  };
}
export type DoneWindow =
  | "today"
  | "5h"
  | "24h"
  | "48h"
  | "3d"
  | "7d"
  | "custom"
  | "all";
export function inDoneWindow(
  item: RecordItem,
  window: DoneWindow,
  now: Date,
  custom?: { start: string; end: string },
): boolean {
  if (window === "all") return true;
  if (!item.closedAt) return false;
  const closed = new Date(item.closedAt).getTime();
  if (!Number.isFinite(closed) || closed > now.getTime()) return false;
  if (window === "custom") {
    if (!custom?.start || !custom.end || custom.start > custom.end)
      return false;
    const start = localDate(custom.start);
    const end = localDate(custom.end);
    end.setDate(end.getDate() + 1);
    return closed >= start.getTime() && closed < end.getTime();
  }
  const start =
    window === "today"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : now.getTime() -
        { "5h": 5, "24h": 24, "48h": 48, "3d": 72, "7d": 168 }[window] *
          3600000;
  return closed >= start;
}
export function localDate(value: DateOnly): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function dateLabel(value?: DateOnly): string {
  if (!value) return "未安排";
  const [, month, day] = value.split("-").map(Number);
  return `${month}月${day}日`;
}
export function dayOffset(value: DateOnly, origin = "2026-09-21"): number {
  const ordinal = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day) / 86400000;
  };
  return ordinal(value) - ordinal(origin);
}
export interface Filters {
  project: string;
  milestone: string;
  owner: string;
  priority: string;
  label: string;
  search: string;
}
export const emptyFilters: Filters = {
  project: "all",
  milestone: "all",
  owner: "all",
  priority: "all",
  label: "all",
  search: "",
};
export function matches(
  item: RecordItem,
  filters: Filters,
  index: Index,
): boolean {
  const parents = ancestry(item, index).map((i) => i.id);
  return (
    (filters.project === "all" ||
      parents.includes(filters.project) ||
      item.id === filters.project) &&
    (filters.milestone === "all" ||
      parents.includes(filters.milestone) ||
      item.id === filters.milestone) &&
    (filters.owner === "all" || item.assignee === filters.owner) &&
    (filters.priority === "all" ||
      item.priority === Number(filters.priority)) &&
    (filters.label === "all" || item.labels.includes(filters.label)) &&
    `${item.title} ${item.id} ${item.description}`
      .toLowerCase()
      .includes(filters.search.toLowerCase())
  );
}
export function acceptExample(snapshot: Snapshot, id: string): Snapshot {
  const index = makeIndex(snapshot.items);
  const item = index.byId.get(id);
  if (
    !item ||
    item.request?.kind !== "review" ||
    item.status === "closed" ||
    isBlocked(item, index)
  )
    return snapshot;
  const items = snapshot.items.map((i) =>
    i.id === id
      ? {
          ...i,
          status: "closed",
          closedAt: snapshot.now,
          closure: "accepted" as const,
          request: undefined,
        }
      : i,
  );
  const nextIndex = makeIndex(items);
  const ready = new Set(snapshot.ready);
  for (const i of items)
    if (i.role === "ticket" && i.status === "open" && !isBlocked(i, nextIndex))
      ready.add(i.id);
  return { ...snapshot, items, ready };
}

export function createIdeaExample(
  snapshot: Snapshot,
  title: string,
  description: string,
): Snapshot {
  if (!title.trim()) return snapshot;
  const sequence =
    1 +
    Math.max(
      0,
      ...snapshot.items.map((item) => {
        const match = /^id-(\d+)$/.exec(item.id);
        return match ? Number(match[1]) : 0;
      }),
    );
  return {
    ...snapshot,
    items: [
      ...snapshot.items,
      {
        id: `id-${sequence}`,
        title: title.trim(),
        description,
        role: "ticket",
        status: "idea",
        priority: 2,
        labels: [],
        dependencies: [],
      },
    ],
  };
}

export function respondExample(
  snapshot: Snapshot,
  id: string,
  body: string,
): Snapshot {
  const item = snapshot.items.find((candidate) => candidate.id === id);
  if (
    !item?.request ||
    item.request.kind === "review" ||
    item.status === "closed" ||
    !body.trim()
  )
    return snapshot;
  const response = {
    request: { ...item.request },
    body: body.trim(),
    at: snapshot.now,
  };
  return {
    ...snapshot,
    items: snapshot.items.map((candidate) =>
      candidate.id === id
        ? {
            ...candidate,
            request: undefined,
            responses: [...(candidate.responses ?? []), response],
          }
        : candidate,
    ),
  };
}

export function timelineOrder(
  projectId: string,
  index: Index,
  filters: Filters,
  expanded: Set<string>,
): RecordItem[] {
  const matched = descendants(projectId, index).filter(
    (item) => item.status !== "closed" && matches(item, filters, index),
  );
  const included = new Set(
    matched.flatMap((item) => [
      item.id,
      ...ancestry(item, index).map((parent) => parent.id),
    ]),
  );
  const seen = new Set([projectId]);
  const walk = (id: string): RecordItem[] =>
    (index.children.get(id) ?? []).flatMap((item) => {
      if (seen.has(item.id) || !included.has(item.id)) return [];
      seen.add(item.id);
      return [
        item,
        ...(item.role !== "ticket" && expanded.has(item.id)
          ? walk(item.id)
          : []),
      ];
    });
  return walk(projectId);
}

/** Assignees present in the loaded workspace, including a currently edited value. */
export function assignees(items: RecordItem[], current?: string): string[] {
  return [
    ...new Set(
      [...items.map((item) => item.assignee), current].filter(
        (name): name is string => !!name,
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function requestLabel(kind: RequestKind): string {
  return {
    review: "待验收",
    decision: "待决策",
    action: "待操作",
    attention: "待处理",
  }[kind];
}

export function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, days: number): string {
  const d = localDate(date);
  d.setDate(d.getDate() + days);
  return dateOnly(d);
}
export function weekStart(now: string): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateOnly(d);
}
