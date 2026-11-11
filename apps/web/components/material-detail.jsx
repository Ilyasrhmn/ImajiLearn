"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, History, LoaderCircle } from "lucide-react";
import MaterialReading from "./material-reading";
import MaterialVisual from "./material-visual";
import MaterialSlides from "./material-slides";
import MaterialSong from "./material-song";
import MaterialSource from "./material-source";
import SectionPicker from "./material-section-picker";
import MaterialBatch from "./material-batch";
import { Mascot } from "./mascot";
import MaterialProjector from "./material-projector";
import Modal, { closeModal } from "./modal";
import { downloadMaterial } from "../lib/materials";
import { generateMaterialMedia } from "../lib/material-media.mjs";
import { studioRequest } from "../lib/studio-api.mjs";
import { preloadLessonImages } from "../lib/lesson-images.mjs";
import { sourceTextLimitMessage } from "../lib/material-limits.mjs";
import { sectionLabel as compactSectionLabel } from "../lib/material-section-label.mjs";
import MaterialMediaHistory from "./material-media-history";

const prompts = {
  reading: "Buat bacaan bergambar?",
  mindmap: "Buat visual interaktif?",
  slides: "Buat slide?",
  song: "Buat lagu belajar?",
};

export default function MaterialDetail({ teacherId, material, format, parent }) {
  const panel = useRef(null);
  const router = useRouter();
  const search = useSearchParams();
  const pickerRef = useRef(null);
  const [selecting, setSelecting] = useState(false);
  const [visiblePage, setVisiblePage] = useState(material.pageStart ?? 1);
  const [batch, setBatch] = useState(() => search.get("create") === "1");
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [requested, setRequested] = useState(() => search.get("resume") === "1" || search.get("make") === "1");
  const [sectionError, setSectionError] = useState("");
  const working = useRef(false);
  const [output, setOutput] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [songCheck, setSongCheck] = useState(0);
  const [songCheckError, setSongCheckError] = useState("");
  const id = encodeURIComponent(material.id);
  const detailHref = `/materi/${id}`;
  const sourcePath = `/materials/${id}`;
  const original = parent ?? material;
  const isPdf = original.file?.mime === "application/pdf";
  const current = material.parentId ? { first: material.pageStart, last: material.pageEnd, pages: material.sectionPages } : null;
  const sectionTitle = /^Hlm\. \d+\s*[-–]\s*\d+$/.test(material.title) ? "Pilihan halaman" : compactSectionLabel(material.title);
  const sectionLabel = current?.pages?.length ? `Pilihan halaman · ${current.pages.length} halaman`
    : current ? `${sectionTitle} · hlm. ${current.first} - ${current.last}` : "Seluruh materi";
  const picker = isPdf && !original.archived ? <SectionPicker ref={pickerRef} teacherId={teacherId} parentId={original.id} current={current} visiblePage={format ? undefined : visiblePage}
    manualDefault={search.get("pages") === "1"} onCreate={format ? undefined : openBatch} creating={busy}
    onError={format ? undefined : setSectionError}
    onChoose={(sectionId, options) => {
      if (sectionId === material.id) {
        if (!options?.manual) setSelecting(false);
      } else {
        const query = new URLSearchParams();
        if (options?.manual) query.set("pages", "1");
        if (format) query.set("make", "1");
        router.replace(`/materi/${encodeURIComponent(sectionId)}${format ? "/" + format.segment : ""}${query.size ? "?" + query : ""}`, { scroll: false });
      }
    }} /> : null;
  const outputPath = format ? `${sourcePath}/${format.segment}` : null;
  const sourceReady = !material.archived && material.extractionStatus === "ready";
  const blockedTitle = material.archived ? "Materi diarsipkan"
    : material.extractionError === "SOURCE_TEXT_TOO_LONG" ? "Teks sumber terlalu panjang"
    : "Teks sumber tidak terbaca";

  const song = format?.id === "song" ? output?.data : null;
  const songPending = Boolean(song && !["ready", "failed", "uncertain"].includes(song.status));
  const songFailed = song?.status === "failed" || song?.status === "uncertain";
  const showDialog = Boolean(format) && !dismissed && (requested || selecting || songPending || finishing);

  const afterDialog = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("resume") || url.searchParams.has("make")) {
      url.searchParams.delete("resume");
      url.searchParams.delete("make");
      window.history.replaceState(null, "", url);
    }
    setDismissed(true);
    setFinishing(false);
    setSelecting(false);
    setRequested(false);
  }, []);

  useEffect(() => {
    if (!dismissed) return;
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector("[data-media-create], [data-output-heading], .format-detail h2");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [dismissed]);

  const finishGeneration = useCallback(data => {
    if (!panel.current?.isConnected) return;
    setFinishing(true);
    setShowHistory(false);
    setHistoryVersion(value => value + 1);
    setOutput(previous => ({ data, version: (previous?.version ?? 0) + 1 }));
    closeModal(afterDialog);
  }, [afterDialog]);

  const historyPath = format ? `/materials/${encodeURIComponent(original.id)}/history?feature=${format.id}` : null;
  useEffect(() => {
    if (!historyPath) return;
    const controller = new AbortController();
    studioRequest(teacherId, historyPath, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setHistory(data); setHistoryError(""); } })
      .catch(failure => { if (!controller.signal.aborted) setHistoryError(failure.message); });
    return () => controller.abort();
  }, [historyPath, historyVersion, teacherId]);

  useEffect(() => {
    if (!sourceReady || !outputPath) return;
    const controller = new AbortController();
    studioRequest(teacherId, outputPath, { signal: controller.signal })
      .then(async ({ data }) => {
        await preloadLessonImages(outputPath, data, controller.signal);
        if (!controller.signal.aborted) setOutput({ data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [attempt, outputPath, sourceReady, teacherId]);

  useEffect(() => {
    if (!showDialog || !songPending) return;
    const controller = new AbortController();
    const deadline = Date.now() + 10 * 60_000;
    let timer;

    async function poll() {
      try {
        const { data } = await studioRequest(teacherId, outputPath, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (data?.status === "ready") finishGeneration(data);
        else if (data?.status === "failed" || data?.status === "uncertain") setOutput({ data });
        else if (data && Date.now() < deadline) timer = setTimeout(poll, 5000);
        else setSongCheckError(data ? "Lagu masih diproses." : "Status lagu belum tersedia.");
      } catch (failure) {
        if (!controller.signal.aborted) setSongCheckError(failure.message);
      }
    }

    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [showDialog, songPending, songCheck, teacherId, outputPath, finishGeneration]);

  async function generate(regenerate = false) {
    if (working.current || !format || !sourceReady) return;
    if (!regenerate && output?.data && song?.status !== "failed") {
      setShowHistory(false);
      afterDialog();
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    setSongCheckError("");
    try {
      const data = await generateMaterialMedia(teacherId, regenerate ? outputPath + "?regenerate=1" : outputPath, original.id, format.id);
      if (!panel.current?.isConnected) return;
      if (regenerate) {
        setOutput(previous => ({ data, version: (previous?.version ?? 0) + 1 }));
        setHistoryVersion(value => value + 1);
      }
      else if (format.id === "song" && data?.status !== "ready") setOutput({ data });
      else finishGeneration(data);
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
      const url = URL.createObjectURL(await downloadMaterial(teacherId, original.id));
      const link = document.createElement("a");
      link.href = url;
      link.download = original.file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) {
      setError(failure.message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function openBatch() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setSectionError("");
    try {
      const selectedId = await pickerRef.current?.apply();
      if (selectedId === null) return;
      if (selectedId && selectedId !== material.id) {
        router.push(`/materi/${encodeURIComponent(selectedId)}?create=1`);
      } else setBatch(true);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  if (!format) return <article className="material-panel material-source">
    <div className={picker ? "material-source-sections" : "material-source-inner"}>
      {picker && <aside className="material-source-sidebar" aria-label="Bagian materi">{picker}</aside>}
      <div className={picker ? "material-source-inner" : undefined}>
        <h1>{original.title}</h1>
        <div className="material-source-actions">
          {original.file && <button className="material-source-download" type="button" onClick={downloadFile} disabled={busy}
            aria-label={`Unduh ${original.file.name}`}>
            <Download size={18} aria-hidden="true" /><span>{original.file.name}</span>
          </button>}
          {!material.archived && sourceReady && !picker && <button className="source-secondary material-batch-open" type="button" disabled={busy}
            onClick={openBatch}>{busy ? "Memuat…" : "Buat media"}</button>}
        </div>
        {error && <p className="source-error" role="alert">{error}</p>}
        <MaterialSource key={material.id} teacherId={teacherId} sourcePath={`/materials/${original.id}`} material={original}
          firstPage={current?.first} lastPage={current?.last} selectedPages={current?.pages} onVisiblePage={picker ? setVisiblePage : undefined} />
      </div>
    </div>
    {sectionError && <Modal title="Bagian belum bisa dipakai" onClose={() => setSectionError("")}
      showClose={false} className="material-generate-dialog">
      <div aria-hidden="true"><Mascot kind="book" className="material-generate-mascot" /></div>
      <h2>Bagian belum bisa dipakai</h2>
      <p role="alert" className="source-error">{sectionError}</p>
      <div className="source-actions"><button type="button" className="source-secondary"
        onClick={() => closeModal(() => setSectionError(""))}>Tutup</button></div>
    </Modal>}
    {(batch || search.get("create") === "1") && <MaterialBatch teacherId={teacherId} material={material} sectionLabel={sectionLabel} close={() => {
      setBatch(false);
      if (search.has("create")) router.replace(detailHref, { scroll: false });
    }}
      choosePages={() => {
        setBatch(false);
        if (search.has("create")) router.replace(detailHref, { scroll: false });
        requestAnimationFrame(() => document.querySelector(".source-section-picker li button:not([aria-pressed='true']):not(:disabled)")?.focus());
      }} />}
  </article>;

  const generating = busy || finishing || (songPending && !songCheckError);
  const dialogError = error || songCheckError || (songFailed ? song.error ?? "Lagu belum dapat dibuat." : "");
  const incomplete = search.get("resume") === "1" || history?.items.some(item => item.materialId === material.id && item.status !== "ready");
  const question = !sourceReady ? blockedTitle : loadError ? "Media tidak dapat dimuat"
    : incomplete ? `Lengkapi ${format.action}?` : prompts[format.id];
  const title = generating ? `Membuat ${format.action}…` : question;
  const hasResult = sourceReady && output?.data && (!song || song.status === "ready") && !showDialog && !showHistory;

  async function loadMoreHistory() {
    if (historyLoading || history?.nextOffset == null) return;
    setHistoryLoading(true);
    try {
      const { data } = await studioRequest(teacherId, historyPath + "&offset=" + history.nextOffset);
      setHistory(previous => ({ ...data, items: [...previous.items,
        ...data.items.filter(item => !previous.items.some(saved => saved.materialId === item.materialId))] }));
      setHistoryError("");
    } catch (failure) { setHistoryError(failure.message); }
    finally { setHistoryLoading(false); }
  }

  function openHistoryItem(event, item) {
    if (item.materialId !== material.id) return;
    event.preventDefault();
    setShowHistory(false);
    setError("");
    if (item.status === "ready") {
      setRequested(false);
      if (!output?.data) setAttempt(value => value + 1);
    } else {
      setRequested(true);
      setDismissed(false);
    }
  }

  function requestCreation() {
    setError("");
    setRequested(true);
    setDismissed(false);
    setSelecting(Boolean(output?.data && picker));
  }

  function retryLoad() {
    setLoadError(false);
    setDismissed(false);
    setAttempt(value => value + 1);
  }

  function sourceLink(inDialog = false) {
    return <Link className={inDialog ? "upload-button" : "material-return"} data-media-create={inDialog ? undefined : ""}
      href={material.archived ? "/dashboard" : detailHref}>
      {material.archived ? "Kembali ke materi" : "Lihat sumber"}
    </Link>;
  }

  return <div className="material-panel material-output-page" ref={panel}>
    {hasResult ? <>
      <button type="button" className="material-history-return" onClick={() => setShowHistory(true)}>
        <History size={18} aria-hidden="true" />Riwayat {format.action}
      </button>
      {format.id === "reading" && <MaterialReading reading={output.data} teacherId={teacherId}
        illustrationPath={sourcePath + "/reading/illustration"} sourceHref={detailHref} />}
      {format.id === "mindmap" && <>
        {busy ? <p role="status">Membuat visual…</p>
          : <MaterialProjector><MaterialVisual key={output.version ?? 0} visual={output.data} /></MaterialProjector>}
        <div className="visual-regenerate">
          {!busy && <button type="button" className="source-secondary" onClick={() => generate(true)}>Buat ulang visual</button>}
          {error && <p className="source-error" role="alert">{error}</p>}
        </div>
      </>}
      {format.id === "slides" && <MaterialProjector><MaterialSlides deck={output.data} teacherId={teacherId}
        illustrationsPath={sourcePath + "/slides/illustrations"} revision={material.revision} /></MaterialProjector>}
      {format.id === "song" && <MaterialSong song={output.data} teacherId={teacherId} songPath={sourcePath + "/song"} revision={material.revision} />}
    </> : <MaterialMediaHistory format={format} history={history} error={historyError} loading={historyLoading}
      creating={busy || (sourceReady && !loadError && output === null)} archived={original.archived}
      onCreate={requestCreation} onOpen={openHistoryItem} onMore={loadMoreHistory}
      onRetry={() => setHistoryVersion(value => value + 1)} />}
    {showDialog && <Modal title={question} onClose={afterDialog} dismissible={!busy && !finishing}
      showClose={false} className="material-generate-dialog">
      <div aria-hidden="true"><Mascot kind="book" className="material-generate-mascot" /></div>
      <h2>{selecting ? "Pilih bagian" : generating ? <span role="status"><LoaderCircle size={20} aria-hidden="true" />{title}</span> : title}</h2>
      {!sourceReady && material.extractionError === "SOURCE_TEXT_TOO_LONG" && !selecting && <p className="source-error">{sourceTextLimitMessage}</p>}
      {selecting ? picker : picker && sourceReady && !generating && !loadError &&
        <div className="material-generation-scope">{sectionLabel} <button type="button" className="source-section-manual"
          onClick={() => setSelecting(true)}>Ganti bagian</button></div>}
      {dialogError && !generating && <p role="alert" className="source-error">{dialogError}</p>}
      <div className="source-actions">
        {!busy && !finishing && <>
          <button type="button" className="source-secondary" onClick={() => closeModal(afterDialog)}>Nanti</button>
          {selecting ? <button type="button" className="source-secondary" onClick={() => setSelecting(false)}>Kembali</button>
            : !sourceReady && picker ? <button type="button" className="upload-button" onClick={() => setSelecting(true)}>Pilih bagian</button>
            : !sourceReady ? sourceLink(true)
            : loadError ? <button type="button" className="upload-button" onClick={retryLoad}>Coba lagi</button>
            : songCheckError ? <button type="button" className="upload-button"
            onClick={() => { setSongCheckError(""); setSongCheck(value => value + 1); }}>Periksa lagi</button>
            : !songPending && song?.status !== "uncertain" && <button type="button" className="upload-button" onClick={() => generate()}>
              {dialogError ? "Coba lagi" : output?.data && !songFailed ? `Buka ${format.action}` : incomplete ? "Lanjutkan" : `Buat ${format.action}`}
            </button>}
        </>}
      </div>
    </Modal>}
  </div>;
}
