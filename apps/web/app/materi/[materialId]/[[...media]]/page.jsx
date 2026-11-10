import { notFound } from "next/navigation";
import SessionReload from "@/components/session-reload";
import MaterialDetail from "@/components/material-detail";
import { formats } from "@/components/material-formats.mjs";
import { requirePageTeacher } from "@/server/accounts/page-session.mjs";
import { database } from "@/server/core/database.mjs";
import { ApiError } from "@/server/core/errors.mjs";
import { createMaterialService } from "@/server/materials/service.mjs";

export const metadata = { title: "Detail materi · ImajiLearn" };

export default async function MaterialPage({ params }) {
  const teacher = await requirePageTeacher();
  const { materialId, media = [] } = await params;
  const format = formats.find(item => item.segment === media[0]);
  if (media.length > 1 || (media.length && !format)) notFound();

  let material;
  try {
    material = await createMaterialService(database()).get(teacher.id, materialId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return <><SessionReload /><MaterialDetail key={`${material.id}:${format?.id ?? "detail"}`} teacherId={teacher.id} material={material} format={format} /></>;
}
