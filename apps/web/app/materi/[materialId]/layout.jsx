import SessionReload from "@/components/session-reload";
import TeacherWorkspace from "@/components/teacher-workspace";
import MaterialNavigation from "@/components/material-navigation";
import { getMaterialContext } from "./material-context.mjs";
import "@/components/material-detail.css";

export default async function MaterialLayout({ children, params }) {
  const { materialId } = await params;
  const { material, teacherName } = await getMaterialContext(materialId);
  const { id } = material;
  const { folderId, file } = material.parentId ? (await getMaterialContext(material.parentId)).material : material;

  return <>
    <SessionReload />
    <TeacherWorkspace name={teacherName} current="/buat-media">
    <main id="main" className="teacher-home material-page">
      <MaterialNavigation materialId={id} folderId={folderId} pdf={file?.mime === "application/pdf"} />
      {children}
    </main>
    </TeacherWorkspace>
  </>;
}
