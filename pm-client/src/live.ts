import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";
import { dependencySchema } from "../../lib/schema";
import {
  makeIndex,
  type RecordItem,
  type Snapshot,
  type RequestKind,
} from "./domain";

const rawIssue = z.object({
  _pm_version: z.string().optional(),
  id: z.string().min(1),
  title: z.string(),
  status: z.string(),
  issue_type: z.string(),
  description: z.string().default(""),
  notes: z.string().default(""),
  acceptance_criteria: z.string().default(""),
  updated_at: z.string().min(1),
  priority: z.number().int().min(0).max(4),
  assignee: z.string().optional(),
  labels: z.array(z.string()).default([]),
  dependencies: z.array(dependencySchema).default([]),
  parent: z.string().nullish(),
  due_at: z.string().nullish(),
  closed_at: z.string().nullish(),
  close_reason: z.string().nullish(),
  metadata: z.unknown().optional(),
});
const responseSchema = z.object({
  workspace: z.string(),
  name: z.string(),
  now: z.string(),
  items: z.array(rawIssue),
  ready: z.array(z.object({ id: z.string() })),
  blocked: z.array(
    z.object({ id: z.string(), blocked_by: z.array(z.string()).default([]) }),
  ),
});
const planSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .refine((p) => p.start <= p.end);
export const native = isTauri();
export interface WorkspaceConfig {
  workspace: string;
  executable: string;
  actor: string;
  identity?: string;
}
export function projectIssue(
  input: unknown,
  nativeBlockers: string[] = [],
): RecordItem {
  const raw = rawIssue.parse(input);
  const parent =
    raw.parent ||
    raw.dependencies.find((d) => d.type === "parent-child")?.depends_on_id;
  const role =
    raw.issue_type === "epic"
      ? parent
        ? "milestone"
        : "project"
      : raw.issue_type === "milestone"
        ? "milestone"
        : "ticket";
  const explicit = (["review", "decision", "action"] as const).filter((k) =>
    raw.labels.includes(`pm:${k}`),
  );
  const kind: RequestKind | undefined =
    explicit.length === 1
      ? explicit[0]
      : raw.labels.includes("human") || explicit.length
        ? "attention"
        : undefined;
  const meta =
    raw.metadata &&
    typeof raw.metadata === "object" &&
    !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const plan = planSchema.safeParse(meta.pm_plan);
  const notes = raw.notes.replace(/^\[beads-pm:[a-f0-9-]+\]\s*$/gm, "").trim();
  return {
    id: raw.id,
    title: raw.title,
    role,
    status: raw.status,
    parent,
    priority: raw.priority,
    description: raw.description,
    notes,
    acceptance: raw.acceptance_criteria,
    assignee: raw.assignee || undefined,
    labels: raw.labels,
    dependencies: raw.dependencies,
    version: raw._pm_version ?? raw.updated_at,
    nativeBlockers,
    request:
      kind && raw.status !== "closed"
        ? {
            kind,
            reason: notes || raw.description,
          }
        : undefined,
    due: raw.due_at?.slice(0, 10),
    plan: plan.success ? plan.data : undefined,
    closedAt: raw.closed_at || undefined,
    closure:
      raw.status === "closed"
        ? raw.close_reason?.startsWith("Beads PM accepted revision ")
          ? "accepted"
          : "historical"
        : undefined,
  };
}
export function projectSnapshot(input: unknown): Snapshot {
  const data = responseSchema.parse(input);
  const blocked = new Map(data.blocked.map((v) => [v.id, v.blocked_by]));
  const items = data.items.map((item) => ({
    ...projectIssue(item, blocked.get(item.id)),
    nativeBlocked: blocked.has(item.id),
  }));
  const ids = new Set(items.map((i) => i.id));
  if (
    ids.size !== items.length ||
    data.ready.some((i) => !ids.has(i.id)) ||
    data.blocked.some((i) => !ids.has(i.id))
  )
    throw new Error("BD 列表与状态结果不一致，请刷新。");
  return {
    workspace: data.workspace,
    name: data.name,
    now: data.now,
    complete: makeIndex(items).diagnostics.length === 0,
    items,
    ready: new Set(data.ready.map((v) => v.id)),
    source: "bd",
  };
}
export function changedFields(
  before: RecordItem,
  after: RecordItem,
): Record<string, unknown> {
  const pairs: [string, unknown, unknown][] = [
    ["title", before.title, after.title],
    ["description", before.description, after.description],
    ["assignee", before.assignee ?? "", after.assignee ?? ""],
    ["priority", before.priority, after.priority],
    ["due_at", before.due ?? "", after.due ?? ""],
    ["parent", before.parent ?? "", after.parent ?? ""],
    ["plan", before.plan ?? null, after.plan ?? null],
    ["status", before.status, after.status],
  ];
  return Object.fromEntries(
    pairs
      .filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b))
      .map(([k, , v]) => [k, v]),
  );
}
export const readWorkspace = async () =>
  projectSnapshot(await invoke("read_workspace"));
export const settings = () =>
  invoke<{ config: WorkspaceConfig | null; executable: string }>(
    "workspace_settings",
  );
export const connect = async (config: WorkspaceConfig) =>
  projectSnapshot(await invoke("connect_workspace", { config }));
export const readIssue = (id: string) => invoke("read_issue", { id });
export const saveIssue = (before: RecordItem, after: RecordItem) =>
  invoke("save_issue", {
    patch: {
      id: before.id,
      version: before.version,
      fields: changedFields(before, after),
    },
  });
export const createIssue = (
  title: string,
  description: string,
  operation: string,
) =>
  invoke<{ id: string }>("create_issue", {
    input: { title, description, operation },
  });
export const issueAction = (
  item: RecordItem,
  kind: "respond" | "request_changes" | "close" | "reopen",
  body = "",
  operation: string = crypto.randomUUID(),
) =>
  invoke("issue_action", {
    input: { id: item.id, version: item.version, kind, body, operation },
  });
