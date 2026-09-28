import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChevronDown,
  ChevronRight,
  Flag,
  RotateCcw,
  Link2,
} from "lucide-react";
import {
  stageOf,
  matches,
  descendants,
  progress,
  type Index,
  type Filters,
  type Snapshot,
  type RecordItem,
} from "./domain";
import { initialPositions, mapScope, projectLinks } from "./map-model";
import { StageBadge } from "./ui";

type PositionMap = Record<string, { x: number; y: number }>;
function readPreference<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Preferences are optional, business data is not persisted here. */
  }
}
type MapData = {
  item: RecordItem;
  stage: ReturnType<typeof stageOf>;
  open: (id: string) => void;
  collapsed?: boolean;
  toggle?: () => void;
  count?: number;
  closed?: number;
  hidden?: number;
  history?: () => void;
  summary?: boolean;
  direct?: boolean;
};
function TicketNode({ data }: NodeProps) {
  const d = data as unknown as MapData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <button className="map-ticket nodrag" onClick={() => d.open(d.item.id)}>
        <span className="map-ticket-meta">
          <StageBadge stage={d.stage} />
          <span>P{d.item.priority}</span>
        </span>
        <strong>{d.item.title}</strong>
        <code>
          {d.item.id}
          {d.direct ? " · 直接属于项目" : ""}
        </code>
      </button>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
function MilestoneNode({ data }: NodeProps) {
  const d = data as unknown as MapData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="map-group-header">
        <button
          className="nodrag"
          onClick={d.toggle}
          aria-label={`${d.collapsed ? "展开" : "收起"} ${d.item.title}`}
        >
          {d.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <Flag size={14} />
          <strong>{d.item.title}</strong>
        </button>
        <span>{d.count ? `${d.closed} / ${d.count} 已关闭` : "尚未拆分"}</span>
      </div>
      {d.collapsed ? (
        <p className="map-group-summary">
          {d.count
            ? `${(d.count ?? 0) - (d.closed ?? 0)} 张未关闭 · 点击展开`
            : "暂无工单"}
        </p>
      ) : (
        <>
          <p className="map-group-caption">
            {d.hidden ? `${d.hidden} 张未关闭工单被筛选隐藏` : "工单"}
          </p>
          {d.closed! > 0 && (
            <button className="map-history nodrag" onClick={d.history}>
              {d.closed} 张已关闭工单 · 在 Board 查看 →
            </button>
          )}
          {!d.count && <p className="map-group-summary">暂无工单</p>}
        </>
      )}
      <Handle type="source" position={Position.Right} />
    </>
  );
}
const nodeTypes = { ticket: TicketNode, milestone: MilestoneNode };

export function MapView({
  project,
  snapshot,
  index,
  filters,
  onOpen,
  onHistory,
}: {
  project: RecordItem;
  snapshot: Snapshot;
  index: Index;
  filters: Filters;
  onOpen: (id: string) => void;
  onHistory: (milestone: string) => void;
}) {
  const key = `beads-pm:${snapshot.workspace}:${project.id}:map`;
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(readPreference<string[]>(`${key}:collapsed`, [])),
  );
  const [positions, setPositions] = useState<PositionMap>(() =>
    readPreference(
      `${key}:positions`,
      initialPositions(mapScope(project.id, index)),
    ),
  );
  useEffect(
    () => savePreference(`${key}:positions`, positions),
    [key, positions],
  );
  const [viewport, setViewport] = useState<Viewport>(() =>
    readPreference(`${key}:viewport`, { x: 28, y: 30, zoom: 0.92 }),
  );
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<string | null>(null);
  const scope = useMemo(() => mapScope(project.id, index), [project.id, index]);
  const groups = scope.filter((i) => i.role === "milestone");
  const shown = scope.filter(
    (i) =>
      i.role === "ticket" &&
      i.status !== "closed" &&
      matches(i, filters, index),
  );
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePreference(`${key}:collapsed`, [...next]);
      return next;
    });
  const nodes: Node[] = groups.map((group, i) => {
    const count = progress(group.id, snapshot, index);
    const closed = collapsed.has(group.id);
    return {
      id: group.id,
      type: "milestone",
      position: positions[group.id] ?? { x: i * 382, y: 0 },
      style: {
        width: 320,
        height: closed
          ? 118
          : Math.max(
              170,
              ...scope
                .filter((t) => t.parent === group.id && positions[t.id])
                .map((t) => positions[t.id].y + 175),
            ),
      },
      className: "map-group",
      zIndex: 0,
      data: {
        item: group,
        stage: stageOf(group, snapshot, index),
        open: onOpen,
        collapsed: closed,
        toggle: () => toggle(group.id),
        count: count.total,
        closed: count.closed,
        hidden: descendants(group.id, index).filter(
          (item) =>
            item.role === "ticket" &&
            item.status !== "closed" &&
            !matches(item, filters, index),
        ).length,
        history: () => onHistory(group.id),
      },
    };
  });
  const defaults = initialPositions(scope);
  for (const item of shown) {
    if (item.parent && collapsed.has(item.parent)) continue;
    const grouped = nodes.some((n) => n.id === item.parent);
    nodes.push({
      id: item.id,
      type: "ticket",
      parentId: grouped ? item.parent : undefined,
      extent: grouped ? "parent" : undefined,
      position: positions[item.id] ?? defaults[item.id],
      style: { width: 284, height: 122 },
      data: {
        item,
        stage: stageOf(item, snapshot, index),
        open: onOpen,
        direct: !grouped,
      },
      zIndex: 2,
    });
  }
  const visible = new Set(nodes.map((n) => n.id));
  const links = projectLinks(scope, index, visible, collapsed);
  const edges: Edge[] = links.map((link) => ({
    id: `${link.source}:${link.target}`,
    source: link.source,
    target: link.target,
    label:
      link.tickets.length > 1 ? `${link.tickets.length} 条依赖` : "前置未关闭",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#b87963" },
    style: { stroke: "#b87963", strokeWidth: 1.5 },
    labelStyle: { fontSize: 12, fill: "#785447" },
    labelBgStyle: { fill: "#fffaf7" },
    zIndex: 1,
  }));
  const hiddenEdges = scope.reduce(
    (count, item) =>
      count +
      item.dependencies.filter(
        (d) =>
          d.type === "blocks" &&
          index.byId.get(d.depends_on_id)?.status !== "closed" &&
          ((!visible.has(item.id) && !collapsed.has(item.parent ?? "")) ||
            (!visible.has(d.depends_on_id) &&
              !collapsed.has(index.byId.get(d.depends_on_id)?.parent ?? ""))),
      ).length,
    0,
  );
  const onNodesChange = (changes: NodeChange[]) => {
    const moved = changes.filter((c) => c.type === "position" && c.position);
    if (!moved.length) return;
    const updated = applyNodeChanges(moved, nodes);
    setPositions((old) => {
      const next = { ...old };
      for (const c of moved) {
        if (c.type !== "position") continue;
        const n = updated.find((n) => n.id === c.id);
        if (n) next[n.id] = n.position;
      }
      savePreference(`${key}:positions`, next);
      return next;
    });
  };
  return (
    <div className="map-page">
      <div className="map-toolbar">
        <span>
          <Flag size={14} />
          归属 <span className="legend-arrow">→</span> 未解除的依赖
        </span>
        <button
          className="quiet-button"
          onClick={() => {
            const next = initialPositions(scope);
            setPositions(next);
            savePreference(`${key}:positions`, next);
            flow?.setViewport({ x: 28, y: 30, zoom: 0.92 });
          }}
        >
          <RotateCcw size={14} />
          重排
        </button>
      </div>
      {hiddenEdges > 0 && (
        <p className="map-hidden">
          <Link2 size={13} />
          {hiddenEdges} 条依赖涉及被筛选隐藏的工单，可在详情中查看完整前置。
        </p>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onInit={setFlow}
        defaultViewport={viewport}
        onMoveEnd={(_, v) => {
          setViewport(v);
          savePreference(`${key}:viewport`, v);
        }}
        nodesConnectable={false}
        deleteKeyCode={null}
        ariaLabelConfig={{
          "edge.a11yDescription.default":
            "按 Enter 或空格选择依赖，按 Escape 取消。",
        }}
        minZoom={0.4}
        maxZoom={1.5}
        panOnScroll
        zoomOnScroll={false}
        preventScrolling
        onEdgeClick={(_, edge) => setEdgeDetail(edge.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color="#dededb" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {edgeDetail && (
        <div className="edge-detail">
          <button className="text-button" onClick={() => setEdgeDetail(null)}>
            收起
          </button>
          <strong>工单依赖</strong>
          {links
            .find((l) => `${l.source}:${l.target}` === edgeDetail)
            ?.tickets.map((t) => (
              <p key={`${t.from}:${t.to}`}>
                <button onClick={() => onOpen(t.from)}>
                  {index.byId.get(t.from)?.title}
                </button>
                <span> → </span>
                <button onClick={() => onOpen(t.to)}>
                  {index.byId.get(t.to)?.title}
                </button>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
