import { notFound } from "next/navigation";
import MaterialDetail from "@/components/material-detail";
import { formats } from "@/components/material-formats.mjs";
import { getMaterialContext } from "../material-context.mjs";

export const metadata = { title: "Detail materi · ImajiLearn" };

export default async function MaterialPage({ params }) {
  const { materialId, media = [] } = await params;
  const { teacherId, material } = await getMaterialContext(materialId);
  const format = formats.find(item => item.segment === media[0]);
  if (media.length > 1 || (media.length && !format)) notFound();

  const parent = material.parentId ? (await getMaterialContext(material.parentId)).material : null;
  return <MaterialDetail parent={parent} key={`${format ? material.id : parent?.id ?? material.id}:${format?.id ?? "source"}`} teacherId={teacherId} material={material} format={format} />;
}
