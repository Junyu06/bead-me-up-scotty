"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { MultiSelectFilter, type FilterOption } from "@/components/multi-select-filter";
import { typeLabel, statusLabel, prioLabel } from "@/lib/beads-view";
import { BEAD_TYPES, BEAD_STATUSES } from "@/lib/schema";
import { type Filters, emptyFilters, toggleStr, toggleNum } from "@/lib/filters";
import { isProjectLabel, projectDisplayName, projectOptionsFrom } from "@/lib/project-labels";
import { ProjectManager } from "@/components/project-manager";
import { useApp } from "@/components/app-context";
import { useProjectGroups } from "@/hooks/use-project-groups";

/**
 * Search + multi-select facet filters, shared by the Board and List views so
 * both expose the same controls (status, type, priority, project, labels,
 * assignee, origin) + archived. Purely presentational: the data-derived
 * options are passed in rather than read from context here.
 */
export function FilterBar({
  filters,
  onChange,
  labelOptions,
  assigneeOptions,
  showArchived,
  onShowArchived,
  onClearAllAction,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  labelOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
  onClearAllAction?: () => void;
}) {
  const { beads, projectId, readOnly } = useApp();
  const { data: projectGroupsData } = useProjectGroups(projectId);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  // Projects share the existing labels query parameter and filter state, but
  // have their own single-select control. Keep the two label facets separate
  // while updating either control so clearing ordinary labels cannot erase the
  // selected project (and vice versa).
  const selectedProjectLabels = filters.labels.filter(isProjectLabel);
  const selectedProject = selectedProjectLabels[0] ?? "";
  const selectedLabels = filters.labels.filter((label) => !isProjectLabel(label));
  const ordinaryLabelOptions = labelOptions.filter((option) => !isProjectLabel(option.value));
  const selectableProjects = React.useMemo(() => {
    const groups = projectGroupsData?.groups ?? [];
    const source = projectOptionsFrom(beads, groups);
    const byValue = new Map<string, FilterOption>();
    for (const option of source) {
      if (isProjectLabel(option.value)) byValue.set(option.value, option);
    }
    // Keep compatibility with callers that pass project options discovered from
    // an independent bead snapshot (and preserve labels created by external AI).
    for (const option of labelOptions) {
      if (isProjectLabel(option.value) && !byValue.has(option.value)) {
        byValue.set(option.value, { ...option, label: projectDisplayName(option.value) });
      }
    }
    // A bookmarked URL may contain a project label no longer present in the
    // current bead-derived options. Keep it visible and human-readable until
    // the user changes the project selection.
    if (selectedProject && !byValue.has(selectedProject)) {
      byValue.set(selectedProject, {
        value: selectedProject,
        label: projectDisplayName(selectedProject),
      });
    }
    return [...byValue.values()];
  }, [beads, labelOptions, projectGroupsData, selectedProject]);

  // Count active filters (each non-empty facet + a non-empty search + archived)
  // so we can offer a one-click reset (bead 3it).
  const active =
    (filters.status.length ? 1 : 0) +
    (filters.type.length ? 1 : 0) +
    (filters.priority.length ? 1 : 0) +
    (filters.origin.length ? 1 : 0) +
    (filters.labels.length ? 1 : 0) +
    (filters.assignee.length ? 1 : 0) +
    (filters.search.trim() ? 1 : 0) +
    (showArchived ? 1 : 0);
  const clearAll = () => {
    if (onClearAllAction) {
      onClearAllAction();
      return;
    }
    onChange(emptyFilters);
    onShowArchived(false);
  };

  return (
    <>
      <div className="flex h-9 min-w-[180px] max-w-[280px] flex-1 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px]">
        <Icon name="search" size={15} className="flex-shrink-0 text-[var(--text-3)]" />
        <input
          data-search
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search beads…  (/)"
          className="w-full border-none bg-transparent text-[13px] text-[var(--text)] outline-none"
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
        <label
          className="flex h-9 flex-shrink-0 items-center gap-[7px] rounded-[9px] border px-[10px] text-[12.5px]"
          style={{
            borderColor: selectedProject ? "var(--brand)" : "var(--border)",
            background: selectedProject ? "var(--brand-weak)" : "var(--surface-2)",
            color: selectedProject ? "var(--brand)" : "var(--text-2)",
          }}
          title="Filter by project"
        >
          <span className="font-medium">Project</span>
          <select
            aria-label="Project"
            value={selectedProject}
            onChange={(e) => {
              const value = e.target.value;
              set({ labels: [...selectedLabels, ...(value ? [value] : [])] });
            }}
            className="max-w-[150px] cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-[var(--text)] outline-none"
          >
            <option value="">All projects</option>
            {selectableProjects.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {!readOnly && <ProjectManager groups={projectGroupsData?.groups} />}
        <MultiSelectFilter
          label="Status"
          options={BEAD_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
          selected={filters.status}
          onToggle={(v) => set({ status: toggleStr(filters.status, v) })}
          onClear={() => set({ status: [] })}
        />
        <MultiSelectFilter
          label="Type"
          options={BEAD_TYPES.filter((t) => t !== "epic").map((t) => ({ value: t, label: typeLabel(t) }))}
          selected={filters.type}
          onToggle={(v) => set({ type: toggleStr(filters.type, v) })}
          onClear={() => set({ type: [] })}
        />
        <MultiSelectFilter
          label="Priority"
          options={[0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: prioLabel(p) }))}
          selected={filters.priority.map(String)}
          onToggle={(v) => set({ priority: toggleNum(filters.priority, Number(v)) })}
          onClear={() => set({ priority: [] })}
        />
        {(ordinaryLabelOptions.length > 0 || selectedLabels.length > 0) && (
          <MultiSelectFilter
            label="Labels"
            options={ordinaryLabelOptions}
            selected={selectedLabels}
            onToggle={(v) => set({ labels: [...toggleStr(selectedLabels, v), ...selectedProjectLabels] })}
            onClear={() => set({ labels: selectedProjectLabels })}
          />
        )}
        {assigneeOptions.length > 0 && (
          <MultiSelectFilter
            label="Assignee"
            options={assigneeOptions}
            selected={filters.assignee}
            onToggle={(v) => set({ assignee: toggleStr(filters.assignee, v) })}
            onClear={() => set({ assignee: [] })}
          />
        )}
        <MultiSelectFilter
          label="Origin"
          options={[
            { value: "human", label: "Human" },
            { value: "agent", label: "Agent" },
          ]}
          selected={filters.origin}
          onToggle={(v) => set({ origin: toggleStr(filters.origin, v) })}
          onClear={() => set({ origin: [] })}
        />
        <button
          onClick={() => onShowArchived(!showArchived)}
          title="Toggle archived"
          className="flex h-9 items-center gap-[6px] rounded-[9px] px-[11px] text-[12.5px] font-medium"
          style={{
            border: `1px solid ${showArchived ? "var(--brand)" : "var(--border)"}`,
            background: showArchived ? "var(--brand-weak)" : "var(--surface-2)",
            color: showArchived ? "var(--brand)" : "var(--text-2)",
          }}
        >
          <Icon name="archive" size={14} />
          <span>Archived</span>
        </button>
        {active > 0 && (
          <button
            onClick={clearAll}
            title="Clear all filters"
            className="flex h-9 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] text-[12.5px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
          >
            <Icon name="x" size={14} />
            <span>Clear · {active}</span>
          </button>
        )}
      </div>
    </>
  );
}
