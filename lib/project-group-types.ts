/** Business projects within one Beads workspace; membership is a project:* label. */
export interface ProjectGroup {
  label: string;
  name: string;
  count: number;
}

export interface ProjectGroupEntry {
  label: string;
  name: string;
}

export const DEFAULT_PROJECT_GROUPS: ProjectGroupEntry[] = [];
