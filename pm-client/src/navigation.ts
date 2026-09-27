import { emptyFilters, type Filters } from "./domain";

export function projectScope(
  filters: Filters,
  project: string,
  fromProjectList: boolean,
): Filters {
  return {
    ...filters,
    project,
    milestone: "all",
    search: fromProjectList ? "" : filters.search,
  };
}

export function historyScope(project: string, milestone = "all"): Filters {
  return { ...emptyFilters, project, milestone };
}
