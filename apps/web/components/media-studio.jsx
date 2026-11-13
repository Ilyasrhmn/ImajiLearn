"use client";
import LoadingSkeleton from "@imajilearn/shared/components/loading-skeleton.jsx";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpenText, ChevronLeft, ChevronRight, FilePenLine, FileText, Folder, History, Plus, Search, Upload } from "lucide-react";
import Modal, { closeModal, swapModalContent } from "./modal";
import MaterialReading from "./material-reading";
import MaterialSlides from "./material-slides";
import MaterialSong from "./material-song";
import MaterialVisual from "./material-visual";
import MaterialProjector from "./material-projector";
import MaterialMediaHistory from "./material-media-history";
import MaterialTabIcon from "./material-tab-icon";
import SectionPicker from "./material-section-picker";
import UploadMaterial from "./upload-material";
import { Mascot } from "./mascot";
import { mediaStudio } from "../lib/media-studios.mjs";
import { resolveVisualModel } from "../lib/visual-templates.mjs";
import { getMaterial, listFolders, listMaterials, NO_SUBJECT_LABEL } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";
import { generateMaterialMedia } from "../lib/material-media.mjs";
import { preloadLessonImages } from "../lib/lesson-images.mjs";
import { sourceTextLimit, sourceTextLimitMessage } from "../lib/material-limits.mjs";
import "./media-studio.css";

const outputPath = (format, id) => `/materials/${encodeURIComponent(id)}/${format.segment}`;
const songPending = data => data && !["ready", "failed", "uncertain"].includes(data.status);
function waitForSong(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 5000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function MediaSourceDialog({ teacherId, format, initial, onClose, onDraftSaved, onComplete }) {
  const [stage, setStage] = useState(initial ? "parts" : "sources");
  const [material, setMaterial] = useState(initial ?? null);
  const [items, setItems] = useState(null);
  const [folders, setFolders] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [preparation, setPreparation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const picker = useRef(null);
  const working = useRef(false);
  const alive = useRef(true);
  const saveQueue = useRef(Promise.resolve());
  const savedId = useRef(null);
  const generation = useRef(null);
  const draftPath = `/media/${format.id}/drafts`;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current?.abort(); };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([listMaterials(teacherId), listFolders(teacherId)])
      .then(([sources, subjects]) => {
        if (!active) return;
        setItems(sources.filter(item => !item.archived && !item.parentId));
        setFolders(subjects);
        setListError("");
      }).catch(failure => { if (active) setListError(failure.message); });
    return () => { active = false; };
  }, [teacherId, attempt]);

  function changeStage(next) {
    setError("");
    void swapModalContent(() => setStage(next), ".studio-create-title");
  }
  function saveDraft(materialId) {
    const next = saveQueue.current.catch(() => {}).then(async () => {
      if (savedId.current === materialId) return;
      await studioRequest(teacherId, draftPath, { method: "PUT", body: { materialId } });
      savedId.current = materialId;
      if (alive.current) onDraftSaved();
    });
    saveQueue.current = next;
    return next;
  }
  async function beforeClose() {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      if (generating) generation.current?.abort();
      if (!generating && stage === "parts" && material) {
        const selection = material.file?.mime === "application/pdf" ? await picker.current?.apply({ silent: true }) : material.id;
        if (selection !== null) await saveDraft(selection ?? material.id);
      }
      await saveQueue.current;
      return true;
    } catch (failure) {
      setError(`Draf belum tersimpan. ${failure.message}`);
      return false;
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function choose(item) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const source = await getMaterial(teacherId, item.id);
      await saveDraft(source.id);
      if (!alive.current) return;
      setMaterial(source);
      changeStage("parts");
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function generate() {
    if (working.current || !material) return;
    working.current = true;
    setBusy(true);
    setError("");
    let completed = false;
    const controller = new AbortController();
    generation.current = controller;
    try {
      const selection = material.file?.mime === "application/pdf" ? await picker.current?.apply() : material.id;
      if (selection === null) return;
      const selectedId = selection ?? material.id;
      await saveDraft(selectedId);
      const source = await getMaterial(teacherId, selectedId);
      if (source.extractionStatus !== "ready" || !source.text?.trim()) {
        throw new Error(source.extractionError === "SOURCE_TEXT_TOO_LONG" ? sourceTextLimitMessage : "Teks materi belum dapat dibaca. Pilih materi lain atau unggah teksnya.");
      }
      if (source.text.length > sourceTextLimit) throw new Error(sourceTextLimitMessage);
      setPreparation(null);
      setGenerating(true);
      let data = await generateMaterialMedia(teacherId, outputPath(format, source.id), material.parentId ?? material.id, format.id, { signal: controller.signal, onProgress: setPreparation });
      if (format.id === "song") {
        const deadline = Date.now() + 10 * 60_000;
        working.current = false;
        setBusy(false);
        while (songPending(data)) {
          if (Date.now() >= deadline) throw new Error("Lagu masih diproses. Lanjutkan melalui Draf.");
          await waitForSong(controller.signal);
          ({ data } = await studioRequest(teacherId, outputPath(format, source.id), { signal: controller.signal }));
        }
        if (data?.status !== "ready") throw new Error(data?.error ?? "Lagu belum berhasil dibuat. Coba lagi.");
      }
      if (format.id === "mindmap" && !resolveVisualModel(data)) throw new Error("Visual belum lengkap. Coba lagi.");
      if (!data || ((format.id === "reading" || format.id === "slides") && !data[format.id === "reading" ? "sections" : "slides"]?.length)) {
        throw new Error("Media belum lengkap. Coba lagi.");
      }
      if (!alive.current || controller.signal.aborted) return;
      await studioRequest(teacherId, draftPath, { method: "DELETE", body: { materialId: source.id } }).catch(() => {});
      if (!alive.current || controller.signal.aborted) return;
      completed = true;
      setBusy(true);
      closeModal(() => onComplete(source.id, { ...data, revision: source.revision }));
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) {
        setError(failure.message);
      }
    } finally {
      working.current = false;
      if (alive.current && !completed && !controller.signal.aborted) { setBusy(false); setGenerating(false); }
    }
  }
  const locked = busy || uploadBusy;
  const title = generating ? (preparation?.waiting ? "Menunggu layanan AI\u2026" : `Membuat ${format.action}\u2026${preparation ? ` ${preparation.completed}/${preparation.total}` : ""}`) : stage === "sources" ? "Pilih materi" : stage === "upload" ? "Unggah materi" : "Pilih bagian";
  const matches = items?.filter(item => item.title.toLocaleLowerCase("id").includes(query.toLocaleLowerCase("id")));
  return <Modal title={title} wide className="studio-create" onClose={onClose} beforeClose={beforeClose} dismissible={!locked}>
    <div className="studio-create-heading">
      {stage !== "sources" && !generating && <button type="button" className="icon-button" aria-label="Kembali ke pilihan materi" disabled={locked} onClick={() => changeStage("sources")}><ArrowLeft size={20} /></button>}
      <h2 className="studio-create-title" tabIndex={-1}>{title}</h2>
    </div>
    {stage === "sources" && <>
      <div className="studio-source-tools">
        <label className="studio-source-search"><Search size={20} aria-hidden="true" /><input aria-label="Cari nama materi" placeholder="Cari nama materi" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button type="button" className="source-secondary" disabled={locked} onClick={() => changeStage("upload")}><Upload size={18} aria-hidden="true" />Unggah</button>
      </div>
      {listError ? <div role="alert"><p>{listError}</p><button className="source-secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Coba lagi</button></div>
        : !items ? <LoadingSkeleton variant="list" label="Memuat materi" />
          : !matches.length ? <div className="studio-source-empty"><Mascot kind="book" /><p>{items.length ? "Materi tidak ditemukan" : "Belum ada materi"}</p></div>
            : <ul className="studio-source-list">{matches.map(item => <li key={item.id}><button type="button" aria-label={item.title} aria-describedby={`studio-source-${item.id}`} disabled={locked} onClick={() => choose(item)}>
              <span className="studio-source-file-icon" aria-hidden="true">{item.file?.mime === "application/pdf" ? <FileText size={26} /> : <BookOpenText size={26} />}</span>
              <span className="studio-source-copy"><strong>{item.title}</strong><span id={`studio-source-${item.id}`} className="studio-source-location"><Folder size={14} aria-hidden="true" />{folders.find(folder => folder.id === item.folderId)?.name ?? NO_SUBJECT_LABEL}<span aria-hidden="true">·</span>{item.file?.name ?? "Teks materi"}</span></span>
            </button></li>)}</ul>}
    </>}
    {stage === "upload" && <UploadMaterial teacherId={teacherId} embedded folders={folders} onBusyChange={setUploadBusy}
      onClose={() => changeStage("sources")} onSaved={async source => {
        setItems(current => [source, ...(current ?? [])]);
        setMaterial(source);
        try { await saveDraft(source.id); changeStage("parts"); }
        catch (failure) {
          void swapModalContent(() => { setStage("parts"); setError(`Draf belum tersimpan. ${failure.message}`); }, ".studio-create-title");
        }
      }} />}
    {stage === "parts" && material && <div hidden={generating} inert={generating}>
      <p className="studio-chosen-source"><FileText size={18} aria-hidden="true" />{material.title}</p>
      {material.file?.mime === "application/pdf" ? <SectionPicker key={material.id} ref={picker} teacherId={teacherId}
        parentId={material.parentId ?? material.id} current={material.parentId ? { first: material.pageStart, last: material.pageEnd, pages: material.sectionPages } : null}
        onChoose={saveDraft} onCreate={generate} creating={busy} actionLabel={`Buat ${format.action}`} />
        : <div className="source-actions"><button type="button" className="upload-button" disabled={busy} onClick={generate}>Buat {format.action}</button></div>}
    </div>}
    {generating && <div className="studio-generation" role="status"><Mascot kind="book" /><div className="studio-generation-bar" aria-hidden="true" /></div>}
    {error && <p className="source-error" role="alert">{error}</p>}
  </Modal>;
}

function StudioResult({ format, result, teacherId, materialId }) {
  const path = outputPath(format, materialId);
  if (format.id === "reading") return <MaterialReading reading={result} illustrationPath={`${path}/illustration`} />;
  if (format.id === "slides") return <MaterialSlides deck={result} teacherId={teacherId} illustrationsPath={`${path}/illustrations`} revision={result.revision} />;
  if (format.id === "song") return <MaterialSong song={result} teacherId={teacherId} songPath={path} revision={result.revision} />;
  return <MaterialProjector><MaterialVisual visual={result} /></MaterialProjector>;
}

export default function MediaStudio({ teacherId, feature = "reading", startCreating = false }) {
  const format = useMemo(() => mediaStudio(feature), [feature]);
  const resultHref = item => `${format.route}?hasil=${encodeURIComponent(item.materialId)}`;
  const router = useRouter();
  const search = useSearchParams();
  const resultId = search.get("hasil");
  const sourceId = search.get("materi");
  const [dialog, setDialog] = useState(startCreating);
  const [initial, setInitial] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [tab, setTab] = useState(search.get("tab") === "drafts" ? "drafts" : "history");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  const [resultFailure, setResultFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const resultError = resultFailure?.id === resultId && resultFailure.attempt === attempt ? resultFailure.message : "";
  const libraryKey = `${tab}:${filter}:${page}:${version}`;
  const visibleHistory = history?.key === libraryKey ? history.data : null;
  const counts = history?.data.counts;

  useEffect(() => {
    if (startCreating && new URL(window.location.href).searchParams.has("create")) {
      window.history.replaceState(null, "", format.route);
    }
  }, [startCreating, format.route]);
  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    getMaterial(teacherId, sourceId).then(async source => {
      const root = source.parentId ? await getMaterial(teacherId, source.parentId) : source;
      if (!active) return;
      setInitial({ ...source, file: root.file });
      setDialog(true);
      window.history.replaceState(null, "", format.route);
    }).catch(failure => { if (active) setHistoryError(failure.message); });
    return () => { active = false; };
  }, [teacherId, sourceId, format.route]);
  useEffect(() => {
    if (query.trim() === filter) return;
    const timer = setTimeout(() => { setFilter(query.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [query, filter]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ tab, q: filter, page: String(page) });
    studioRequest(teacherId, `/media/${format.id}/history?${params}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setHistory({ key: libraryKey, data }); setHistoryError(""); } })
      .catch(failure => { if (!controller.signal.aborted) setHistoryError(failure.message); });
    return () => controller.abort();
  }, [teacherId, libraryKey, tab, filter, page, format.id]);
  useEffect(() => {
    if (!resultId || result?.id === resultId) return;
    const controller = new AbortController();
    Promise.all([
      studioRequest(teacherId, outputPath(format, resultId), { signal: controller.signal }),
      getMaterial(teacherId, resultId),
    ]).then(async ([{ data }, source]) => {
        if (!data || (feature === "song" && data.status !== "ready") || (feature === "reading" && !data.sections?.length)
          || (feature === "slides" && !data.slides?.length) || (feature === "mindmap" && !resolveVisualModel(data))) {
          throw new Error("Media belum selesai. Lanjutkan melalui Draf.");
        }
        await preloadLessonImages(outputPath(format, resultId), data, controller.signal);
        if (!controller.signal.aborted) setResult({ id: resultId, data: { ...data, revision: source.revision } });
      }).catch(failure => { if (!controller.signal.aborted) setResultFailure({ id: resultId, attempt, message: failure.message }); });
    return () => controller.abort();
  }, [teacherId, resultId, result?.id, attempt, feature, format]);

  function create() { setInitial(null); setDialog(true); }
  function chooseTab(value) {
    setTab(value);
    setPage(1);
    setHistoryError("");
    if (!resultId) window.history.replaceState(null, "", format.route + (value === "drafts" ? "?tab=drafts" : ""));
  }
  async function openHistory(event, item) {
    if (item.status === "ready") return;
    event.preventDefault();
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setHistoryError("");
    try {
      const source = await getMaterial(teacherId, item.materialId);
      const root = source.parentId ? await getMaterial(teacherId, source.parentId) : source;
      setInitial({ ...source, file: root.file });
      setDialog(true);
    } catch (failure) { setHistoryError(failure.message); }
    finally { openingRef.current = false; setOpening(false); }
  }
  return <main id="main" className="media-studio material-page">
    <header className="media-studio-header">
      <Link className="material-return" href={resultId ? format.route : "/buat-media"}><ArrowLeft size={18} aria-hidden="true" />{resultId ? `Riwayat ${format.action}` : "Buat media"}</Link>
      <div><MaterialTabIcon kind={format.id} /><h1>{format.label}</h1></div>
    </header>
    <div className="material-panel">
      {resultId ? <>
        {resultError ? <div className="studio-result-error"><p role="alert">{resultError}</p><button type="button" className="source-secondary" onClick={() => setAttempt(value => value + 1)}>Coba lagi</button></div>
          : result?.id === resultId ? <StudioResult key={resultId} format={format} result={result.data} teacherId={teacherId} materialId={resultId} />
            : <LoadingSkeleton variant="lesson" label={`Memuat ${format.action}`} />}
      </> : <>
        <div className="studio-library-toolbar">
          <div className="studio-library-tabs" role="group" aria-label={`Daftar ${format.action}`}>
            {[["drafts", "Draf", FilePenLine], ["history", "Riwayat", History]].map(([value, label, TabIcon]) => <button key={value} type="button" aria-pressed={tab === value}
              onClick={() => chooseTab(value)}>
              <TabIcon size={18} aria-hidden="true" />{label}{counts && <span>{counts[value]}</span>}
            </button>)}
          </div>
          <button type="button" className="upload-button" onClick={create} disabled={opening}><Plus size={18} aria-hidden="true" />Buat {format.action}</button>
        </div>
        <label className="material-history-search"><Search size={20} aria-hidden="true" />
          <input aria-label={`Cari nama materi atau ${format.action}`} placeholder={`Cari nama materi atau ${format.action}`} value={query} maxLength={200} onChange={event => setQuery(event.target.value)} />
        </label>
        <MaterialMediaHistory format={format} history={visibleHistory} error={historyError} creating={opening} hideHeading
          listLabel={`${tab === "drafts" ? "Draf" : "Riwayat"} ${format.action}`}
          emptyLabel={filter ? `${format.label} tidak ditemukan` : `Belum ada ${tab === "drafts" ? "draf " : ""}${format.action}`}
          onOpen={openHistory} onRetry={() => setVersion(value => value + 1)} hrefFor={resultHref} resumeInDialog />
        {visibleHistory?.pages > 1 && <nav className="studio-library-pagination" aria-label={`Halaman daftar ${format.action}`}>
          <button type="button" className="icon-button" aria-label="Halaman sebelumnya" disabled={visibleHistory.page <= 1} onClick={() => setPage(visibleHistory.page - 1)}><ChevronLeft size={20} /></button>
          <span aria-live="polite">{visibleHistory.page} / {visibleHistory.pages}</span>
          <button type="button" className="icon-button" aria-label="Halaman berikutnya" disabled={visibleHistory.page >= visibleHistory.pages} onClick={() => setPage(visibleHistory.page + 1)}><ChevronRight size={20} /></button>
        </nav>}
      </>}
    </div>
    {dialog && <MediaSourceDialog teacherId={teacherId} format={format} initial={initial} onDraftSaved={() => { chooseTab("drafts"); setQuery(""); setFilter(""); setVersion(value => value + 1); }} onClose={() => { setDialog(false); setVersion(value => value + 1); }} onComplete={(id, data) => {
      setResult({ id, data });
      setDialog(false);
      setTab("history");
      setPage(1);
      setVersion(value => value + 1);
      router.push(`${format.route}?hasil=${encodeURIComponent(id)}`, { scroll: false });
    }} />}
  </main>;
}
