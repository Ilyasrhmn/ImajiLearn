import SessionReload from "@/components/session-reload";
import MaterialNavigation from "@/components/material-navigation";
import { getMaterialContext } from "./material-context.mjs";
import "@/components/material-detail.css";

export default async function MaterialLayout({ children, params }) {
  const { materialId } = await params;
  const { material: { id, folderId, file } } = await getMaterialContext(materialId);

  return <>
    <SessionReload />
    <main id="main" className="workspace-shell material-page">
      <MaterialNavigation materialId={id} folderId={folderId} pdf={file?.mime === "application/pdf"} />
      {children}
    </main>
  </>;
}
