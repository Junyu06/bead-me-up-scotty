"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useUrlState } from "@/hooks/use-url-state";
import {
  useCreateProjectGroup,
  useDeleteProjectGroup,
  useProjectGroups,
  useRenameProjectGroup,
} from "@/hooks/use-project-groups";
import type { ProjectGroup } from "@/lib/project-group-types";

const inputClass =
  "h-9 min-w-0 rounded-[8px] border border-border bg-[var(--surface-2)] px-2.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]";

function messageFor(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Project update failed";
}

/**
 * Small project-directory editor shown beside the Project filter. The directory
 * owns names and membership labels; beads remain the source of task counts and
 * still provide a fallback for labels created by an external AI.
 */
export function ProjectManager({ groups: suppliedGroups }: { groups?: ProjectGroup[] } = {}) {
  const { beads, projectId, readOnly } = useApp();
  const { data, isLoading, error: groupsError, refetch } = useProjectGroups(projectId);
  const create = useCreateProjectGroup(projectId);
  const rename = useRenameProjectGroup(projectId);
  const remove = useDeleteProjectGroup(projectId);
  const { updateUrl } = useUrlState();

  const groups = React.useMemo(
    () => data?.groups ?? suppliedGroups ?? [],
    [data?.groups, suppliedGroups],
  );
  // Bead writes invalidate the beads query independently of the directory, so
  // derive counts from the current bead snapshot while the dialog is open.
  const groupsForDisplay = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const bead of beads) {
      for (const label of bead.labels ?? []) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return groups.map((group) => ({ ...group, count: counts.get(group.label) ?? 0 }));
  }, [beads, groups]);
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [editingLabel, setEditingLabel] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const busy = create.isPending || rename.isPending || remove.isPending;

  const openManager = React.useCallback(() => {
    setOpen(true);
    // Refresh on demand so new task labels written by an external AI are
    // discovered and task counts reflect the latest bead list without polling.
    void refetch();
  }, [refetch]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setNewName("");
    setEditingLabel(null);
    setConfirmDelete(null);
    setError(null);
  };

  const onOpenChange = (next: boolean) => {
    if (next) openManager();
    else close();
  };

  const reportError = (cause: unknown) => {
    const message = messageFor(cause);
    setError(message);
    toast.error(message);
  };

  const updateProjectFilter = React.useCallback(
    (oldLabel: string, nextLabel?: string) => {
      updateUrl(
        (params) => {
          const labels = params.getAll("label");
          if (!labels.includes(oldLabel)) return;
          params.delete("label");
          for (const label of labels) {
            if (label !== oldLabel) params.append("label", label);
            else if (nextLabel) params.append("label", nextLabel);
          }
        },
        "replace",
      );
    },
    [updateUrl],
  );

  async function addProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setError(null);
    try {
      await create.mutateAsync({ name });
      setNewName("");
      toast.success("Project added");
    } catch (cause) {
      reportError(cause);
    }
  }

  function beginRename(group: ProjectGroup) {
    setError(null);
    setConfirmDelete(null);
    setEditingLabel(group.label);
    setEditingName(group.name);
  }

  function cancelRename() {
    if (rename.isPending) return;
    setEditingLabel(null);
    setEditingName("");
  }

  async function saveRename(group: ProjectGroup) {
    const name = editingName.trim();
    if (!name || busy) return;
    setError(null);
    try {
      const result = await rename.mutateAsync({ label: group.label, name });
      updateProjectFilter(group.label, result.group.label);
      setEditingLabel(null);
      setEditingName("");
      toast.success("Project renamed");
    } catch (cause) {
      reportError(cause);
    }
  }

  function beginDelete(group: ProjectGroup) {
    setError(null);
    setEditingLabel(null);
    setConfirmDelete(group.label);
  }

  function cancelDelete() {
    if (remove.isPending) return;
    setConfirmDelete(null);
  }

  async function deleteProject(group: ProjectGroup) {
    if (busy) return;
    setError(null);
    try {
      await remove.mutateAsync({ label: group.label });
      // Removing the directory entry also removes its membership labels. If the
      // user was looking at that project, keep every other URL filter intact.
      updateProjectFilter(group.label);
      setConfirmDelete(null);
      toast.success("Project deleted; tasks kept as unclassified");
    } catch (cause) {
      reportError(cause);
    }
  }

  if (readOnly) return null;

  return (
    <>
      <button
        type="button"
        onClick={openManager}
        className="flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        aria-label="Manage projects"
        title="Manage projects"
      >
        <Icon name="pencil" size={13} />
        <span>Manage projects</span>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-[540px]"
        >
          <div className="shrink-0 border-b border-border p-[18px_20px_15px]">
            <DialogTitle className="text-[15px] font-[650]">Manage projects</DialogTitle>
            <DialogDescription className="mt-1 text-[12px] text-[var(--text-3)]">
              Add, rename, or remove project categories.
            </DialogDescription>
          </div>

          <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-5">
            <form onSubmit={addProject} className="flex items-center gap-2">
              <input
                aria-label="New project name"
                className={`${inputClass} flex-1`}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New project name"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={!newName.trim() || busy}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                <Icon name="plus" size={13} />
                Add
              </button>
            </form>

            {groupsError && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {messageFor(groupsError)}
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {isLoading && groupsForDisplay.length === 0 ? (
                <p className="py-5 text-center text-[12.5px] text-[var(--text-3)]">Loading projects…</p>
              ) : groupsForDisplay.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-[12.5px] text-[var(--text-3)]">
                  No projects yet. Add one above.
                </p>
              ) : (
                groupsForDisplay.map((group) => (
                  <div key={group.label} className="rounded-lg border border-border bg-[var(--surface-2)] p-3">
                    {editingLabel === group.label ? (
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Rename ${group.name}`}
                          className={`${inputClass} flex-1 bg-[var(--surface)]`}
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          autoFocus
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => void saveRename(group)}
                          disabled={!editingName.trim() || busy}
                          className="rounded-[7px] bg-[var(--brand)] px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          disabled={rename.isPending}
                          className="rounded-[7px] border border-border px-2.5 py-1.5 text-[11.5px] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-[600] text-[var(--text)]">{group.name}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                            {group.count} {group.count === 1 ? "task" : "tasks"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => beginRename(group)}
                          disabled={busy}
                          className="rounded-[7px] p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-50"
                          aria-label={`Rename ${group.name}`}
                          title="Rename project"
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => beginDelete(group)}
                          disabled={busy}
                          className="rounded-[7px] p-1.5 text-[var(--text-3)] hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                          aria-label={`Delete ${group.name}`}
                          title="Delete project"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    )}

                    {confirmDelete === group.label && (
                      <div className="mt-3 rounded-md border border-red-500/25 bg-red-500/5 p-2.5">
                        <p className="text-[11.5px] leading-[1.45] text-[var(--text-2)]">
                          Delete <span className="font-semibold text-[var(--text)]">{group.name}</span>? Its tasks will stay in Beads and become unclassified.
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelDelete}
                            disabled={remove.isPending}
                            className="rounded-[7px] border border-border px-2.5 py-1.5 text-[11.5px] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                          >
                            Keep project
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteProject(group)}
                            disabled={remove.isPending}
                            className="rounded-[7px] bg-red-500 px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
                          >
                            {remove.isPending ? "Deleting…" : "Delete project"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
