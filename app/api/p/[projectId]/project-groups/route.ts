import { z } from "zod";

import { ok, fail } from "@/lib/api";
import { ConfigError, getConfig } from "@/lib/config";
import { getStore } from "@/lib/store";
import {
  createProjectGroup,
  deleteProjectGroup,
  listProjectGroups,
  renameProjectGroup,
} from "@/lib/project-groups";
import { isProjectLabel } from "@/lib/project-labels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

const createSchema = z.object({ name: z.string().min(1) });
const renameSchema = z.object({
  label: z.string().min(1).refine(isProjectLabel, "Must be a project label."),
  name: z.string().min(1),
});
const deleteSchema = z.object({
  label: z.string().min(1).refine(isProjectLabel, "Must be a project label."),
});

function handleError(error: unknown) {
  if (error instanceof ConfigError && error.code === "project_group_not_found") {
    return ok({ error: error.message, code: error.code }, 404);
  }
  return fail(error);
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const groups = await listProjectGroups(projectId, store);
    return ok({ groups });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const { name } = createSchema.parse(await req.json());
    const group = await createProjectGroup(projectId, name, store);
    return ok({ group }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const { label, name } = renameSchema.parse(await req.json());
    const result = await renameProjectGroup(
      projectId,
      label,
      name,
      store,
      getConfig().humanActor,
    );
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const store = await getStore(projectId);
    const { label } = deleteSchema.parse(await req.json());
    const result = await deleteProjectGroup(
      projectId,
      label,
      store,
      getConfig().humanActor,
    );
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
