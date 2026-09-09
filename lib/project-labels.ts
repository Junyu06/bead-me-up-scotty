import type { Bead } from "./schema";
import { DEFAULT_PROJECT_GROUPS, type ProjectGroupEntry } from "./project-group-types";

const NAMES: Record<string, string> = Object.fromEntries(
  DEFAULT_PROJECT_GROUPS.map(({ label, name }) => [label, name]),
);

export function isProjectLabel(label: string): boolean {
  return label.startsWith("project:") && label.slice(8).trim().length > 0;
}

export function projectLabel(name: string): string {
  const slug = name.normalize("NFKC").trim().replace(/^project:/i, "")
    .trim().toLowerCase().replace(/[\s,]+/g, "-");
  return slug ? `project:${slug}` : "";
}

export function projectDisplayName(label: string): string {
  if (NAMES[label]) return NAMES[label];
  const name = label.replace(/^project:/, "").replace(/-/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function projectOptionsFrom(
  beads: Pick<Bead, "labels">[],
  groups: ProjectGroupEntry[] = [],
) {
  const options = new Map(groups.map(({ label, name }) => [label, name]));
  for (const bead of beads) {
    for (const label of bead.labels ?? []) {
      if (isProjectLabel(label) && !options.has(label)) options.set(label, projectDisplayName(label));
    }
  }
  return [...options].map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
