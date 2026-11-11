"use client";
import { teacherStorageKey } from "../lib/teacher-storage.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, LoaderCircle, Scissors, Trash2, X } from "lucide-react";
import { Mascot } from "./mascot";
import ThemedSelect from "./themed-select";
import Modal, { closeModal } from "./modal";
import ActionConfirmation from "./action-confirmation";
import Notice from "./notice";
import { TemplateShape } from "./lkpd-shapes";
import LkpdViewer from "./lkpd-viewer";
import LkpdPreflight from "./lkpd-preflight";
import { NO_SUBJECT_LABEL, getMaterial, listFolders, listMaterials } from "../lib/materials.mjs";
import { PROFILE_KEY, readProfile } from "../lib/teacher-profile.mjs";
import { LKPD_KEY, LKPD_LIMIT, lkpdTemplates, makeLkpdRequest, createLkpd, parseLkpds } from "../lib/lkpd.mjs";
import { generateLkpd } from "../lib/lkpd-service.mjs";
import "./lkpd.css";

export default function LkpdStudio({ teacherId, Frame, materialsHref = "/dashboard", onNavigationBlock, teacherProfile }) {
  const [materials, setMaterials] = useState([]), [folders, setFolders] = useState([]), [documents, setDocuments] = useState([]);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false), [profile, setProfile] = useState(() => readProfile(null));
  const [folder, setFolder] = useState("all"), [sourceId, setSourceId] = useState(""), [templateId, setTemplateId] = useState("");
  const [openedId, setOpenedId] = useState(null), [deleteId, setDeleteId] = useState(null), [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false), [candidate, setCandidate] = useState(null), [saved, setSaved] = useState(true);
  const pending = useRef(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => { onNavigationBlock?.(busy); return () => onNavigationBlock?.(false); }, [busy, onNavigationBlock]);
  useEffect(() => {
    let active = true;
    const receive = event => setNotice(event.detail);
    window.addEventListener("lkpd-notice", receive);
    Promise.all([listMaterials(teacherId), listFolders(teacherId)]).then(([items, subjects]) => {
      if (!active) return;
      const sources = items.filter(item => !item.archived);
      setMaterials(sources); setFolders(subjects);
      const query = new URLSearchParams(location.search);
      const selected = sources.find(item => item.id === query.get("material"));
      setSourceId(selected?.id || (sources.length === 1 ? sources[0].id : ""));
      setDocuments(parseLkpds(localStorage.getItem(teacherStorageKey(teacherId, LKPD_KEY)))); setProfile(teacherProfile || readProfile(localStorage.getItem(teacherStorageKey(teacherId, PROFILE_KEY))));
      setReady(true);
    }).catch(() => { if (active) { setLoadError(true); setReady(true); } });
    return () => { active = false; pending.current?.abort(); window.removeEventListener("lkpd-notice", receive); };
  }, [teacherId, teacherProfile]);
  const matches = material => folder === "all" || (folder === "unfiled" ? !material.folderId : material.folderId === folder);
  function cancel() { pending.current?.abort(); pending.current = null; setCandidate(null); setBusy(false); }
  function persist(next) {
    try { localStorage.setItem(teacherStorageKey(teacherId, LKPD_KEY), JSON.stringify(next)); setDocuments(next); setSaved(true); return true; }
    catch { setSaved(false); setNotice({ message: "LKPD belum tersimpan. Periksa penyimpanan browser.", type: "error" }); return false; }
  }
  function open(id) { cancel(); setOpenedId(id); window.scrollTo({ top: 0 }); }
  async function generate() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true);
    let awaiting = false;
    try {
      const source = await getMaterial(teacherId, sourceId);
      if (pending.current !== controller || controller.signal.aborted) return;
      const request = makeLkpdRequest(source ? { ...source, fileName: source.file?.name || "" } : source, templateId, profile.grade);
      const cached = documents.find(item => item.cacheKey === request.cacheKey);
      if (cached) { open(cached.id); return; }
      if (documents.length >= LKPD_LIMIT) throw new Error("Penyimpanan LKPD penuh. Hapus satu LKPD terlebih dahulu.");
      const result = await generateLkpd(request, { signal: controller.signal });
      if (pending.current !== controller || controller.signal.aborted) return;
      const next = createLkpd(request, result); awaiting = true; setCandidate({ document: next, controller });
    } catch (error) { if (!controller.signal.aborted && pending.current === controller) setNotice({ message: error.message || "LKPD belum berhasil dibuat. Coba lagi.", type: "error" }); }
    finally { if (pending.current === controller && !awaiting) { pending.current = null; setBusy(false); } }
  }
  function finishCandidate(error) {
    if (!candidate || pending.current !== candidate.controller || candidate.controller.signal.aborted) return;
    if (error) { cancel(); setNotice({ message: error, type: "error" }); return; }
    const next = candidate.document;
    if (persist([next, ...documents])) { cancel(); setOpenedId(next.id); window.scrollTo({ top: 0 }); } else cancel();
  }
  const opened = documents.find(item => item.id === openedId);
  return <>
    <Frame teacherId={teacherId}>
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat LKPD"><span /><span /></div> : loadError ? <p role="alert">Materi tidak dapat dimuat. Periksa penyimpanan browser.</p> : opened ? <LkpdViewer onNavigationBlock={onNavigationBlock} key={opened.id} document={opened} saved={saved} onBack={() => open(null)} onChange={next => persist(documents.map(item => item.id === next.id ? { ...next, updatedAt: new Date().toISOString() } : item))} /> : <>
        <div className="lkpd-heading"><h1>LKPD</h1><Mascot kind="pencil" mood="think" /></div>
        {materials.length ? <><div className="lkpd-subject-filter"><ThemedSelect aria-label="Filter mapel LKPD" value={folder} onChange={event => { const value = event.target.value; cancel(); setFolder(value); const current = materials.find(item => item.id === sourceId); if (current && !(value === "all" || (value === "unfiled" ? !current.folderId : current.folderId === value))) setSourceId(""); }}><option value="all">Semua mapel</option><option value="unfiled">{NO_SUBJECT_LABEL}</option>{folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</ThemedSelect></div>
          <div className="lkpd-source-picker"><label htmlFor="lkpd-source">Materi</label><ThemedSelect id="lkpd-source" value={sourceId} onChange={event => { cancel(); setSourceId(event.target.value); }}><option value="">Pilih materi</option>{materials.filter(matches).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</ThemedSelect></div>
          <fieldset className="lkpd-template-picker"><legend>Pilih aktivitas</legend><div className="lkpd-template-grid">{lkpdTemplates.map(template => <button type="button" key={template.id} className="lkpd-template-choice" aria-pressed={templateId === template.id} onClick={() => { cancel(); setTemplateId(template.id); }}><TemplateShape type={template.id} /><span>{template.label}</span><Check className="lkpd-template-check" size={19} aria-hidden="true" /></button>)}</div></fieldset>
          <div className="lkpd-create-actions"><button className="button" disabled={!sourceId || !templateId || busy} onClick={generate}>{busy ? <LoaderCircle className="lkpd-spinner" size={20} /> : <Scissors size={20} />}{busy ? "Membuat LKPD..." : "Buat LKPD"}</button>{busy && <button className="text-button" onClick={cancel}><X size={18} />Batalkan</button>}</div></> : <div className="lkpd-empty"><Mascot kind="correction" mood="calm" /><div><h2>Belum ada materi.</h2><Link className="button" href={materialsHref}>Pilih bahan ajar<ArrowRight size={19} /></Link></div></div>}
        {documents.length > 0 && <section className="lkpd-library"><h2>LKPD tersimpan</h2><div className="lkpd-library-list">{documents.map(doc => <article className="lkpd-library-item" key={doc.id}><button className="lkpd-open-document" onClick={() => open(doc.id)}><FileText size={24} /><span><strong>{doc.content.title}</strong><span>{lkpdTemplates.find(template => template.id === doc.templateId)?.label}</span></span><ArrowRight size={20} /></button><button className="icon-button danger" aria-label={`Hapus ${doc.content.title}`} onClick={() => setDeleteId(doc.id)}><Trash2 size={20} /></button></article>)}</div></section>}
      </>}
    </Frame>
    {candidate && <LkpdPreflight document={candidate.document} signal={candidate.controller.signal} onChecked={finishCandidate} />}
    {deleteId && <Modal title="Hapus LKPD" className="action-confirmation-dialog" onClose={() => setDeleteId(null)}>
      <ActionConfirmation title="Hapus LKPD ini?" confirmLabel="Hapus LKPD" onCancel={() => closeModal(() => setDeleteId(null))}
        onConfirm={() => { if (persist(documents.filter(item => item.id !== deleteId))) { setDeleteId(null); setNotice({ message: "LKPD dihapus", type: "delete" }); } }}>
        <p>Lembar anak dan panduan guru akan dihapus dari perangkat ini.</p>
      </ActionConfirmation>
    </Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} />}
  </>;
}
