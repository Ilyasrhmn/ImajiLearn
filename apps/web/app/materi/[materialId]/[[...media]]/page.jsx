import { notFound, redirect } from "next/navigation";
import MaterialDetail from "@/components/material-detail";
import { formats } from "@/components/material-formats.mjs";
import { getMaterialContext } from "../material-context.mjs";
import { mediaStudio } from "@/lib/media-studios.mjs";

export const metadata = { title: "Detail materi · ImajiLearn" };

export default async function MaterialPage({ params, searchParams }) {
  const { materialId, media = [] } = await params;
  const { teacherId, material } = await getMaterialContext(materialId);
  const format = formats.find(item => item.segment === media[0]);
  if (media.length > 1 || (media.length && !format)) notFound();
  if (format) {
    const query = await searchParams;
    const studio = mediaStudio(format.id);
    redirect(`${studio.route}?${query.open === "1" ? "hasil" : "materi"}=${encodeURIComponent(material.id)}`);
  }

  const parent = material.parentId ? (await getMaterialContext(material.parentId)).material : null;
  return <MaterialDetail parent={parent} key={parent?.id ?? material.id} teacherId={teacherId} material={material} />;
}
