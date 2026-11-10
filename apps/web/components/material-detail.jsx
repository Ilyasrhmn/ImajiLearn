"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import MaterialReading from "./material-reading";
import MaterialVisual from "./material-visual";
import MaterialSlides from "./material-slides";
import MaterialSong from "./material-song";
import MaterialSource from "./material-source";
import MaterialProjector from "./material-projector";
import { downloadMaterial, updateMaterial } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";

export default function MaterialDetail({ teacherId, material, format }) {
  const panel = useRef(null);
  const working = useRef(false);
  const [output, setOutput] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = encodeURIComponent(material.id);
  const detailHref = `/materi/${id}`;
  const sourcePath = `/materials/${id}`;
  const outputPath = format ? `${sourcePath}/${format.segment}` : null;
  const sourceReady = !material.archived && material.extractionStatus === "ready";

  useEffect(() => {
    if (!sourceReady || !outputPath) return;
    const controller = new AbortController();
    studioRequest(teacherId, outputPath, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setOutput({ data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [attempt, outputPath, sourceReady, teacherId]);

  async function generate() {
    if (working.current || !format || !sourceReady || output?.data !== null) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const { data: [preference] } = await studioRequest(teacherId, `/media-preferences?materialIds=${id}`);
      if (!preference.selectedMedia.includes(format.id)) {
        await updateMaterial(teacherId, { ...material, preferenceVersion: preference.resourceVersion }, {
          selectedMedia: [...preference.selectedMedia, format.id],
          songTemplateId: preference.songTemplateId ?? "balonku",
        });
      }
      const { data } = await studioRequest(teacherId, outputPath, { method: "POST" });
      if (panel.current?.isConnected) setOutput({ data });
    } catch (failure) {
      setError(failure.message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function downloadFile() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const url = URL.createObjectURL(await downloadMaterial(teacherId, material.id));
      const link = document.createElement("a");
      link.href = url;
      link.download = material.file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) {
      setError(failure.message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  if (!format) return <article className="material-panel material-source">
    <div className="material-source-inner">
    <h1>{material.title}</h1>
    {material.file && <button className="material-source-download" type="button" onClick={downloadFile} disabled={busy}
      aria-label={`Unduh ${material.file.name}`}>
      <Download size={18} aria-hidden="true" /><span>{material.file.name}</span>
    </button>}
    {error && <p className="source-error" role="alert">{error}</p>}
    <MaterialSource teacherId={teacherId} sourcePath={sourcePath} material={material} />
    </div>
  </article>;

  return <div className="material-panel material-output-page" ref={panel}>
    {sourceReady && output?.data ? <>
      {format.id === "reading" && <MaterialReading reading={output.data} teacherId={teacherId}
        illustrationPath={sourcePath + "/reading/illustration"} sourceHref={detailHref} />}
      {format.id === "mindmap" && <MaterialProjector><MaterialVisual visual={output.data} /></MaterialProjector>}
      {format.id === "slides" && <MaterialProjector><MaterialSlides deck={output.data} teacherId={teacherId}
        illustrationsPath={sourcePath + "/slides/illustrations"} revision={material.revision} /></MaterialProjector>}
      {format.id === "song" && <MaterialSong song={output.data} teacherId={teacherId} songPath={sourcePath + "/song"} revision={material.revision} />}
    </> : <section className="material-media-state">
      <h1>{format.label}</h1>
      {!sourceReady ? <p role="status">{material.archived ? "Pulihkan materi untuk membuka media." : "Teks sumber belum siap."}</p>
        : loadError ? <>
          <p role="alert">Media tidak dapat dimuat.</p>
          <button type="button" className="source-secondary" onClick={() => { setLoadError(false); setAttempt(value => value + 1); }}>Coba lagi</button>
        </> : !output ? <p role="status">Memuat…</p> : <>
          <button type="button" className="upload-button" onClick={generate} disabled={busy}>
            {busy ? "Membuat…" : `Buat ${format.action}`}
          </button>
          {error && <p className="source-error" role="alert">{error}</p>}
        </>}
      {!sourceReady && !material.archived && <Link className="material-return" href={detailHref}>Lihat sumber</Link>}
    </section>}
  </div>;
}
