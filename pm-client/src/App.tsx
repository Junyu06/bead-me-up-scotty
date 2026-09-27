import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Columns3,
  FolderOpen,
  Layers2,
  Map as MapIcon,
  Plus,
  Search,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import {
  acceptExample,
  assignees,
  createIdeaExample,
  respondExample,
  emptyFilters,
  makeIndex,
  type Filters,
  type RecordItem,
} from "./domain";
import { createFixture } from "./fixtures";
import { Projects, ProjectOverview } from "./Projects";
import { Board } from "./Board";
import { MapView } from "./MapView";
import { NeedMe } from "./NeedMe";
import { Timeline } from "./Timeline";
import { Detail, NewIdea } from "./Detail";
import { historyScope, projectScope } from "./navigation";
import { useCompactHeader } from "./useCompactHeader";

type View = "projects" | "overview" | "board" | "map" | "need" | "timeline";
function restore(): { view: View; filters: Filters; projectSearch?: string } {
  try {
    const p = JSON.parse(
      localStorage.getItem("beads-pm:example-workspace-v1:view") ?? "null",
    );
    if (
      p &&
      ["projects", "overview", "board", "map", "need", "timeline"].includes(
        p.view,
      )
    )
      return {
        view: p.view,
        filters: {
          ...emptyFilters,
          ...p.filters,
          owner: assignees(createFixture().items).includes(p.filters?.owner)
            ? p.filters.owner
            : "all",
        },
        projectSearch: p.projectSearch ?? "",
      };
  } catch {
    /* Optional preferences. */
  }
  return { view: "projects", filters: emptyFilters };
}
const initial = restore();
export default function App() {
  const [snapshot, setSnapshot] = useState(createFixture);
  const [view, setView] = useState<View>(initial.view);
  const [boardWindow, setBoardWindow] = useState<"3d" | "all">("3d");
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [projectSearch, setProjectSearch] = useState(
    initial.projectSearch ?? "",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState(false);
  const [extraFilters, setExtraFilters] = useState(false);
  const [notice, setNotice] = useState("");
  const {
    container: headerRef,
    compact: headerCompact,
    toggle: toggleHeader,
    onWheelCapture,
    onScrollCapture,
    onKeyDownCapture,
  } = useCompactHeader(`${view}:${filters.project}`, view !== "projects");
  const index = useMemo(() => makeIndex(snapshot.items), [snapshot.items]);
  const projects = snapshot.items.filter((i) => i.role === "project");
  const project = index.byId.get(filters.project);
  const effectiveProject = project?.role === "project" ? project : projects[0];
  const requests = snapshot.items.filter(
    (i) => i.request && i.status !== "closed",
  );
  const item = selected ? index.byId.get(selected) : undefined;
  useEffect(() => {
    try {
      localStorage.setItem(
        "beads-pm:example-workspace-v1:view",
        JSON.stringify({ view, filters, projectSearch }),
      );
    } catch {
      /* Preferences only. */
    }
  }, [view, filters, projectSearch]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);
  const setScope = (id: string) =>
    setFilters((f) => ({ ...f, project: id, milestone: "all" }));
  const goProject = (id: string) => {
    setFilters((f) => projectScope(f, id, view === "projects"));
    setView("overview");
  };
  const openHistory = (milestone = "all") => {
    setBoardWindow("all");
    setFilters(historyScope(effectiveProject.id, milestone));
    setView("board");
  };
  const goView = (next: View) => {
    if (next === "board") setBoardWindow("3d");
    if ((next === "map" || next === "timeline") && !project)
      setScope(projects[0].id);
    setView(next);
  };
  const saveItem = (next: RecordItem) => {
    setSnapshot((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === next.id ? next : i)),
    }));
    setNotice("工单已保存");
  };
  const createIdea = (title: string, description: string) => {
    const next = createIdeaExample(snapshot, title, description);
    if (next === snapshot) return;
    setSnapshot(next);
    setNewIdea(false);
    setSelected(next.items.at(-1)!.id);
    setNotice("工单已创建");
  };
  const activeCount = ["milestone", "owner", "priority", "label"].filter(
    (k) => filters[k as keyof Filters] !== "all",
  ).length;
  const viewLabel = {
    projects: "Projects",
    overview: "概览",
    board: "Board",
    map: "Map",
    need: "Need Me",
    timeline: "Timeline",
  }[view];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Layers2 size={23} strokeWidth={1.6} />
          <strong>Beads</strong>
          <span>PM</span>
        </div>
        <button className="new-idea-button" onClick={() => setNewIdea(true)}>
          <Plus size={18} />
          新建工单
        </button>
        <div className="sidebar-label">工作空间</div>
        <nav aria-label="主导航">
          {(
            [
              { id: "projects", label: "Projects", icon: FolderOpen },
              { id: "board", label: "Board", icon: Columns3 },
              { id: "map", label: "Map", icon: MapIcon },
              { id: "need", label: "Need Me", icon: UserRound },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={
                view === id ||
                (id === "projects" && ["overview", "timeline"].includes(view))
                  ? "selected"
                  : ""
              }
              onClick={() => {
                if (id === "projects") {
                  setScope("all");
                  setView(id);
                } else goView(id);
              }}
            >
              <Icon size={18} strokeWidth={1.65} />
              {label}
              {id === "need" && requests.length > 0 && (
                <span className="nav-count" title="全部项目的待处理请求">
                  {requests.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-label project-label">
          项目 <span>{projects.length}</span>
        </div>
        <div className="sidebar-projects">
          {projects.map((p) => (
            <button
              key={p.id}
              className={project?.id === p.id ? "selected" : ""}
              onClick={() => goProject(p.id)}
            >
              <span
                className={`project-dot ${p.status === "idea" ? "idea" : ""}`}
              />
              <span>{p.title}</span>
            </button>
          ))}
        </div>
      </aside>
      <main
        ref={headerRef}
        className={`main ${headerCompact ? "header-compact" : ""}`}
      >
        <header className="toolbar">
          <div className="breadcrumb">
            <button
              onClick={() => {
                setScope("all");
                setView("projects");
              }}
            >
              工作空间
            </button>
            <ChevronRight size={13} />
            {project && view !== "projects" && (
              <>
                <button onClick={() => setView("overview")}>
                  {project.title}
                </button>
                <ChevronRight size={13} />
              </>
            )}
            <strong>{viewLabel}</strong>
          </div>
          <div className="toolbar-actions">
            {view !== "projects" && (
              <button
                className="header-toggle"
                aria-expanded={!headerCompact}
                aria-controls={
                  view === "need"
                    ? "workspace-filters"
                    : "workspace-filters workspace-title"
                }
                aria-label={headerCompact ? "展开标题与筛选" : "收起标题与筛选"}
                title={headerCompact ? "展开标题与筛选" : "收起标题与筛选"}
                onClick={toggleHeader}
              >
                {headerCompact ? (
                  <ChevronDown size={15} />
                ) : (
                  <ChevronUp size={15} />
                )}
                {headerCompact ? "展开" : "收起"}
                {headerCompact && (activeCount > 0 || filters.search) && (
                  <span>筛选 {activeCount + Number(!!filters.search)}</span>
                )}
              </button>
            )}
            <span className="demo-badge">示例工作区 · 修改仅保留本次会话</span>
            <button
              className="icon-button"
              aria-label="新建工单"
              onClick={() => setNewIdea(true)}
            >
              <Plus size={19} />
            </button>
          </div>
        </header>
        {view !== "projects" && view !== "need" && (
          <div className="view-heading">
            <div
              className="header-collapse"
              id="workspace-title"
              data-header-details
              inert={headerCompact}
            >
              <div className="header-collapse-inner">
                <div className="view-title">
                  {project ? (
                    <button
                      className="back-projects"
                      aria-label="返回全部项目"
                      onClick={() => {
                        setScope("all");
                        setView("projects");
                      }}
                    >
                      <ArrowLeft size={17} />
                    </button>
                  ) : null}
                  <h1>{project?.title ?? "全部工作"}</h1>
                  {project && (
                    <button
                      className="icon-button"
                      aria-label="查看项目详情"
                      onClick={() => setSelected(project.id)}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="view-tabs" aria-label="项目视图">
              {(project
                ? ["overview", "board", "map", "timeline"]
                : ["board", "map"]
              ).map((v) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => goView(v as View)}
                >
                  {
                    {
                      overview: "概览",
                      board: "Board",
                      map: "Map",
                      timeline: "Timeline",
                    }[v as "overview" | "board" | "map" | "timeline"]
                  }
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          className="header-collapse"
          id="workspace-filters"
          data-header-details
          inert={headerCompact}
        >
          <div className="header-collapse-inner">
            <div
              className={`filter-toolbar ${view === "projects" ? "projects-filter" : ""}`}
            >
              <label className="search-box">
                <Search size={15} />
                <input
                  aria-label="搜索标题或 ID"
                  placeholder="搜索标题或 ID"
                  value={view === "projects" ? projectSearch : filters.search}
                  onChange={(e) =>
                    view === "projects"
                      ? setProjectSearch(e.target.value)
                      : setFilters({ ...filters, search: e.target.value })
                  }
                />
                {(view === "projects" ? projectSearch : filters.search) && (
                  <button
                    aria-label="清空搜索"
                    className="icon-button"
                    onClick={() =>
                      view === "projects"
                        ? setProjectSearch("")
                        : setFilters({ ...filters, search: "" })
                    }
                  >
                    <X size={12} />
                  </button>
                )}
              </label>
              {view !== "projects" && (
                <>
                  <select
                    aria-label="项目范围"
                    value={filters.project}
                    onChange={(e) => {
                      const id = e.target.value;
                      setScope(id);
                      if (
                        id === "all" &&
                        ["map", "timeline", "overview"].includes(view)
                      )
                        setView("board");
                    }}
                  >
                    <option value="all">全部项目</option>
                    {projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`filter-button ${activeCount ? "filtered" : ""}`}
                    onClick={() => setExtraFilters(!extraFilters)}
                  >
                    <Settings2 size={14} />
                    筛选{activeCount > 0 && <span>{activeCount}</span>}
                  </button>
                  {(filters.search || activeCount > 0) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        setFilters({
                          ...emptyFilters,
                          project: filters.project,
                        })
                      }
                    >
                      清除筛选
                    </button>
                  )}
                </>
              )}
              <span className="filter-spacer" />
              <span className="snapshot-date">9 月 25 日，星期五</span>
            </div>
            {extraFilters && view !== "projects" && (
              <div className="extra-filters">
                <label>
                  Milestone
                  <select
                    aria-label="Milestone 筛选"
                    value={filters.milestone}
                    onChange={(e) =>
                      setFilters({ ...filters, milestone: e.target.value })
                    }
                  >
                    <option value="all">全部</option>
                    {snapshot.items
                      .filter(
                        (i) =>
                          i.role === "milestone" &&
                          (filters.project === "all" ||
                            i.parent === filters.project),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  负责人
                  <select
                    aria-label="负责人筛选"
                    value={filters.owner}
                    onChange={(e) =>
                      setFilters({ ...filters, owner: e.target.value })
                    }
                  >
                    <option value="all">全部</option>
                    {assignees(snapshot.items).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  优先级
                  <select
                    aria-label="优先级筛选"
                    value={filters.priority}
                    onChange={(e) =>
                      setFilters({ ...filters, priority: e.target.value })
                    }
                  >
                    <option value="all">全部</option>
                    {[0, 1, 2, 3, 4].map((p) => (
                      <option key={p} value={p}>
                        P{p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  标签
                  <select
                    aria-label="标签筛选"
                    value={filters.label}
                    onChange={(e) =>
                      setFilters({ ...filters, label: e.target.value })
                    }
                  >
                    <option value="all">全部</option>
                    {[...new Set(snapshot.items.flatMap((i) => i.labels))].map(
                      (l) => (
                        <option key={l}>{l}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
        <div
          className={`view-content view-${view}`}
          onWheelCapture={onWheelCapture}
          onScrollCapture={onScrollCapture}
          onKeyDownCapture={onKeyDownCapture}
        >
          {view === "projects" ? (
            <Projects
              snapshot={snapshot}
              index={index}
              onProject={goProject}
              onOpen={setSelected}
              search={projectSearch}
            />
          ) : view === "overview" ? (
            <ProjectOverview
              key={effectiveProject.id}
              project={effectiveProject}
              snapshot={snapshot}
              index={index}
              filters={filters}
              onOpen={setSelected}
              onView={goView}
              onHistory={() => openHistory()}
            />
          ) : view === "board" ? (
            <Board
              initialWindow={boardWindow}
              snapshot={snapshot}
              index={index}
              filters={filters}
              onOpen={setSelected}
            />
          ) : view === "map" ? (
            <MapView
              key={effectiveProject.id}
              project={effectiveProject}
              snapshot={snapshot}
              index={index}
              filters={filters}
              onOpen={setSelected}
              onHistory={openHistory}
            />
          ) : view === "need" ? (
            <NeedMe
              snapshot={snapshot}
              index={index}
              filters={filters}
              onOpen={setSelected}
            />
          ) : (
            <Timeline
              key={effectiveProject.id}
              project={effectiveProject}
              snapshot={snapshot}
              index={index}
              filters={filters}
              onOpen={setSelected}
            />
          )}
        </div>
      </main>
      {item && (
        <Detail
          key={item.id}
          item={item}
          index={index}
          snapshot={snapshot}
          onClose={() => setSelected(null)}
          onOpen={setSelected}
          onSave={saveItem}
          onAccept={(id) => {
            setSnapshot((s) => acceptExample(s, id));
            setNotice(`${id} 已关闭`);
          }}
          onRespond={(id, body) => {
            setSnapshot((s) => respondExample(s, id, body));
            setNotice("答复已提交");
          }}
          onRequestChanges={(id, reason) => {
            setSnapshot((s) => ({
              ...s,
              items: s.items.map((i) =>
                i.id === id
                  ? {
                      ...i,
                      status: "in_progress",
                      request: undefined,
                      description: `${i.description}\n\n## 本轮修改意见\n\n${reason}`,
                    }
                  : i,
              ),
            }));
            setNotice("修改意见已提交");
          }}
        />
      )}
      {newIdea && (
        <NewIdea onClose={() => setNewIdea(false)} onCreate={createIdea} />
      )}{" "}
      {notice && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
    </div>
  );
}
