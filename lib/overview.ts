import type { Bead } from "./schema";

export const ARCHIVED_LABEL = "archived";

export type OverviewProgress = {
  closed: number;
  total: number;
  pct: number;
};

export type OverviewRow = {
  bead: Bead;
  children: Bead[];
  progress: OverviewProgress;
};

export type OverviewFilters = {
  showClosed?: boolean;
  showArchived?: boolean;
};

function isArchived(bead: Bead): boolean {
  return (bead.labels ?? []).includes(ARCHIVED_LABEL);
}

function byDisplayOrder(a: Bead, b: Bead): number {
  return (
    Number(a.status === "closed") - Number(b.status === "closed") ||
    Number(a.issue_type !== "epic") - Number(b.issue_type !== "epic") ||
    a.priority - b.priority ||
    a.id.localeCompare(b.id)
  );
}

/** Keep a checklist in its authored order, including completed steps. */
function byChildOrder(a: Bead, b: Bead): number {
  const aStep = a.title.match(/^\s*(\d+)\.\s/);
  const bStep = b.title.match(/^\s*(\d+)\.\s/);
  if (aStep && bStep) {
    const difference = Number(aStep[1]) - Number(bStep[1]);
    if (difference) return difference;
  }
  return (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
}

/**
 * Build direct parent-child relationships from the dependency records emitted
 * by bd. A bead's dotted id or optional `parent` field is deliberately not
 * consulted: the relation edge is the source of truth for hierarchy.
 */
export function overviewChildrenMap(beads: Bead[]): Map<string, Bead[]> {
  const knownIds = new Set(beads.map((bead) => bead.id));
  const children = new Map<string, Bead[]>();

  for (const bead of beads) {
    const parentIds = new Set(
      (bead.dependencies ?? [])
        .filter((dependency) => dependency.type === "parent-child")
        .map((dependency) => dependency.depends_on_id)
        .filter((parentId) => knownIds.has(parentId)),
    );
    for (const parentId of parentIds) {
      const siblings = children.get(parentId);
      if (siblings) siblings.push(bead);
      else children.set(parentId, [bead]);
    }
  }

  for (const siblings of children.values()) siblings.sort(byChildOrder);
  return children;
}

export function overviewProgress(children: Bead[]): OverviewProgress {
  const total = children.length;
  const closed = children.filter((child) => child.status === "closed").length;
  return { closed, total, pct: total ? Math.round((closed / total) * 100) : 0 };
}

function visible(bead: Bead, filters: Required<OverviewFilters>): boolean {
  // Archived is an explicit history view. Once enabled it includes archived
  // rows even when the archive operation also closed them; otherwise the
  // separate Show archived control could appear to do nothing.
  if (isArchived(bead)) return filters.showArchived;
  return filters.showClosed || bead.status !== "closed";
}

/**
 * Return the active top-level workstreams and independent beads for Overview.
 * Progress is calculated from every direct child, including hidden closed or
 * archived children, so the displayed completed/total count remains truthful.
 */
export function overviewRows(beads: Bead[], filters: OverviewFilters = {}): OverviewRow[] {
  const normalized = { showClosed: false, showArchived: false, ...filters };
  const children = overviewChildrenMap(beads);
  const childIds = new Set<string>();
  for (const siblings of children.values()) {
    for (const child of siblings) childIds.add(child.id);
  }

  return beads
    .filter((bead) => !childIds.has(bead.id) && visible(bead, normalized))
    .sort(byDisplayOrder)
    .map((bead) => {
      const directChildren = children.get(bead.id) ?? [];
      return { bead, children: directChildren, progress: overviewProgress(directChildren) };
    });
}

export function visibleOverviewChildren(
  children: Bead[],
  filters: OverviewFilters = {},
): Bead[] {
  const normalized = { showClosed: false, showArchived: false, ...filters };
  return children.filter((bead) => visible(bead, normalized));
}
