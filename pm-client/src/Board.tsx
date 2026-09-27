import { useState } from "react";
import { ArrowRight, Link2, SlidersHorizontal } from "lucide-react";
import {
  blockers,
  isBlocked,
  inDoneWindow,
  matches,
  stageOf,
  stages,
  type DoneWindow,
  type Filters,
  type Index,
  type Snapshot,
} from "./domain";
import { Empty, SmallDate, StageBadge, TicketPath } from "./ui";

export function Board({
  snapshot,
  index,
  filters,
  onOpen,
  initialWindow = "3d",
}: {
  snapshot: Snapshot;
  index: Index;
  filters: Filters;
  onOpen: (id: string) => void;
  initialWindow?: DoneWindow;
}) {
  const [window, setWindow] = useState<DoneWindow>(initialWindow);
  const [limit, setLimit] = useState(20);
  const [role, setRole] = useState("ticket");
  const [custom, setCustom] = useState({
    start: "2026-09-23",
    end: "2026-09-25",
  });
  const items = snapshot.items.filter(
    (i) => i.role === role && matches(i, filters, index),
  );
  const done = items
    .filter(
      (i) =>
        i.status === "closed" &&
        inDoneWindow(i, window, new Date(snapshot.now), custom),
    )
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  const visibleStages = stages.filter(
    (s) =>
      s !== "待分类" || items.some((i) => stageOf(i, snapshot, index) === s),
  );
  return (
    <div className="board-page">
      <div className="board-options">
        <span>
          <SlidersHorizontal size={14} />
          <select
            aria-label="对象层级"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="ticket">工单</option>
            <option value="milestone">里程碑</option>
            <option value="project">项目</option>
          </select>
        </span>
        <span
          className="board-done-control"
          title="按关闭时间筛选，只影响完成列"
        >
          完成{" "}
          <select
            aria-label="完成时间范围"
            value={window}
            onChange={(e) => {
              setWindow(e.target.value as DoneWindow);
              setLimit(20);
            }}
          >
            <option value="5h">5 小时内</option>
            <option value="24h">1 天内</option>
            <option value="3d">3 天内</option>
            <option value="7d">7 天内</option>
            <option value="custom">自定义日期</option>
            <option value="all">全部</option>
          </select>
          {window === "custom" && (
            <>
              <input
                aria-label="完成起始日期"
                type="date"
                value={custom.start}
                onChange={(e) =>
                  setCustom({ ...custom, start: e.target.value })
                }
              />
              <span>至</span>
              <input
                aria-label="完成结束日期"
                type="date"
                value={custom.end}
                onChange={(e) => setCustom({ ...custom, end: e.target.value })}
              />
            </>
          )}
        </span>
        <small>当前范围共 {items.length} 项</small>
      </div>
      {window === "custom" && custom.start > custom.end && (
        <p className="warning">起始日期不能晚于结束日期。</p>
      )}
      <div
        className="board-scroll"
        tabIndex={0}
        aria-label="执行看板，可横向滚动"
      >
        <div className="board-columns">
          {visibleStages.map((stage) => {
            const cards =
              stage === "Done"
                ? done.slice(0, limit)
                : items.filter((i) => stageOf(i, snapshot, index) === stage);
            return (
              <section
                className="board-column"
                key={stage}
                aria-label={`${stage === "Done" ? "完成" : stage} 列`}
              >
                <div className="column-heading">
                  <StageBadge stage={stage} />
                  <span>{stage === "Done" ? done.length : cards.length}</span>
                </div>
                {stage === "Done" && (
                  <p className="column-note">
                    共 {done.length} 项 / 已显示 {cards.length} 项
                  </p>
                )}
                {cards.map((item) => (
                  <button
                    className="ticket-card"
                    key={item.id}
                    onClick={() => onOpen(item.id)}
                  >
                    <TicketPath item={item} index={index} />
                    <strong>{item.title}</strong>
                    {isBlocked(item, index) && (
                      <span className="blocker-line">
                        <Link2 size={12} />
                        {item.status === "blocked"
                          ? (item.request?.reason ?? "人工标记受阻")
                          : `等待 ${blockers(item, index).length} 张前置工单`}
                      </span>
                    )}
                    {item.request && (
                      <span className="review-line">
                        {item.request.kind === "review"
                          ? "待验收"
                          : item.request.kind === "decision"
                            ? "待决策"
                            : "待操作"}
                      </span>
                    )}
                    <span className="card-footer">
                      <code>{item.id}</code>
                      <span className="priority">P{item.priority}</span>
                    </span>
                    <span className="card-bottom">
                      <span>{item.assignee ?? "未分配"}</span>
                      <SmallDate date={item.due} />
                    </span>
                  </button>
                ))}
                {!cards.length && (
                  <div className="column-empty">
                    暂无{stage === "Done" ? "符合时间范围的" : ""}
                    {role === "ticket"
                      ? "工单"
                      : role === "milestone"
                        ? "里程碑"
                        : "项目"}
                  </div>
                )}
                {stage === "Done" && done.length > limit && (
                  <button
                    className="load-more"
                    onClick={() => setLimit((l) => l + 20)}
                  >
                    再显示 20 张 <ArrowRight size={14} />
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
      {!items.length && <Empty title="当前筛选没有匹配的工单" />}
    </div>
  );
}
