import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  X,
  Link2,
  Pencil,
  CalendarDays,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { checklistProgress } from "../../lib/beads-view";
import {
  ancestry,
  assignees,
  blockers,
  isBlocked,
  dateLabel,
  stageOf,
  type Index,
  type RecordItem,
  type Snapshot,
} from "./domain";
import { StageBadge } from "./ui";

export function Detail({
  item,
  index,
  snapshot,
  onClose,
  onOpen,
  onSave,
  onAccept,
  onRequestChanges,
  onRespond,
}: {
  item: RecordItem;
  index: Index;
  snapshot: Snapshot;
  onClose: () => void;
  onOpen: (id: string) => void;
  onSave: (item: RecordItem) => void;
  onAccept: (id: string) => void;
  onRequestChanges: (id: string, reason: string) => void;
  onRespond: (id: string, body: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [full, setFull] = useState(false);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(item);
  const [confirm, setConfirm] = useState<
    "accept" | "discard" | "changes" | "respond" | null
  >(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pendingExit, setPendingExit] = useState<
    "read" | "close" | { id: string } | null
  >(null);
  const [resumeConfirm, setResumeConfirm] = useState<
    "changes" | "respond" | null
  >(null);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(item);
  const blocked = blockers(item, index);
  const blockedNow = isBlocked(item, index);
  const responseDirty =
    (confirm === "changes" ||
      confirm === "respond" ||
      (confirm === "discard" && resumeConfirm !== null)) &&
    !!reason.trim();
  const hasUnsaved = (edit && isDirty) || responseDirty;
  const checklist = checklistProgress(item.acceptance);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [hasUnsaved]);
  const requestExit = (destination: "read" | "close" | { id: string }) => {
    if (hasUnsaved) {
      setPendingExit(destination);
      if (confirm !== "discard")
        setResumeConfirm(
          confirm === "changes" || confirm === "respond" ? confirm : null,
        );
      setConfirm("discard");
    } else if (destination === "read") {
      setDraft(item);
      setEdit(false);
      setError("");
    } else if (destination === "close") onClose();
    else onOpen(destination.id);
  };
  const requestClose = () => {
    requestExit("close");
  };
  const openOther = (id: string) => {
    requestExit({ id });
  };
  const save = () => {
    if (!draft.title.trim()) {
      setError("标题不能为空。");
      return;
    }
    if (
      draft.plan &&
      (!draft.plan.start ||
        !draft.plan.end ||
        draft.plan.start > draft.plan.end)
    ) {
      setError("计划需要开始与结束日期，且开始不能晚于结束。");
      return;
    }
    onSave({ ...draft, title: draft.title.trim() });
    setError("");
    setEdit(false);
  };
  return (
    <dialog
      ref={dialog}
      className={`detail-dialog ${full ? "full" : ""}`}
      aria-label={`${item.id} 详情`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <header className="detail-toolbar">
        <span>
          <FileText size={15} />
          <code>{item.id}</code>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label={full ? "缩小详情" : "展开完整阅读页"}
            onClick={() => setFull(!full)}
          >
            {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="关闭详情"
            onClick={requestClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="detail-scroll">
        <div className="detail-reading">
          <div className="detail-breadcrumb">
            {ancestry(item, index).map((p) => (
              <span key={p.id}>
                <button onClick={() => openOther(p.id)}>{p.title}</button>
                <ChevronRight size={12} />
              </span>
            ))}
            <span>
              {item.role === "milestone"
                ? "里程碑"
                : item.role === "project"
                  ? "项目"
                  : "工单"}
            </span>
          </div>
          {edit ? (
            <input
              className="title-input"
              aria-label="标题"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          ) : (
            <h1>{item.title}</h1>
          )}
          <div className="detail-status">
            <StageBadge stage={stageOf(item, snapshot, index)} />
            <span>P{item.priority}</span>
            <span>{item.assignee ?? "未分配"}</span>
            <span className="grow" />
            <button
              className="text-button"
              disabled={confirm !== null}
              onClick={() => {
                if (edit) requestExit("read");
                else {
                  setDraft(item);
                  setEdit(true);
                }
              }}
            >
              <Pencil size={13} />
              {edit ? "取消编辑" : "编辑"}
            </button>
          </div>
          {item.request && (
            <section className={`detail-request ${item.request.kind}`}>
              <span className="eyebrow">
                {item.request.kind === "review"
                  ? "待验收"
                  : item.request.kind === "decision"
                    ? "待决策"
                    : "待操作"}
              </span>
              <p>{item.request.reason}</p>
              {item.request.evidence && (
                <div className="evidence">
                  <Check size={14} />
                  {item.request.evidence}
                </div>
              )}
              {item.request.revision && (
                <small>本轮交付：{item.request.revision}</small>
              )}
            </section>
          )}
          {item.status === "blocked" && (
            <section className="detail-blockers">
              <strong>人工标记受阻</strong>
              <p>{item.request?.reason ?? "阻塞状态尚未解除。"}</p>
            </section>
          )}
          {blocked.length > 0 && (
            <section className="detail-blockers">
              <strong>
                <Link2 size={14} />
                {blocked.length} 张前置工单未关闭
              </strong>
              {blocked.map((id) => (
                <button key={id} onClick={() => openOther(id)}>
                  {index.byId.get(id)?.title ?? id}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </section>
          )}
          {!!item.responses?.length && (
            <section className="detail-section">
              <h2>处理记录</h2>
              {item.responses.map((response, n) => (
                <div className="response-entry" key={`${response.at}-${n}`}>
                  <strong>
                    {response.request.kind === "decision"
                      ? "决策答复"
                      : "操作结果"}
                  </strong>
                  <small>{new Date(response.at).toLocaleString("zh-CN")}</small>
                  <p className="subtle">{response.request.reason}</p>
                  <div className="markdown">
                    <Markdown>{response.body}</Markdown>
                  </div>
                </div>
              ))}
            </section>
          )}
          {edit ? (
            <>
              <label className="edit-field">
                描述（Markdown）
                <textarea
                  aria-label="描述"
                  rows={10}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <div className="edit-grid">
                <label className="edit-field">
                  负责人
                  <select
                    value={draft.assignee ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        assignee: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">未分配</option>
                    {assignees(snapshot.items, draft.assignee).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="edit-field">
                  优先级
                  <select
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft({ ...draft, priority: Number(e.target.value) })
                    }
                  >
                    {[0, 1, 2, 3, 4].map((p) => (
                      <option key={p} value={p}>
                        P{p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <div className="markdown">
              <Markdown>{item.description}</Markdown>
            </div>
          )}
          {item.acceptance && (
            <section className="detail-section">
              <h2>
                验收标准{" "}
                <span>
                  {checklist.done} / {checklist.total}
                </span>
              </h2>
              <div className="markdown">
                <Markdown>{item.acceptance}</Markdown>
              </div>
            </section>
          )}
          <section className="detail-section">
            <h2>
              <CalendarDays size={16} />
              日期与安排
            </h2>
            {edit ? (
              <>
                <label className="edit-field">
                  目标日期
                  <input
                    type="date"
                    aria-label="目标日期"
                    value={draft.due ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, due: e.target.value || undefined })
                    }
                  />
                </label>
                <div className="edit-grid">
                  <label className="edit-field">
                    计划开始
                    <input
                      type="date"
                      aria-label="计划开始"
                      value={draft.plan?.start ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          plan: {
                            start: e.target.value,
                            end: draft.plan?.end ?? "",
                          },
                        })
                      }
                    />
                  </label>
                  <label className="edit-field">
                    计划结束
                    <input
                      type="date"
                      aria-label="计划结束"
                      value={draft.plan?.end ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          plan: {
                            start: draft.plan?.start ?? "",
                            end: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
                {draft.plan && (
                  <button
                    className="text-button"
                    onClick={() => setDraft({ ...draft, plan: undefined })}
                  >
                    清空人工计划
                  </button>
                )}
              </>
            ) : (
              <dl className="date-list">
                <dt>目标日期</dt>
                <dd>{dateLabel(item.due)}</dd>
                <dt>人工计划</dt>
                <dd>
                  {item.plan
                    ? `${dateLabel(item.plan.start)} — ${dateLabel(item.plan.end)}`
                    : "未安排"}
                </dd>
                <dt>预计完成</dt>
                <dd>
                  {item.forecast
                    ? `${dateLabel(item.forecast.start)} — ${dateLabel(item.forecast.end)}`
                    : "未知"}
                  {item.forecast && (
                    <small>
                      {item.forecast.reason} 更新于{" "}
                      {dateLabel(item.forecast.updated)}
                    </small>
                  )}
                </dd>
                <dt>实际关闭</dt>
                <dd>
                  {item.closedAt
                    ? new Date(item.closedAt).toLocaleString("zh-CN")
                    : "尚未关闭"}
                </dd>
              </dl>
            )}
          </section>
          {item.status === "closed" && (
            <p className="history-note">
              {item.closure === "accepted"
                ? "本轮已通过并关闭。"
                : "历史已关闭 · 验收记录未知"}
            </p>
          )}
          {!!item.labels.length && (
            <div className="detail-tags">
              {item.labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {confirm && (
        <section className="detail-confirm" role="alert">
          <strong>
            {confirm === "accept"
              ? `通过并关闭 ${item.id}？`
              : confirm === "discard"
                ? "草稿还没有保存"
                : confirm === "respond"
                  ? `${item.request?.kind === "decision" ? "提交决定" : "确认操作完成"} · ${item.id}`
                  : `要求修改 ${item.id}`}
          </strong>
          <p>
            {confirm === "accept"
              ? item.title
              : confirm === "discard"
                ? pendingExit === "read"
                  ? "放弃草稿将恢复已保存内容。"
                  : "草稿未保存，离开前请选择如何处理。"
                : confirm === "respond"
                  ? `${item.title} · 答复后工单状态保持不变。`
                  : "提交修改意见后，工单返回执行中。"}
          </p>
          {(confirm === "changes" || confirm === "respond") && (
            <textarea
              autoFocus
              aria-label={
                confirm === "changes"
                  ? "修改原因"
                  : item.request?.kind === "decision"
                    ? "决策答复"
                    : "操作结果"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                confirm === "changes"
                  ? "输入修改要求"
                  : item.request?.kind === "decision"
                    ? "输入决定及其依据"
                    : "输入操作结果"
              }
            />
          )}
          <div>
            <button
              className="quiet-button"
              onClick={() => {
                setConfirm(confirm === "discard" ? resumeConfirm : null);
                setPendingExit(null);
                setResumeConfirm(null);
                if (confirm !== "discard") setReason("");
              }}
            >
              {confirm === "discard" ? "继续编辑" : "取消"}
            </button>
            <button
              className="primary-button"
              disabled={
                ((confirm === "changes" || confirm === "respond") &&
                  !reason.trim()) ||
                (confirm === "accept" && blockedNow)
              }
              onClick={() => {
                if (confirm === "accept") {
                  onAccept(item.id);
                  onClose();
                } else if (confirm === "changes") {
                  onRequestChanges(item.id, reason.trim());
                  onClose();
                } else if (confirm === "respond") {
                  onRespond(item.id, reason.trim());
                  setReason("");
                } else {
                  setDraft(item);
                  setEdit(false);
                  setReason("");
                  setError("");
                  if (pendingExit === "close") onClose();
                  else if (pendingExit && pendingExit !== "read")
                    onOpen(pendingExit.id);
                }
                setPendingExit(null);
                setResumeConfirm(null);
                setConfirm(null);
              }}
            >
              {confirm === "accept"
                ? "确认通过"
                : confirm === "changes"
                  ? "提交修改意见"
                  : confirm === "respond"
                    ? "提交答复"
                    : "放弃草稿"}
            </button>
          </div>
        </section>
      )}
      <footer className="detail-actions">
        <div>
          {edit ? (
            <button
              className="primary-button"
              onClick={save}
              disabled={confirm !== null}
            >
              保存
            </button>
          ) : item.request?.kind === "review" && item.status !== "closed" ? (
            <>
              <button
                className="quiet-button"
                disabled={confirm !== null}
                onClick={() => {
                  setReason("");
                  setConfirm("changes");
                }}
              >
                要求修改
              </button>
              <button
                className="primary-button"
                disabled={blockedNow || confirm !== null}
                title={blockedNow ? "工单仍受阻，无法关闭" : ""}
                onClick={() => setConfirm("accept")}
              >
                通过并关闭 <Check size={15} />
              </button>
            </>
          ) : item.request && item.status !== "closed" ? (
            <button
              className="primary-button"
              disabled={confirm !== null}
              onClick={() => {
                setReason("");
                setConfirm("respond");
              }}
            >
              {item.request.kind === "decision" ? "提交决定" : "确认操作完成"}
            </button>
          ) : (
            <button className="quiet-button" onClick={requestClose}>
              返回
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}

export function NewIdea({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, description: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discard, setDiscard] = useState(false);
  const requestClose = () =>
    title || description ? setDiscard(true) : onClose();
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="idea-dialog"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      aria-label="新建工单"
    >
      <div className="section-heading">
        <h2>新建工单</h2>
        <button
          className="icon-button"
          aria-label="关闭新建"
          onClick={requestClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="subtle">初始状态：Idea · 项目：未分配</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onCreate(title.trim(), description);
        }}
      >
        <input
          autoFocus
          aria-label="工单标题"
          placeholder="输入工单标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          aria-label="工单描述"
          placeholder="输入工单描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
        />
        <footer>
          <button className="primary-button" disabled={!title.trim()}>
            创建
          </button>
        </footer>
      </form>
      {discard && (
        <section className="detail-confirm" role="alert">
          <strong>工单尚未创建</strong>
          <p>草稿未保存。</p>
          <div>
            <button className="quiet-button" onClick={() => setDiscard(false)}>
              继续编辑
            </button>
            <button className="quiet-button" onClick={onClose}>
              放弃草稿
            </button>
          </div>
        </section>
      )}
    </dialog>
  );
}
