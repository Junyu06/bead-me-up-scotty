import { useState } from "react";
import { ChevronDown, ChevronRight, Diamond, Flag } from "lucide-react";
import {
  descendants,
  dayOffset,
  dateLabel,
  matches,
  timelineOrder,
  type Snapshot,
  type RecordItem,
  type Index,
  type Filters,
} from "./domain";
import { Empty } from "./ui";
export function Timeline({
  project,
  index,
  filters,
  onOpen,
}: {
  project: RecordItem;
  snapshot: Snapshot;
  index: Index;
  filters: Filters;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(
    new Set(["demo-content", "demo-delivery"]),
  );
  const scope = descendants(project.id, index).filter(
    (i) => i.status !== "closed" && matches(i, filters, index),
  );
  const unscheduled = scope.filter(
    (i) => i.role === "ticket" && !i.plan && !i.due && !i.forecast,
  );
  const rows = [
    project,
    ...timelineOrder(project.id, index, filters, expanded),
  ].filter((i) => i.plan || i.due || i.forecast || i.role === "milestone");
  const days = Array.from({ length: 16 }, (_, i) => i);
  return (
    <div className="timeline-page">
      <div className="timeline-caption">
        <span>9 月 21 日 — 10 月 6 日, 2026</span>
        <div className="timeline-legend">
          <span>
            <i className="legend-plan" />
            人工计划
          </span>
          <span>
            <Diamond size={12} />
            目标日期
          </span>
          <span>
            <i className="legend-forecast" />
            预计区间
          </span>
          <span className="subtle">实际事件：详情中查看</span>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-grid">
          <div className="timeline-head">
            <span>项目 / 里程碑 / 工单</span>
            <div>
              {days.map((i) => (
                <span key={i} className={i === 4 ? "today" : ""}>
                  {i === 0
                    ? "9/21"
                    : i === 10
                      ? "10/1"
                      : i < 10
                        ? 21 + i
                        : i - 9}
                </span>
              ))}
            </div>
          </div>
          {rows.map((item) => {
            const isGroup = item.role === "milestone";
            const indent =
              item.role === "project" ? 0 : item.parent === project.id ? 1 : 2;
            return (
              <div className="timeline-row" key={item.id}>
                <div
                  className="timeline-name"
                  style={{ paddingLeft: 16 + indent * 15 }}
                >
                  {isGroup ? (
                    <button
                      className="icon-button"
                      aria-label={`${expanded.has(item.id) ? "收起" : "展开"} ${item.title}`}
                      onClick={() =>
                        setExpanded((old) => {
                          const n = new Set(old);
                          if (n.has(item.id)) n.delete(item.id);
                          else n.add(item.id);
                          return n;
                        })
                      }
                    >
                      {expanded.has(item.id) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                  ) : (
                    <Flag size={13} />
                  )}
                  <button onClick={() => onOpen(item.id)}>{item.title}</button>
                </div>
                <div className="timeline-lane">
                  {days.map((i) => (
                    <span
                      className={`day-grid ${i === 4 ? "today" : ""}`}
                      key={i}
                    />
                  ))}
                  {item.plan && (
                    <button
                      className={`plan-bar ${item.role}`}
                      style={{
                        left: `${(dayOffset(item.plan.start) / 16) * 100}%`,
                        width: `${((dayOffset(item.plan.end) - dayOffset(item.plan.start) + 1) / 16) * 100}%`,
                      }}
                      onClick={() => onOpen(item.id)}
                      aria-label={`${item.title} 计划 ${item.plan.start} 到 ${item.plan.end}`}
                    >
                      <span>
                        {dateLabel(item.plan.start)} —{" "}
                        {dateLabel(item.plan.end)}
                      </span>
                    </button>
                  )}
                  {item.forecast && (
                    <button
                      className="forecast-bar"
                      style={{
                        left: `${(dayOffset(item.forecast.start) / 16) * 100}%`,
                        width: `${((dayOffset(item.forecast.end) - dayOffset(item.forecast.start) + 1) / 16) * 100}%`,
                      }}
                      onClick={() => onOpen(item.id)}
                      aria-label={`${item.title} 预计区间`}
                    />
                  )}{" "}
                  {item.due && (
                    <button
                      className="deadline"
                      style={{
                        left: `${((dayOffset(item.due) + 0.5) / 16) * 100}%`,
                      }}
                      aria-label={`${item.title} 目标 ${item.due}`}
                      title={`目标：${dateLabel(item.due)}`}
                      onClick={() => onOpen(item.id)}
                    >
                      <Diamond size={15} />
                    </button>
                  )}
                  {!item.plan && !item.forecast && !item.due && (
                    <span className="no-dates">未排期</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="unscheduled">
        <h3>
          未排期 <span>{unscheduled.length}</span>
        </h3>
        {unscheduled.map((i) => (
          <button key={i.id} onClick={() => onOpen(i.id)}>
            {i.title}
            <span>安排日期 →</span>
          </button>
        ))}
        {!unscheduled.length && (
          <p className="subtle">当前范围内的工单均已安排日期。</p>
        )}
      </div>
      {rows.length === 1 && !project.plan && !project.due && (
        <Empty title="还没有排期">可以在详情中填写目标日期与人工计划。</Empty>
      )}
    </div>
  );
}
