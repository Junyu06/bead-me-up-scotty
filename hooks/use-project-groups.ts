"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/components/app-context";
import { api, type ProjectGroupsResponse } from "@/lib/api-client";
import { beadsKey } from "@/hooks/use-beads";

/** Project-group data belongs to a Beads workspace (the active project id). */
export const projectGroupsKey = (workspaceId: string) => ["project-groups", workspaceId] as const;

function useWorkspaceId(projectId?: string): string {
  const { projectId: activeProjectId } = useApp();
  return projectId ?? activeProjectId;
}

function invalidateProjectGroupCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: projectGroupsKey(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: beadsKey(workspaceId) }),
  ]);
}

/** Directory entries for the active Beads workspace. */
export function useProjectGroups(projectId?: string) {
  const workspaceId = useWorkspaceId(projectId);
  return useQuery<ProjectGroupsResponse>({
    queryKey: projectGroupsKey(workspaceId),
    queryFn: () => api.projectGroups.list(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateProjectGroup(projectId?: string) {
  const workspaceId = useWorkspaceId(projectId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: { name: string }) => api.projectGroups.create(workspaceId, name),
    // A failed write may still have changed some members before the backend
    // reported its error, so both success and failure need fresh data.
    onSettled: () => invalidateProjectGroupCaches(queryClient, workspaceId),
  });
}

export function useRenameProjectGroup(projectId?: string) {
  const workspaceId = useWorkspaceId(projectId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ label, name }: { label: string; name: string }) =>
      api.projectGroups.rename(workspaceId, label, name),
    onSettled: () => invalidateProjectGroupCaches(queryClient, workspaceId),
  });
}

export function useDeleteProjectGroup(projectId?: string) {
  const workspaceId = useWorkspaceId(projectId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ label }: { label: string }) => api.projectGroups.remove(workspaceId, label),
    onSettled: () => invalidateProjectGroupCaches(queryClient, workspaceId),
  });
}

