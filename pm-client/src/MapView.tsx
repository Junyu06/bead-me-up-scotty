import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  type EdgeProps,
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
import {
  layoutMap,
  mapRelations,
  mapScope,
  projectLinks,
  type PositionMap,
} from "./map-model";
import { routeLink, routePath, type MapRoute } from "./map-routing";
import { StageBadge } from "./ui";

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
  contextOnly?: boolean;
};
function Ports({ container = false }: { container?: boolean }) {
  return (
    <>
      <Handle
        id="in-left"
        type="target"
        position={Position.Left}
        style={container ? { top: 44 } : undefined}
      />
      <Handle
        id="out-right"
        type="source"
        position={Position.Right}
        style={container ? { top: 44 } : undefined}
      />
      {!container && (
        <>
          <Handle id="in-top" type="target" position={Position.Top} />
          <Handle id="out-bottom" type="source" position={Position.Bottom} />
        </>
      )}
    </>
  );
}
function RoutedEdge({ id, data, markerEnd, selected }: EdgeProps) {
  const route = data?.route as MapRoute;
  return (
    <BaseEdge
      id={id}
      path={routePath(route.points)}
      markerEnd={markerEnd}
      style={{
        stroke: selected ? "#92543f" : "#b7836e",
        strokeWidth: selected ? 2.3 : 1.4,
      }}
      interactionWidth={18}
    />
  );
}
const edgeTypes = { routed: RoutedEdge };
function TicketNode({ data }: NodeProps) {
  const d = data as unknown as MapData;
  return (
    <>
      <Ports />
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
    </>
  );
}
function MilestoneNode({ data }: NodeProps) {
  const d = data as unknown as MapData;
  return (
    <>
      <Ports container />
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
        <span>
          {d.item.role === "ticket" ? (
            <StageBadge stage={d.stage} compact />
          ) : null}
          {d.count ? `${d.closed} / ${d.count} 子工单已关闭` : "暂无子工单"}
          <button
            className="map-open nodrag"
            onClick={() => d.open(d.item.id)}
            aria-label={`查看 ${d.item.title}`}
          >
            详情
          </button>
        </span>
      </div>
      {d.collapsed ? (
        <p className="map-group-summary">
          {d.count
            ? `${(d.count ?? 0) - (d.closed ?? 0)} 张未关闭 · 点击展开`
            : "暂无工单"}
        </p>
      ) : (
        <>
          {!!d.hidden && (
            <p className="map-group-caption">
              {d.hidden} 张未关闭工单被筛选隐藏
            </p>
          )}
          {d.closed! > 0 && (
            <button className="map-history nodrag" onClick={d.history}>
              {d.closed} 张已关闭工单 · 在 Board 查看 →
            </button>
          )}
        </>
      )}
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
  const key = `beads-pm:${snapshot.workspace}:${project.id}:map:v2`;
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(readPreference<string[]>(`${key}:collapsed`, [])),
  );
  const [positions, setPositions] = useState<PositionMap>(() =>
    readPreference(`${key}:positions`, {}),
  );
  useEffect(
    () => savePreference(`${key}:positions`, positions),
    [key, positions],
  );
  const [viewport, setViewport] = useState<Viewport>(() =>
    readPreference(`${key}:viewport`, { x: 36, y: 72, zoom: 0.9 }),
  );
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<string | null>(null);
  const scope = useMemo(() => mapScope(project.id, index), [project.id, index]);
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePreference(`${key}:collapsed`, [...next]);
      return next;
    });
  const boxes = useMemo(
    () => layoutMap(scope, index, collapsed, filters, positions),
    [scope, index, collapsed, filters, positions],
  );
  const nodes: Node[] = boxes.map((box) => {
    const item = index.byId.get(box.id)!;
    const count = progress(item.id, snapshot, index);
    return {
      id: box.id,
      type: box.container ? "milestone" : "ticket",
      parentId: box.parentId,
      position: box.position,
      style: { width: box.width, height: box.height },
      className: box.container ? "map-group" : undefined,
      zIndex: box.container ? 0 : 2,
      data: {
        item,
        stage: stageOf(item, snapshot, index),
        open: onOpen,
        collapsed: box.collapsed,
        toggle: () => toggle(item.id),
        count: count.total,
        closed: count.closed,
        hidden: descendants(item.id, index).filter(
          (t) =>
            t.role === "ticket" &&
            t.status !== "closed" &&
            !matches(t, filters, index),
        ).length,
        history: () => onHistory(item.id),
        direct: item.parent === project.id,
        contextOnly: box.contextOnly,
      },
    };
  });
  const visible = new Set(boxes.map((b) => b.id));
  const links = projectLinks(
    scope,
    index,
    visible,
    collapsed,
    new Set(
      scope
        .filter((item) => matches(item, filters, index))
        .map((item) => item.id),
    ),
  );
  const routed = useMemo(
    () => links.map((link) => ({ link, route: routeLink(link, boxes) })),
    [links, boxes],
  );
  const edges: Edge[] = routed.flatMap(({ link, route }) =>
    route
      ? [
          {
            id: `${link.source}:${link.target}`,
            source: link.source,
            target: link.target,
            sourceHandle: route.sourceHandle,
            targetHandle: route.targetHandle,
            type: "routed",
            data: { route },
            ariaLabel: `${index.byId.get(link.source)?.title} → ${index.byId.get(link.target)?.title}`,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#b7836e",
              width: 16,
              height: 16,
            },
            zIndex: 1,
          },
        ]
      : [],
  );
  const drawn = new Set(
    links.flatMap((l) => l.tickets.map((t) => `${t.from}:${t.to}`)),
  );
  const hiddenRelations = mapRelations(scope, index).filter(
    (t) => !drawn.has(`${t.from}:${t.to}`),
  );
  const unrouted = routed.filter((r) => !r.route);
  const onNodesChange = (changes: NodeChange[]) => {
    const moved = changes.filter((c) => c.type === "position" && c.position);
    if (!moved.length) return;
    setPositions((old) => {
      const next = { ...old };
      for (const change of moved)
        if (change.type === "position" && change.position)
          next[change.id] = change.position;
      return next;
    });
  };
  return (
    <div className="map-page">
      <div className="map-toolbar">
        <span>
          <Flag size={14} />
          框：归属 <span className="legend-arrow">前置 → 后续</span>
        </span>
        <button
          className="quiet-button"
          onClick={() => {
            const next = {};
            setPositions(next);
            savePreference(`${key}:positions`, next);
            void flow?.setViewport({ x: 36, y: 72, zoom: 0.9 });
          }}
        >
          <RotateCcw size={14} />
          重排
        </button>
      </div>
      {hiddenRelations.length > 0 && (
        <p className="map-hidden">
          <Link2 size={13} />
          {hiddenRelations.length} 条依赖未显示
          <button
            className="text-button"
            onClick={() => setEdgeDetail("hidden")}
          >
            查看依赖
          </button>
        </p>
      )}
      {!!unrouted.length && (
        <div className="map-hidden">
          {unrouted.length} 条依赖的端点被遮挡
          <button
            className="text-button"
            onClick={() => setEdgeDetail("unrouted")}
          >
            查看依赖
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
          {(edgeDetail === "hidden"
            ? hiddenRelations
            : edgeDetail === "unrouted"
              ? unrouted.flatMap((r) => r.link.tickets)
              : (links.find((l) => `${l.source}:${l.target}` === edgeDetail)
                  ?.tickets ?? [])
          ).map((t) => (
            <p key={`${t.from}:${t.to}`}>
              <button
                disabled={!index.byId.has(t.from)}
                onClick={() => onOpen(t.from)}
              >
                {index.byId.get(t.from)?.title ?? t.from}
              </button>
              <span> → </span>
              <button
                disabled={!index.byId.has(t.to)}
                onClick={() => onOpen(t.to)}
              >
                {index.byId.get(t.to)?.title ?? t.to}
              </button>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
