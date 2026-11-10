"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Download, Plus, Scissors } from "lucide-react";
import Icon from "./icon";
import MaterialReading from "./material-reading";
import MaterialVisual from "./material-visual";
import MaterialSlides from "./material-slides";
import MaterialSong from "./material-song";
import { formats } from "./material-formats.mjs";
import { downloadMaterial, updateMaterial } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";
import "./material-detail.css";

const viewers = { reading: MaterialReading, mindmap: MaterialVisual, slides: MaterialSlides, song: MaterialSong };

export default function MaterialDetail({ teacherId, material, format }) {
  const router = useRouter();
  const page = useRef(null);
  const working = useRef(false);
  const [outputs, setOutputs] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const id = encodeURIComponent(material.id);
  const detailHref = `/materi/${id}`;
  const dashboardHref = material.folderId ? `/dashboard?folder=${encodeURIComponent(material.folderId)}` : "/dashboard";
  const sourcePath = `/materials/${id}`;
  const sourceReady = !material.archived && material.extractionStatus === "ready";

  useEffect(() => {
    if (!sourceReady) return;
    const controller = new AbortController();
    for (const item of format ? [format] : formats) {
      const store = value => {
        if (!controller.signal.aborted) setOutputs(current => ({ ...current, [item.id]: value }));
      };
      studioRequest(teacherId, `${sourcePath}/${item.segment}`, { signal: controller.signal })
        .then(({ data }) => store({ data }))
        .catch(() => store({ error: true }));
    }
    return () => controller.abort();
  }, [attempt, format, sourcePath, sourceReady, teacherId]);

  function retryOutputs() {
    setOutputs(current => Object.fromEntries(Object.entries(current).filter(([, output]) => !output.error)));
    setAttempt(current => current + 1);
  }

  async function generate(item) {
    if (working.current || !sourceReady || outputs[item.id]?.data !== null) return;
    working.current = true;
    setBusyId(item.id);
    setActionError(null);
    try {
      const { data: [preference] } = await studioRequest(teacherId, `/media-preferences?materialIds=${id}`);
      if (!preference.selectedMedia.includes(item.id)) {
        await updateMaterial(teacherId, { ...material, preferenceVersion: preference.resourceVersion }, {
          selectedMedia: [...preference.selectedMedia, item.id],
          songTemplateId: preference.songTemplateId ?? "balonku",
        });
      }
      await studioRequest(teacherId, `${sourcePath}/${item.segment}`, { method: "POST" });
      if (page.current?.isConnected) router.push(`${detailHref}/${item.segment}`);
    } catch (error) {
      setActionError({ id: item.id, message: error.message });
    } finally {
      working.current = false;
      setBusyId(null);
    }
  }

  async function downloadFile() {
    setActionError(null);
    try {
      const url = URL.createObjectURL(await downloadMaterial(teacherId, material.id));
      const link = document.createElement("a");
      link.href = url;
      link.download = material.file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setActionError({ message: error.message });
    }
  }

  if (format) {
    const output = outputs[format.id];
    const Viewer = viewers[format.id];
    const back = () => router.push(detailHref);
    return <main className="workspace-shell material-page material-output-page">
      {sourceReady && output?.data ? <Viewer reading={output.data} visual={output.data} deck={output.data} song={output.data}
        teacherId={teacherId} revision={material.revision} illustrationPath={sourcePath + "/reading/illustration"}
        illustrationsPath={sourcePath + "/slides/illustrations"} songPath={sourcePath + "/song"} onBack={back} /> : <>
        <Link className="material-return" href={detailHref}><ArrowLeft size={18} aria-hidden="true" />{material.title}</Link>
        <h1>{format.label}</h1>
        {!sourceReady ? <p>Media tidak tersedia untuk materi ini.</p> : !output ? <p role="status">Memuat {format.action}…</p>
          : output.error ? <><p role="alert">Media tidak dapat dimuat.</p><button type="button" className="source-secondary" onClick={retryOutputs}>Coba lagi</button></>
          : <p>Media belum dibuat. <Link href={detailHref}>Kembali ke materi</Link></p>}
      </>}
    </main>;
  }

  return <main className="workspace-shell material-page" ref={page}>
    <Link className="material-return" href={dashboardHref}><ArrowLeft size={18} aria-hidden="true" />Materi</Link>
    <header className="material-page-heading">
      <h1>{material.title}</h1>
      {material.file && <button className="material-source-download" type="button" onClick={downloadFile} aria-label={`Unduh ${material.file.name}`}>
        <Download size={17} aria-hidden="true" /><span>Unduh sumber</span>
      </button>}
    </header>
    {actionError && !actionError.id && <p className="source-error" role="alert">{actionError.message}</p>}
    {sourceReady ? <ul className="material-media-list" aria-label="Media pembelajaran">
      {formats.map(item => {
        const output = outputs[item.id];
        return <li key={item.id}>
          {output?.data ? <Link className="material-media-row" href={`${detailHref}/${item.segment}`}>
            <Icon name={item.icon} size={21} />
            <strong>{item.label}</strong>
            <span className="material-media-action">
              {item.id === "song" && !["ready", "failed", "uncertain"].includes(output.data.status) ? "Lihat proses" : "Buka"}
              <ChevronRight size={16} aria-hidden="true" />
            </span>
          </Link> : <button type="button" className="material-media-row" disabled={!output || busyId !== null}
            onClick={output?.error ? retryOutputs : () => generate(item)}>
            <Icon name={item.icon} size={21} />
            <strong>{item.label}</strong>
            <span className="material-media-action" aria-live={busyId === item.id ? "polite" : undefined}>
              {!output ? "Memuat…" : busyId === item.id ? "Membuat…" : output.error ? "Muat ulang" : <><Plus size={16} aria-hidden="true" />Buat</>}
            </span>
          </button>}
          {actionError?.id === item.id && <p className="source-error" role="alert">{actionError.message}</p>}
        </li>;
      })}
    </ul> : <p role="status">{material.archived ? "Pulihkan materi untuk membuat atau membuka media." :
      material.extractionStatus === "failed" ? "Teks file belum terbaca. Unggah ulang dengan teks materi." : "Teks sumber belum siap."}</p>}
    {sourceReady && <div className="material-page-tools">
      <Link className="source-secondary" href={`/lkpd?material=${id}`}><Scissors size={18} aria-hidden="true" />Buat LKPD</Link>
    </div>}
  </main>;
}
