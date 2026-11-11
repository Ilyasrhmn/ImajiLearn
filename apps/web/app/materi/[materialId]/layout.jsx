import SessionReload from "@/components/session-reload";
import MaterialNavigation from "@/components/material-navigation";
import { getMaterialContext } from "./material-context.mjs";
import "@/components/material-detail.css";

export default async function MaterialLayout({ children, params }) {
  const { materialId } = await params;
  const { material } = await getMaterialContext(materialId);
  const { id } = material;
  const { folderId, file } = material.parentId ? (await getMaterialContext(material.parentId)).material : material;

  return <>
    <SessionReload />
    <main id="main" className="workspace-shell material-page">
      <MaterialNavigation materialId={id} folderId={folderId} pdf={file?.mime === "application/pdf"} />
      {children}
    </main>
  </>;
}
