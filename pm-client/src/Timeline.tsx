import { useState } from "react";
import { ChevronDown, ChevronRight, Diamond, Flag } from "lucide-react";
import {
  descendants,
  dayOffset,
  weekStart,
  shiftDate,
  dateOnly,
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
  snapshot,
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
    new Set(
      (index.children.get(project.id) ?? [])
        .filter((i) => i.role === "milestone")
        .map((i) => i.id),
    ),
  );
  const [origin, setOrigin] = useState(() => weekStart(snapshot.now));
  const today = dayOffset(dateOnly(new Date(snapshot.now)), origin);
  const offset = (value: string) => dayOffset(value, origin);
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
        <div className="timeline-navigation">
          <button
            className="icon-button"
            aria-label="上一段日期"
            onClick={() => setOrigin(shiftDate(origin, -14))}
          >
            <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span>
            {origin} — {shiftDate(origin, 15)}
          </span>
          <button
            className="icon-button"
            aria-label="下一段日期"
            onClick={() => setOrigin(shiftDate(origin, 14))}
          >
            <ChevronRight size={14} />
          </button>
          <button
            className="text-button"
            onClick={() => setOrigin(weekStart(snapshot.now))}
          >
            今天
          </button>
        </div>
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
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-grid">
          <div className="timeline-head">
            <span>项目 / 里程碑 / 工单</span>
            <div>
              {days.map((i) => (
                <span key={i} className={i === today ? "today" : ""}>
                  {dateLabel(shiftDate(origin, i))}
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
                      className={`day-grid ${i === today ? "today" : ""}`}
                      key={i}
                    />
                  ))}
                  {item.plan && (
                    <button
                      className={`plan-bar ${item.role}`}
                      style={{
                        left: `${(offset(item.plan.start) / 16) * 100}%`,
                        width: `${((offset(item.plan.end) - offset(item.plan.start) + 1) / 16) * 100}%`,
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
                        left: `${(offset(item.forecast.start) / 16) * 100}%`,
                        width: `${((offset(item.forecast.end) - offset(item.forecast.start) + 1) / 16) * 100}%`,
                      }}
                      onClick={() => onOpen(item.id)}
                      aria-label={`${item.title} 预计区间`}
                    />
                  )}{" "}
                  {item.due && (
                    <button
                      className="deadline"
                      style={{
                        left: `${((offset(item.due) + 0.5) / 16) * 100}%`,
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
      </div>
      {rows.length === 0 && !unscheduled.length && <Empty title="暂无排期" />}
    </div>
  );
}
