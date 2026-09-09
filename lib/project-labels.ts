import type { Bead } from "./schema";

const NAMES: Record<string, string> = {
  "project:safeclick": "SafeClick",
  "project:detentlabs": "DetentLabs",
};

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

export function projectOptionsFrom(beads: Pick<Bead, "labels">[]) {
  const labels = new Set(Object.keys(NAMES));
  for (const bead of beads) {
    for (const label of bead.labels ?? []) if (isProjectLabel(label)) labels.add(label);
  }
  return [...labels].map((value) => ({ value, label: projectDisplayName(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
