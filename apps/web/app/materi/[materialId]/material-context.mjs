import { cache } from "react";
import { notFound } from "next/navigation";
import { requirePageTeacher } from "@/server/accounts/page-session.mjs";
import { database } from "@/server/core/database.mjs";
import { ApiError } from "@/server/core/errors.mjs";
import { createMaterialService } from "@/server/materials/service.mjs";

export const getMaterialContext = cache(async materialId => {
  const teacher = await requirePageTeacher();
  try {
    const material = await createMaterialService(database()).get(teacher.id, materialId);
    return { teacherId: teacher.id, material };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});
