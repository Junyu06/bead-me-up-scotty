import { useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Folder,
  Flag,
  ArrowRight,
} from "lucide-react";
import {
  dateLabel,
  progress,
  stageOf,
  requestLabel,
  matches,
  type Snapshot,
  type Index,
  type RecordItem,
  type Filters,
} from "./domain";
import { Empty, ProgressLine, StageBadge, TicketRow } from "./ui";

export function Projects({
  snapshot,
  index,
  onProject,
  onOpen,
  search,
}: {
  snapshot: Snapshot;
  index: Index;
  onProject: (id: string) => void;
  onOpen: (id: string) => void;
  search: string;
}) {
  const projects = snapshot.items.filter(
    (i) =>
      i.role === "project" &&
      `${i.title} ${i.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const requests = snapshot.items.filter(
    (i) => i.request && i.status !== "closed",
  );
  return (
    <div className="page projects-page">
      <div className="page-intro">
        <h1>项目概览</h1>
      </div>
      <div className="section-heading">
        <h2>
          项目 <span>{projects.length}</span>
        </h2>
        <span className="subtle">工单进度 · 包含历史记录</span>
      </div>
      <div className="project-table">
        <div className="project-table-head">
          <span>项目</span>
          <span>工单进度</span>
          <span>需要关注</span>
          <span>目标日期</span>
          <span />
        </div>
        {projects.map((project) => {
          const p = progress(project.id, snapshot, index);
          return (
            <button
              className="project-table-row"
              key={project.id}
              onClick={() => onProject(project.id)}
            >
              <span className="project-name">
                <span className="project-symbol">
                  <Folder size={19} />
                </span>
                <span>
                  <strong>{project.title}</strong>
                  {project.status === "idea" && <small>Idea</small>}
                </span>
              </span>
              <ProgressLine id={project.id} snapshot={snapshot} index={index} />
              <span className="attention-counts">
                {p.review > 0 && (
                  <span className="review-text">{p.review} 待验收</span>
                )}
                {p.blocked > 0 && <span>{p.blocked} 受阻</span>}
                {p.decision > 0 && <span>{p.decision} 待决策</span>}
                {p.action > 0 && <span>{p.action} 待操作</span>}
                {p.attention > 0 && <span>{p.attention} 待处理</span>}
                {!p.review &&
                  !p.blocked &&
                  !p.decision &&
                  !p.action &&
                  !p.attention && <span className="subtle">—</span>}
              </span>
              <span>{dateLabel(project.due)}</span>
              <ArrowUpRight size={16} />
            </button>
          );
        })}
        {!projects.length && (
          <Empty title={search ? "没有匹配的项目" : "暂无项目"} />
        )}
      </div>
      <div className="section-heading next-section">
        <h2>
          待处理事项 <span>{requests.length}</span>
        </h2>
      </div>
      <div className="attention-list">
        {requests.map((item) => (
          <button
            key={item.id}
            onClick={() => onOpen(item.id)}
            className="attention-row"
          >
            <StageBadge stage={stageOf(item, snapshot, index)} compact />
            <span>
              <strong>{item.title}</strong>
              <small>{item.request?.reason}</small>
            </span>
            <span className="request-kind">
              {item.request && requestLabel(item.request.kind)}
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProjectOverview({
  project,
  snapshot,
  index,
  onOpen,
  onView,
  onHistory,
  filters,
}: {
  project: RecordItem;
  snapshot: Snapshot;
  index: Index;
  onOpen: (id: string) => void;
  onView: (v: "board" | "map" | "timeline") => void;
  onHistory: () => void;
  filters: Filters;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(
      (index.children.get(project.id) ?? [])
        .filter((i) => i.role === "milestone")
        .slice(0, 1)
        .map((i) => i.id),
    ),
  );
  const p = progress(project.id, snapshot, index);
  const children = index.children.get(project.id) ?? [];
  const groups = children.filter((i) => i.role === "milestone");
  const direct = children.filter(
    (i) =>
      i.role === "ticket" &&
      i.status !== "closed" &&
      matches(i, filters, index),
  );
  return (
    <div className="page project-overview">
      <p className="project-description">
        {project.description.split("\n")[0]}
      </p>
      <div className="project-summary">
        <div>
          <span className="eyebrow">工单进度</span>
          <strong>
            {p.closed}
            <span> / {p.total}</span>
          </strong>
          <small>已关闭 · {p.historical} 张历史验收记录未知</small>
        </div>
        <div>
          <span className="eyebrow">需要关注</span>
          <strong>
            {p.review + p.decision + p.action + p.attention}
            <span> 待处理</span>
          </strong>
          <small>
            {p.review} 待验收 · {p.decision} 待决策 · {p.action} 待操作
            {p.attention > 0 && ` · ${p.attention} 待处理`}
          </small>
          <small>{p.blocked} 项受阻</small>
        </div>
        <div>
          <span className="eyebrow">目标日期</span>
          <strong className="date-value">{dateLabel(project.due)}</strong>
          <small>
            {project.forecast
              ? `预计 ${dateLabel(project.forecast.start)} — ${dateLabel(project.forecast.end)}`
              : "预计完成：未知"}
          </small>
        </div>
      </div>
      <div className="section-heading">
        <h2>项目结构</h2>
        <button className="text-button" onClick={() => onView("map")}>
          在 Map 中查看 <ArrowUpRight size={14} />
        </button>
      </div>
      {!children.length && <Empty title="暂无里程碑或工单" />}
      {groups
        .filter(
          (g) => filters.milestone === "all" || g.id === filters.milestone,
        )
        .map((group) => {
          const open = expanded.has(group.id);
          const groupItems = (index.children.get(group.id) ?? []).filter(
            (i) => i.status !== "closed" && matches(i, filters, index),
          );
          return (
            <section className="milestone-section" key={group.id}>
              <button
                className="milestone-header"
                aria-expanded={open}
                onClick={() =>
                  setExpanded((old) => {
                    const s = new Set(old);
                    if (s.has(group.id)) s.delete(group.id);
                    else s.add(group.id);
                    return s;
                  })
                }
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Flag size={16} />
                <strong>{group.title}</strong>
                <ProgressLine id={group.id} snapshot={snapshot} index={index} />
                <span className="subtle">{dateLabel(group.due)}</span>
              </button>
              {open && (
                <div className="milestone-tickets">
                  {groupItems.length ? (
                    groupItems.map((item) => (
                      <TicketRow
                        key={item.id}
                        {...{ item, index, snapshot, onOpen }}
                      />
                    ))
                  ) : (
                    <p className="inline-empty">
                      {(index.children.get(group.id) ?? []).length
                        ? "当前筛选下没有未关闭的工单"
                        : "暂无工单"}
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      {direct.length > 0 && (
        <section className="direct-tickets">
          <h3>{groups.length ? "直接属于项目" : "工单"}</h3>
          {direct.map((item) => (
            <TicketRow key={item.id} {...{ item, index, snapshot, onOpen }} />
          ))}
        </section>
      )}
      {p.historical > 0 && (
        <button className="history-link" onClick={onHistory}>
          查看全部关闭记录 <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
