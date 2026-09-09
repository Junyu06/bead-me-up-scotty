"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useCreateBead, beadsKey } from "@/hooks/use-beads";
import { useCreateProjectGroup, useProjectGroups } from "@/hooks/use-project-groups";
import { useImageDrop } from "@/hooks/use-image-drop";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { DescriptionContent, hasImageRef } from "@/components/description-content";
import { api } from "@/lib/api-client";
import { typeLabel } from "@/lib/beads-view";
import { BEAD_TYPES, type BeadType } from "@/lib/schema";
import { isProjectLabel, projectLabel, projectOptionsFrom } from "@/lib/project-labels";
import { useUrlState } from "@/hooks/use-url-state";

const inputClass =
  "h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-3 text-[13.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";
const selectClass =
  "h-[38px] cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[13px] text-[var(--text)] outline-none";
const labelClass = "text-[12px] font-[550] text-[var(--text-2)]";

interface FormState {
  type: BeadType;
  priority: number;
  title: string;
  description: string;
  assignee: string;
  parent: string;
  labels: string;
  backlog: boolean;
}

export function CreateBeadModal({
  open,
  parent,
  type,
  onOpenChange,
}: {
  open: boolean;
  parent: string;
  /** Preselected issue type, e.g. "epic" from the Epics screen. A default, not a lock. */
  type?: BeadType;
  onOpenChange: (o: boolean) => void;
}) {
  // Keep quick capture compact; additional fields are available on demand.
  const { width, startResize } = useResizableWidth({
    storageKey: "bmus.width.quick-create",
    defaultWidth: 560,
    min: 360,
    max: 1200,
    deltaFactor: 2,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ width, maxWidth: "96vw" }}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
      >
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-ew-resize hover:bg-[var(--brand)]/40"
        />
        {/* Conditionally mounted, so the form remounts on every open and the
            preset below is picked up fresh — no useEffect sync needed. */}
        {open && (
          <CreateForm parent={parent} type={type} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  parent,
  type: presetType,
  onClose,
}: {
  parent: string;
  type?: BeadType;
  onClose: () => void;
}) {
  const { beads, meta, projectId } = useApp();
  const create = useCreateBead();
  const { data: projectGroupsData } = useProjectGroups(projectId);
  const createProject = useCreateProjectGroup(projectId);
  const qc = useQueryClient();
  const actor = meta?.humanActor ?? "you";
  const isDemo = meta?.kind === "demo";

  const [form, setForm] = React.useState<FormState>({
    type: presetType ?? "task",
    priority: 2,
    title: "",
    description: "",
    assignee: "",
    parent,
    labels: "",
    backlog: true,
  });

  const { searchParams } = useUrlState();
  const projects = React.useMemo(
    () => projectOptionsFrom(beads, projectGroupsData?.groups ?? []),
    [beads, projectGroupsData],
  );
  const [selectedProject, setSelectedProject] = React.useState(() => {
    const inherited = beads.find((b) => b.id === parent)?.labels.find(isProjectLabel);
    const filtered = searchParams.getAll("label").filter(isProjectLabel);
    return inherited ?? (filtered.length === 1 ? filtered[0] : "");
  });
  const [newProjectName, setNewProjectName] = React.useState("");
  const selectedProjectLabel = selectedProject === "__new__"
    ? projectLabel(newProjectName) : selectedProject;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const submitLock = React.useRef(false);

  // Display text for the parent picker. Seeded from an incoming preset (e.g.
  // "Add subtask" / "Add child to this epic") so the field shows what it holds.
  const parentListId = `parents-${React.useId()}`;
  const [parentDraft, setParentDraft] = React.useState(() => {
    if (!parent) return "";
    const b = beads.find((x) => x.id === parent);
    return b ? `${b.id} · ${b.title}` : parent;
  });

  // Resolve type-preset (gh-16) and parent into ONE title rather than nested
  // ternaries, so the two features compose: "New epic", "New child bug", etc.
  const dialogTitle = presetType
    ? `New ${form.parent ? "child " : ""}${typeLabel(presetType).toLowerCase()}`
    : form.parent
      ? "New child bead"
      : "New idea";

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Images dropped before the bead exists go to a draft folder; on create we
  // rename that folder to the real id and rewrite the refs in the description.
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uid = React.useId();
  const draftId = React.useMemo(() => "draft-" + uid.replace(/[^a-zA-Z0-9]/g, ""), [uid]);

  // Auto-grow a textarea to fit its content (used by the title field).
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const drop = useImageDrop({
    projectId,
    beadId: draftId,
    disabled: isDemo,
    disabledMessage: "Attachments aren't available for the Demo project.",
    textareaRef: taRef,
    value: form.description,
    onChange: (v) => set("description", v),
  });

  // Any open bead can parent another (bd allows it and createInputSchema/
  // `bd create --parent` already accept any id) — epics first, since
  // epic-as-parent stays the common case and must not get harder to reach.
  const parentOptions = React.useMemo(
    () =>
      beads
        .filter((b) => b.status !== "closed")
        .sort(
          (a, b) =>
            Number(a.issue_type !== "epic") - Number(b.issue_type !== "epic") ||
            a.priority - b.priority ||
            a.id.localeCompare(b.id),
        ),
    [beads],
  );
  const assignees = Array.from(
    new Set([actor, ...(beads.map((b) => b.assignee).filter(Boolean) as string[])]),
  );

  async function submit() {
    if (
      !form.title.trim() ||
      isSubmitting ||
      submitLock.current ||
      create.isPending ||
      createProject.isPending
    ) return;
    if (selectedProject === "__new__" && !newProjectName.trim()) {
      setSubmitError("Enter a project name or choose No project.");
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Register a new directory entry first. Once it exists, keep the returned
      // label selected so a failed bead write can be retried without trying to
      // create the same project again.
      let projectLabelForBead = selectedProjectLabel;
      if (selectedProject === "__new__") {
        const { group } = await createProject.mutateAsync({ name: newProjectName.trim() });
        projectLabelForBead = group.label;
        setSelectedProject(group.label);
        setNewProjectName("");
      }

      const newBead = await create.mutateAsync({
        title: form.title.trim(),
        issue_type: form.type,
        priority: form.priority,
        description: form.description,
        assignee: form.assignee,
        labels: [...new Set([
          ...form.labels.split(",").map((s) => s.trim()).filter((s) => s && !isProjectLabel(s)),
          ...(projectLabelForBead ? [projectLabelForBead] : []),
        ])],
        parent: form.parent,
        backlog: form.backlog,
      });

      if (form.description.includes(`attachment://${draftId}/`)) {
        try {
          await api.attachments.finalize(projectId, draftId, newBead.id);
          const rewritten = form.description.replaceAll(
            `attachment://${draftId}/`,
            `attachment://${newBead.id}/`,
          );
          await api.update(projectId, newBead.id, { description: rewritten });
          qc.invalidateQueries({ queryKey: beadsKey(projectId) });
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
      onClose();
    } catch (cause) {
      setSubmitError(
        cause instanceof Error && cause.message ? cause.message : "Could not save idea",
      );
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  // Cmd/Ctrl+Enter creates the bead from anywhere in the modal. A ref keeps the
  // listener pointed at the latest closure without re-binding on every keystroke.
  const submitRef = React.useRef(submit);
  React.useEffect(() => {
    submitRef.current = submit;
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-[10px] border-b border-border p-[17px_20px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <Icon name="plus" size={16} />
        </div>
        <div className="flex-1">
          <DialogTitle className="text-[15px] font-[650]">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[var(--text-3)]">
            Add details whenever you’re ready.
          </DialogDescription>
        </div>
        <button
          onClick={onClose}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-5">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Project</span>
          <select
            className={selectClass}
            value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); setSubmitError(null); }}
          >
            <option value="">No project</option>
            {projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            <option value="__new__">New project…</option>
          </select>
        </label>
        {selectedProject === "__new__" && (
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Project name</span>
            <input autoFocus className={inputClass} value={newProjectName}
              onChange={(e) => { setNewProjectName(e.target.value); setSubmitError(null); }} placeholder="Project name" />
          </label>
        )}
        {submitError && (
          <p className="-mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {submitError}
          </p>
        )}

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Title</span>
          <textarea
            autoFocus
            ref={autosize}
            rows={1}
            className={`${inputClass} h-auto min-h-[38px] resize-none overflow-hidden py-[9px] leading-[1.4]`}
            value={form.title}
            onChange={(e) => {
              set("title", e.target.value);
              setSubmitError(null);
              autosize(e.currentTarget);
            }}
            placeholder="What needs doing?"
            onKeyDown={(e) => {
              // Enter submits (titles are single-line); the box still grows as text wraps.
              // Cmd/Ctrl+Enter is owned by the modal-wide listener — skip it here so it
              // doesn't submit twice.
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>

        <details className="group rounded-[9px] border border-border">
          <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-medium text-[var(--text-2)]">
            More options
          </summary>
          <div className="flex flex-col gap-[14px] px-3 pb-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-[6px]">
                <span className={labelClass}>Type</span>
                <select className={selectClass} value={form.type} onChange={(e) => set("type", e.target.value as BeadType)}>
                  {BEAD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className={labelClass}>Priority</span>
                <select
                  className={selectClass}
                  value={String(form.priority)}
                  onChange={(e) => set("priority", Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((p) => (
                    <option key={p} value={String(p)}>
                      {p} · {["Critical", "High", "Medium", "Low", "Backlog"][p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-[6px]">
              <span className={labelClass}>
                Description{" "}
                {!isDemo && (
                  <span className="font-normal text-[var(--text-3)]">· drop or paste images</span>
                )}
              </span>
              <div
                className="relative"
                onDrop={drop.onDrop}
                onDragOver={drop.onDragOver}
                onDragLeave={drop.onDragLeave}
              >
                <textarea
                  ref={taRef}
                  className={`${inputClass} h-auto w-full resize-y py-[10px] leading-[1.5] ${
                    drop.dragOver ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : ""
                  }`}
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  onPaste={drop.onPaste}
                  placeholder={
                    isDemo
                      ? "Optional details, acceptance criteria…"
                      : "Optional details, acceptance criteria… drag and drop screenshots and images here too!"
                  }
                />
                {drop.uploading && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
                    <Icon name="image" size={12} /> Uploading…
                  </span>
                )}
              </div>
              {!isDemo && (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={drop.pickFiles}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-[6px] rounded-[8px] border border-border bg-[var(--surface-2)] px-[10px] py-[6px] text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                  >
                    <Icon name="image" size={14} /> Attach image
                  </button>
                </div>
              )}
              {hasImageRef(form.description) && (
                <DescriptionContent
                  text={form.description}
                  projectId={projectId}
                  className="mt-1 rounded-[8px] border border-border bg-[var(--surface-2)] p-2 text-[12.5px] text-[var(--text-2)]"
                />
              )}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-[6px]">
                <span className={labelClass}>Assignee</span>
                <select className={selectClass} value={form.assignee} onChange={(e) => set("assignee", e.target.value)}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className={labelClass}>Parent</span>
                {/* A datalist-backed input rather than a bare <select>: the option
                    list is now every open bead, which is far too long to scan. The
                    visible text is "<id> · <title> (<type>)" and the id is parsed
                    back out on change, so similar titles stay distinguishable. */}
                <input
                  list={parentListId}
                  value={parentDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setParentDraft(v);
                    const id = v.split(" · ")[0].trim();
                    set("parent", parentOptions.some((b) => b.id === id) ? id : "");
                  }}
                  placeholder="No parent — type to search…"
                  className={`${selectClass} cursor-text`}
                />
                <datalist id={parentListId}>
                  {parentOptions.map((b) => (
                    <option key={b.id} value={`${b.id} · ${b.title}`}>
                      {typeLabel(b.issue_type)}
                    </option>
                  ))}
                </datalist>
              </label>
            </div>

            <label className="flex flex-col gap-[6px]">
              <span className={labelClass}>
                Labels <span className="font-normal text-[var(--text-3)]">· comma separated</span>
              </span>
              <input
                className={`${inputClass} font-mono`}
                value={form.labels}
                onChange={(e) => set("labels", e.target.value)}
                placeholder="ui, dnd, m3"
              />
            </label>

            <label className="flex cursor-pointer select-none items-center gap-[9px]">
              <input
                type="checkbox"
                checked={form.backlog}
                onChange={(e) => set("backlog", e.target.checked)}
                className="h-4 w-4 cursor-pointer"
                style={{ accentColor: "var(--brand)" }}
              />
              <span className="text-[13px] text-[var(--text-2)]">
                Save to Backlog
              </span>
            </label>
          </div>
        </details>
      </div>

      <div className="flex shrink-0 items-center gap-[10px] border-t border-border p-[15px_20px]">
        <div className="flex flex-1 items-center gap-[7px] text-[11.5px] text-[var(--text-3)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
          <span>{form.backlog ? "Backlog" : "Ready"}</span>
        </div>
        <button
          onClick={onClose}
          className="h-[38px] rounded-[9px] border border-border bg-[var(--surface-2)] px-4 text-[13px] font-[550] text-[var(--text)] hover:bg-[var(--surface-3)]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={
            !form.title.trim() ||
            (selectedProject === "__new__" && !selectedProjectLabel) ||
            isSubmitting ||
            create.isPending ||
            createProject.isPending
          }
          className="flex h-[38px] items-center gap-[7px] rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
        >
          <Icon name="check" size={15} />
          <span>Save idea</span>
        </button>
      </div>
    </>
  );
}
