"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useParams } from "next/navigation";
import MaterialDetail from "../../web/components/material-detail";
import MaterialNavigation from "../../web/components/material-navigation";
import { formats } from "../../web/components/material-formats.mjs";
import { getMaterial } from "@imajilearn/shared/lib/materials.mjs";
import { useSession } from "./session-gate";
import { ErrorState, Loading, Sheet } from "./ui";
import "../../web/components/material-detail.css";
import "./documents.css";
import "./material-workspace.css";

export default function MaterialWorkspace() {
  const { materialId, media = [] } = useParams();
  const { id: teacherId } = useSession();
  const [context, setContext] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const format = formats.find(item => item.segment === media[0]);
  const valid = media.length === 0 || (media.length === 1 && Boolean(format));
  useEffect(() => {
    if (!valid) return;
    let active = true;
    getMaterial(teacherId, materialId).then(async material => {
      const parent = material.parentId ? await getMaterial(teacherId, material.parentId) : null;
      if (active) setContext({ material, parent });
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [teacherId, materialId, attempt, valid]);
  if (!valid) return <ErrorState message="Halaman tidak ditemukan." />;
  if (error) return <ErrorState message={error} onRetry={() => { setError(""); setAttempt(n => n + 1); }} />;
  if (!context || context.material.id !== materialId) return <Loading variant="lesson" label="Memuat materi" />;
  const { material, parent } = context, original = parent ?? material;
  return <section className="material-page pwa-material-workspace">
    <MaterialNavigation materialId={material.id} folderId={original.folderId} pdf={original.file?.mime === "application/pdf"}
      activeSegment={media[0] ?? ""} libraryHref={original.folderId ? `/materi?folder=${encodeURIComponent(original.folderId)}` : "/materi"} />
    <MaterialDetail key={`${material.id}:${format?.id ?? "source"}`} teacherId={teacherId} material={material} parent={parent} format={format} libraryHref="/materi" SourceSidebar={SourceSections} />
  </section>;
}

function SourceSections({ label, children }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const onChoose = useCallback((...args) => closeRef.current.close(() => children.props.onChoose(...args)), [children]);
  const onCreate = useCallback((...args) => closeRef.current.close(() => children.props.onCreate(...args)), [children]);
  const Picker = children.type;
  const picker = <Picker {...children.props} onChoose={onChoose} onCreate={children.props.onCreate ? onCreate : undefined} />;
  return <div className="pwa-source-sections">
    <button type="button" className="pwa-section-toggle" onClick={() => setOpen(true)} aria-haspopup="dialog"><span>{label}</span><ChevronDown size={18} aria-hidden="true" /></button>
    {open && <Sheet title="Bagian materi" closeRef={closeRef} onClose={() => setOpen(false)}>{picker}</Sheet>}
  </div>;
}
