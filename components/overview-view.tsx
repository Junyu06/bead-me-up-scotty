"use client";

import * as React from "react";
import { Icon, typeIconName } from "@/components/icons";
import { OriginBadge, PriorityChip } from "@/components/board/bead-card";
import { useApp } from "@/components/app-context";
import { beadOrigin, originTitle } from "@/lib/attribution";
import type { Bead } from "@/lib/schema";
import {
  catColor,
  statusLabel,
  typeLabel,
} from "@/lib/beads-view";
import {
  overviewChildrenMap,
  overviewProgress,
  overviewRows,
  visibleOverviewChildren,
  type OverviewProgress,
} from "@/lib/overview";

const labelChipClass =
  "hidden flex-shrink-0 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-[10.5px] text-[var(--text-3)] lg:inline";

function LabelChips({ labels, max }: { labels: string[]; max: number }) {
  const visible = labels.filter((label) => label !== "archived");
  const shown = visible.slice(0, max);
  const hidden = visible.slice(max);
  return (
    <>
      {shown.map((label) => (
        <span key={label} className={labelChipClass}>
          {label}
        </span>
      ))}
      {hidden.length > 0 && (
        <span className={labelChipClass} title={hidden.join(", ")}>
          +{hidden.length}
        </span>
      )}
    </>
  );
}

export function OverviewView() {
  const { beads, humanAllowlist, openCreate, openDetail, readOnly, selectedBeadId, selectBead } = useApp();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [showClosed, setShowClosed] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  const childrenByParent = React.useMemo(() => overviewChildrenMap(beads), [beads]);
  const rows = React.useMemo(
    () => overviewRows(beads, { showClosed, showArchived }),
    [beads, showArchived, showClosed],
  );
  const workstreamCount = rows.filter(({ bead }) => bead.issue_type === "epic").length;
  const independentCount = rows.length - workstreamCount;

  const toggleExpanded = React.useCallback((id: string) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Overview</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {rows.length} top-level {rows.length === 1 ? "item" : "items"} · {workstreamCount} workstreams · {independentCount} independent
          </span>
        </div>
        <button
          onClick={() => setShowClosed((current) => !current)}
          title={showClosed ? "Closed items are shown" : "Closed items are hidden"}
          className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
        >
          <Icon name={showClosed ? "check" : "x"} size={14} />
          <span>{showClosed ? "Hide closed" : "Show closed"}</span>
        </button>
        <button
          onClick={() => setShowArchived((current) => !current)}
          title={showArchived ? "Archived items are shown" : "Archived items are hidden"}
          className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
        >
          <Icon name="archive" size={14} />
          <span>{showArchived ? "Hide archived" : "Show archived"}</span>
        </button>
        {!readOnly && (
          <button
            onClick={() => openCreate()}
            className="flex h-9 items-center gap-[6px] rounded-[9px] px-[14px] text-[13px] font-[550] text-white"
            style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
          >
            <Icon name="plus" size={15} />
            <span>New</span>
          </button>
        )}
      </header>

      <div className="bd-scroll min-h-0 flex-1 overflow-y-auto p-[20px_22px]">
        <div className="mx-auto flex max-w-[980px] flex-col gap-[12px]">
          {rows.map(({ bead, progress }) => (
            <OverviewItem
              key={bead.id}
              bead={bead}
              progress={progress}
              depth={0}
              path={new Set()}
              childrenByParent={childrenByParent}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              showClosed={showClosed}
              showArchived={showArchived}
              humanAllowlist={humanAllowlist}
              openCreate={openCreate}
              openDetail={openDetail}
              readOnly={readOnly}
              selectedBeadId={selectedBeadId}
              selectBead={selectBead}
            />
          ))}
          {rows.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-border p-10 text-center text-[13px] text-[var(--text-3)]">
              No active top-level items. Closed and archived items are hidden by default.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewItem({
  bead,
  progress,
  depth,
  path,
  childrenByParent,
  expanded,
  toggleExpanded,
  showClosed,
  showArchived,
  humanAllowlist,
  openCreate,
  openDetail,
  readOnly,
  selectedBeadId,
  selectBead,
}: {
  bead: Bead;
  progress: OverviewProgress;
  depth: number;
  path: Set<string>;
  childrenByParent: Map<string, Bead[]>;
  expanded: Record<string, boolean>;
  toggleExpanded: (id: string) => void;
  showClosed: boolean;
  showArchived: boolean;
  humanAllowlist: string[];
  openCreate: (opts?: { parent?: string }) => void;
  openDetail: (id: string) => void;
  readOnly: boolean;
  selectedBeadId: string | null;
  selectBead: (id: string | null) => void;
}) {
  const directChildren = childrenByParent.get(bead.id) ?? [];
  // Once a workstream is expanded, closed steps stay visible so the user can
  // inspect what is already complete. Top-level closed rows remain hidden by
  // the Overview filter; archived children still require an explicit toggle.
  const visibleChildren = visibleOverviewChildren(directChildren, { showClosed: true, showArchived });
  const canExpand = directChildren.length > 0 || bead.issue_type === "epic";
  const isOpen = canExpand && (expanded[bead.id] ?? false);
  const isCyclic = path.has(bead.id);
  const nextPath = new Set(path);
  nextPath.add(bead.id);
  const origin = beadOrigin(bead, humanAllowlist);
  const labels = (bead.labels ?? []).filter((label) => label !== "archived");

  return (
    <article
      data-overview-item-id={bead.id}
      className={`overflow-hidden rounded-[14px] border border-border bg-[var(--surface)] shadow-[var(--shadow)] ${depth > 0 ? "ml-4" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        data-keyboard-bead-id={bead.id}
        aria-current={selectedBeadId === bead.id ? "true" : undefined}
        aria-expanded={canExpand ? isOpen : undefined}
        onFocus={() => selectBead(bead.id)}
        onClick={() => (canExpand ? toggleExpanded(bead.id) : openDetail(bead.id))}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (canExpand) toggleExpanded(bead.id);
            else openDetail(bead.id);
          }
        }}
        title={canExpand ? (isOpen ? "Hide subtasks" : "Show subtasks") : `Open details for ${bead.id}`}
        className={`flex cursor-pointer items-center gap-[13px] p-[14px_16px] focus-visible:outline-none ${
          selectedBeadId === bead.id ? "ring-2 ring-inset ring-[var(--brand)]" : ""
        }`}
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <Icon name={bead.issue_type === "epic" ? "target" : typeIconName(bead.issue_type)} size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-[8px] overflow-hidden">
            <span className="flex-shrink-0 font-mono text-[11.5px] text-[var(--text-3)]">{bead.id}</span>
            <StatusChip status={bead.status} />
            <PriorityChip p={bead.priority} />
            <span className="hidden flex-shrink-0 text-[11px] text-[var(--text-3)] sm:inline">
              {bead.issue_type === "epic" ? "Workstream" : typeLabel(bead.issue_type)}
            </span>
            <LabelChips labels={labels} max={2} />
          </div>
          <div
            className={`mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold tracking-[-.01em] ${
              bead.status === "closed" ? "text-[var(--text-3)] line-through decoration-[var(--text-3)]" : ""
            }`}
          >
            {bead.title}
          </div>
        </div>
        {progress.total > 0 && (
          <div className="hidden w-[180px] flex-shrink-0 flex-col items-end gap-[6px] sm:flex">
            <div className="flex items-baseline gap-[6px]">
              <span className="font-mono text-[16px] font-[650] tracking-[-.02em]">{progress.pct}%</span>
              <span className="text-[11.5px] text-[var(--text-3)]">
                {progress.closed}/{progress.total} done
              </span>
            </div>
            <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${progress.pct}%`,
                  background: progress.pct === 100 ? "#16a34a" : "var(--brand)",
                }}
              />
            </div>
          </div>
        )}
        <OriginBadge origin={origin} title={originTitle(bead.created_by, origin)} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(bead.id);
          }}
          aria-label={`Open details for ${bead.id}`}
          title={`Open details for ${bead.id}`}
          className="flex h-7 flex-shrink-0 items-center gap-[5px] rounded-[8px] border border-border bg-[var(--surface-2)] px-[9px] text-[11.5px] font-[550] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        >
          <Icon name="list" size={12} className="flex-shrink-0" />
          <span>Details</span>
        </button>
        {canExpand && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(bead.id);
            }}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
          >
            <Icon
              name="chevron"
              size={18}
              className="transition-transform"
              style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-border bg-[var(--surface-2)] p-[7px]">
          {directChildren.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-[var(--text-3)]">No steps yet.</div>
          )}
          {progress.total > 0 && visibleChildren.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-[var(--text-3)]">
              All subtasks are currently hidden by the active filters.
            </div>
          )}
          {visibleChildren.map((child) =>
            isCyclic || nextPath.has(child.id) ? null : (
              <OverviewItem
                key={child.id}
                bead={child}
                progress={overviewProgress(childrenByParent.get(child.id) ?? [])}
                depth={depth + 1}
                path={nextPath}
                childrenByParent={childrenByParent}
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                showClosed={showClosed}
                showArchived={showArchived}
                humanAllowlist={humanAllowlist}
                openCreate={openCreate}
                openDetail={openDetail}
                readOnly={readOnly}
                selectedBeadId={selectedBeadId}
                selectBead={selectBead}
              />
            ),
          )}
          {!readOnly && (
            <button
              disabled={isCyclic}
              onClick={() => openCreate({ parent: bead.id })}
              className="m-[3px] flex w-[calc(100%-6px)] items-center gap-[7px] rounded-[9px] p-[9px_12px] text-[12.5px] font-[550] text-[var(--brand)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="plus" size={14} />
              <span>Add subtask</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = catColor(status);
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-full px-2 py-px text-[10.5px] font-semibold tracking-[.01em]"
      style={{ color, background: `${color}1c`, border: `1px solid ${color}33` }}
    >
      {statusLabel(status)}
    </span>
  );
}
