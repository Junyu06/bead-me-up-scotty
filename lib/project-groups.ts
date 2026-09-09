import "server-only";

import {
  ConfigError,
  getProjectGroups as getSavedProjectGroups,
  setProjectGroups,
} from "./config";
import type { Bead } from "./schema";
import type { BeadsStore } from "./store";
import {
  DEFAULT_PROJECT_GROUPS,
  type ProjectGroup,
  type ProjectGroupEntry,
} from "./project-group-types";
import { isProjectLabel, projectDisplayName, projectLabel } from "./project-labels";

export interface ProjectGroupMutation {
  group: ProjectGroup;
  updated: number;
}

interface LoadedGroups {
  beads: Bead[];
  groups: ProjectGroupEntry[];
}

// The bd store serializes commands per workspace, but the catalog's
// load/check/set sequence also needs a small per-workspace queue. This keeps
// concurrent create/rename/delete requests from validating against the same
// stale catalog and then overwriting one another.
const mutationQueues = new Map<string, Promise<unknown>>();

function serializeMutation<T>(workspaceId: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(workspaceId) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const marker = next.then(() => undefined, () => undefined);
  mutationQueues.set(workspaceId, marker);
  void marker.then(() => {
    if (mutationQueues.get(workspaceId) === marker) mutationQueues.delete(workspaceId);
  });
  return next;
}

function copyEntries(entries: ProjectGroupEntry[]): ProjectGroupEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

/**
 * Return the app catalog for a workspace and add any project labels that an
 * external bd/AI writer has already put on beads. The exact label remains the
 * identity: two differently-spelled labels are kept as two projects instead
 * of being silently merged.
 */
function catalogFor(workspaceId: string, beads: Bead[]): ProjectGroupEntry[] {
  const saved = getSavedProjectGroups(workspaceId);
  const groups = copyEntries(saved === undefined ? DEFAULT_PROJECT_GROUPS : saved);
  const known = new Set(groups.map((group) => group.label));

  for (const bead of beads) {
    for (const label of bead.labels ?? []) {
      if (isProjectLabel(label) && !known.has(label)) {
        groups.push({ label, name: projectDisplayName(label) });
        known.add(label);
      }
    }
  }
  return groups;
}

async function loadGroups(workspaceId: string, store: BeadsStore): Promise<LoadedGroups> {
  const beads = await store.list();
  return { beads, groups: catalogFor(workspaceId, beads) };
}

function normalizeName(input: string): ProjectGroupEntry {
  const name = input.normalize("NFKC").trim();
  const label = projectLabel(name);
  if (!label || !isProjectLabel(label)) {
    throw new ConfigError("Project name must contain at least one usable character.", "invalid_project_group");
  }
  return { label, name };
}

function canonicalLabel(label: string): string {
  return projectLabel(label) || label;
}

/** Reject a target that would identify an existing catalog or bead label. */
function assertAvailable(
  targetLabel: string,
  groups: ProjectGroupEntry[],
  beads: Bead[],
  sourceLabel?: string,
): void {
  const target = canonicalLabel(targetLabel);
  for (const group of groups) {
    if (group.label === sourceLabel) continue;
    if (canonicalLabel(group.label) === target) {
      throw new ConfigError(
        `A project named "${group.name}" already exists.`,
        "duplicate_project_group",
      );
    }
  }
  for (const bead of beads) {
    for (const label of bead.labels ?? []) {
      if (!isProjectLabel(label) || label === sourceLabel) continue;
      if (canonicalLabel(label) === target) {
        throw new ConfigError(
          `A project with label "${label}" already exists on beads.`,
          "duplicate_project_group",
        );
      }
    }
  }
}

function findGroup(groups: ProjectGroupEntry[], label: string): ProjectGroupEntry {
  const group = groups.find((entry) => entry.label === label);
  if (!group) {
    throw new ConfigError(`Project group not found: ${label}`, "project_group_not_found");
  }
  return group;
}

function countMembers(beads: Bead[], label: string): number {
  return beads.reduce(
    (count, bead) => count + ((bead.labels ?? []).includes(label) ? 1 : 0),
    0,
  );
}

function asGroup(entry: ProjectGroupEntry, beads: Bead[]): ProjectGroup {
  return { ...entry, count: countMembers(beads, entry.label) };
}

function savedOrDefaults(workspaceId: string): ProjectGroupEntry[] {
  const saved = getSavedProjectGroups(workspaceId);
  return copyEntries(saved === undefined ? DEFAULT_PROJECT_GROUPS : saved);
}

function replaceOrAppend(
  entries: ProjectGroupEntry[],
  sourceLabel: string,
  replacement: ProjectGroupEntry,
): ProjectGroupEntry[] {
  let replaced = false;
  const next = entries.map((entry) => {
    if (entry.label !== sourceLabel) return { ...entry };
    replaced = true;
    return { ...replacement };
  });
  if (!replaced) next.push({ ...replacement });
  return next;
}

function removeEntry(entries: ProjectGroupEntry[], label: string): ProjectGroupEntry[] {
  return entries.filter((entry) => entry.label !== label).map((entry) => ({ ...entry }));
}

function operationFailure(
  action: "rename" | "delete",
  sourceLabel: string,
  beadId: string,
  completed: number,
  total: number,
  cause: unknown,
): ConfigError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ConfigError(
    `Failed to ${action} project group "${sourceLabel}" for bead "${beadId}" ` +
      `after completing ${completed}/${total} members: ${detail}`,
    "project_group_membership_update_failed",
  );
}

export async function listProjectGroups(
  workspaceId: string,
  store: BeadsStore,
): Promise<ProjectGroup[]> {
  const { beads, groups } = await loadGroups(workspaceId, store);
  return groups.map((group) => asGroup(group, beads));
}

export function createProjectGroup(
  workspaceId: string,
  name: string,
  store: BeadsStore,
): Promise<ProjectGroup> {
  return serializeMutation(workspaceId, async () => {
    const { beads, groups } = await loadGroups(workspaceId, store);
    const entry = normalizeName(name);
    assertAvailable(entry.label, groups, beads);

    const next = [...savedOrDefaults(workspaceId), entry];
    setProjectGroups(workspaceId, next);
    return asGroup(entry, beads);
  });
}

export function renameProjectGroup(
  workspaceId: string,
  sourceLabel: string,
  name: string,
  store: BeadsStore,
  actor: string,
): Promise<ProjectGroupMutation> {
  return serializeMutation(workspaceId, async () => {
    const { beads, groups } = await loadGroups(workspaceId, store);
    findGroup(groups, sourceLabel);
    const replacement = normalizeName(name);
    if (replacement.label !== sourceLabel) {
      assertAvailable(replacement.label, groups, beads, sourceLabel);
    }

    const members = beads.filter((bead) => (bead.labels ?? []).includes(sourceLabel));
    let updated = 0;
    if (replacement.label !== sourceLabel) {
      for (const bead of members) {
        try {
          // Add first so a failed second operation does not leave a member
          // without any project label. Both calls are targeted and preserve all
          // unrelated labels that may have been added concurrently.
          if (!(bead.labels ?? []).includes(replacement.label)) {
            await store.addLabel(bead.id, replacement.label, actor);
          }
          await store.removeLabel(bead.id, sourceLabel, actor);
          updated += 1;
        } catch (cause) {
          throw operationFailure("rename", sourceLabel, bead.id, updated, members.length, cause);
        }
      }
    }

    const next = replaceOrAppend(savedOrDefaults(workspaceId), sourceLabel, replacement);
    setProjectGroups(workspaceId, next);
    // `beads` is the pre-mutation snapshot. A successful rename moves every
    // source member onto the replacement label, so its count is the member count
    // (the target was checked above and cannot already belong to another bead).
    const renamedGroup = { ...replacement, count: members.length };
    return { group: renamedGroup, updated };
  });
}

export function deleteProjectGroup(
  workspaceId: string,
  sourceLabel: string,
  store: BeadsStore,
  actor: string,
): Promise<{ removed: string; updated: number }> {
  return serializeMutation(workspaceId, async () => {
    const { beads, groups } = await loadGroups(workspaceId, store);
    findGroup(groups, sourceLabel);
    const members = beads.filter((bead) => (bead.labels ?? []).includes(sourceLabel));
    let updated = 0;

    for (const bead of members) {
      try {
        await store.removeLabel(bead.id, sourceLabel, actor);
        updated += 1;
      } catch (cause) {
        throw operationFailure("delete", sourceLabel, bead.id, updated, members.length, cause);
      }
    }

    setProjectGroups(workspaceId, removeEntry(savedOrDefaults(workspaceId), sourceLabel));
    return { removed: sourceLabel, updated };
  });
}
