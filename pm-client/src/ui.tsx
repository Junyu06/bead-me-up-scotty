import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock3,
  Pause,
  TriangleAlert,
  Eye,
  Lightbulb,
} from "lucide-react";
import type { Stage, RecordItem, Index, Snapshot } from "./domain";
import { ancestry, stageOf, progress, isBlocked, requestLabel } from "./domain";

const statusIcons = {
  Idea: Lightbulb,
  Ready: Circle,
  "In progress": CircleDot,
  Review: Eye,
  Blocked: TriangleAlert,
  "On hold": Pause,
  Done: CircleCheck,
  待分类: CircleDashed,
};
export function StageBadge({
  stage,
  compact = false,
}: {
  stage: Stage;
  compact?: boolean;
}) {
  const Icon = statusIcons[stage];
  return (
    <span className={`stage stage-${stage.toLowerCase().replaceAll(" ", "-")}`}>
      <Icon size={14} />
      {!compact && (stage === "Done" ? "完成" : stage)}
    </span>
  );
}
export function TicketPath({
  item,
  index,
}: {
  item: RecordItem;
  index: Index;
}) {
  return (
    <span className="ticket-path">
      {ancestry(item, index)
        .map((i) => i.title)
        .join(" / ") || "独立工单"}
    </span>
  );
}
export function ProgressLine({
  id,
  snapshot,
  index,
}: {
  id: string;
  snapshot: Snapshot;
  index: Index;
}) {
  const p = progress(id, snapshot, index);
  return (
    <div className="progress-line">
      <span>
        {!p.complete
          ? "数据不完整"
          : p.total
            ? `${p.closed} / ${p.total} 已关闭`
            : "尚未拆分"}
      </span>
      {p.total > 0 && p.complete && (
        <span className="progress-track">
          <span style={{ width: `${(p.closed / p.total) * 100}%` }} />
        </span>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <CircleDashed size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function TicketRow({
  item,
  index,
  snapshot,
  onOpen,
}: {
  item: RecordItem;
  index: Index;
  snapshot: Snapshot;
  onOpen: (id: string) => void;
}) {
  return (
    <button className="ticket-row" onClick={() => onOpen(item.id)}>
      <StageBadge stage={stageOf(item, snapshot, index)} compact />
      <span className="row-title">{item.title}</span>
      <code>{item.id}</code>
      {isBlocked(item, index) && <span className="blocked-text">受阻</span>}
      {item.request && (
        <span className="subtle">
          {item.request && requestLabel(item.request.kind)}
        </span>
      )}
      <span className="row-owner">{item.assignee ?? "未分配"}</span>
    </button>
  );
}
export function SmallDate({ date }: { date?: string }) {
  return date ? (
    <span className="small-date">
      <Clock3 size={13} />
      {date.slice(5).replace("-", "/")}
    </span>
  ) : null;
}
