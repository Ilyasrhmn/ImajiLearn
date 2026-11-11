"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, FolderCog, PencilLine, Plus, Trash2 } from "lucide-react";
import Modal, { closeModal } from "./modal";
import ActionConfirmation from "@imajilearn/shared/components/action-confirmation.jsx";
import FolderManager from "./folder-manager";
import ThemedSelect from "./themed-select";
import Notice from "./notice";
import TeacherWorkspace from "./teacher-workspace";
import { Mascot } from "./mascot";
import { listFolders } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";
import "./teaching-schedule.css";

const weekdays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blank = () => ({ key: makeId(), folderId: "", className: "", day: 1, start: "07:00", end: "08:00" });

export default function TeachingSchedule({ teacherId, name }) {
  const [folders, setFolders] = useState([]), [terms, setTerms] = useState([]), [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false);
  const [year, setYear] = useState(""), [semester, setSemester] = useState("1");
  const [draft, setDraft] = useState(null), [deleting, setDeleting] = useState(null), [showFolders, setShowFolders] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const [termError, setTermError] = useState("");
  const openedFromHome = useRef(false);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    listFolders(teacherId).then(subjects => {
      if (!active) return;
      const today = new Date();
      setYear(String(today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear()));
      setSemester(today.getMonth() < 6 ? "2" : "1");
      setFolders(subjects); setReady(true);
    }).catch(() => { if (active) { setLoadError(true); setReady(true); } });
    return () => { active = false; };
  }, [teacherId]);
  const validYear = /^20\d{2}$/.test(year) || year === "2100";
  useEffect(() => {
    if (!validYear) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ year, semester });
    studioRequest(teacherId, `/schedule?${query}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setTermError("");
      setTerms(current => [...current.filter(item => item.key !== data.key), data]);
      const url = new URL(window.location.href);
      if (!openedFromHome.current && url.searchParams.get("baru") === "1") {
        openedFromHome.current = true;
        url.searchParams.delete("baru");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setDraft({ ...blank(), year: Number(year), semester });
      }
    }).catch(error => {
      if (!controller.signal.aborted) setTermError(error.message);
    });
    return () => controller.abort();
  }, [teacherId, validYear, year, semester]);
  const term = terms.find(item => item.key === `${year}-${semester}`);
  const entries = [...(term?.entries || [])].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  function edit(slot) { setError(""); setDraft({ ...slot, year: Number(year), semester }); }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { id, key, resourceVersion, year: slotYear, semester: slotSemester, newSubject, folderId, ...slot } = draft;
      let result, createdFolder;
      if (id) {
        const { data } = await studioRequest(teacherId, `/schedule/slots/${id}`,
          { method: "PATCH", version: resourceVersion, body: { ...slot, folderId } });
        result = data;
      } else {
        const { data } = await studioRequest(teacherId, "/schedule/slots", {
          method: "POST", key,
          body: { ...slot, year: slotYear, semester: slotSemester, ...(folderId ? { folderId } : { newSubject }) },
        });
        ({ term: result, createdFolder } = data);
      }
      setTerms(current => [...current.filter(item => item.key !== result.key), result]);
      if (createdFolder) setFolders(current => [...current, createdFolder]);
      setDraft(null); setNotice({ message: "Jadwal disimpan", type: "success" });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !deleting) return;
    setBusy(true); setError("");
    try {
      await studioRequest(teacherId, `/schedule/slots/${deleting.id}`, { method: "DELETE", version: deleting.resourceVersion });
      setTerms(current => current.map(item => item.key === deleting.termKey
        ? { ...item, entries: item.entries.filter(slot => slot.id !== deleting.id) } : item));
      setDeleting(null); setNotice({ message: "Jadwal dihapus", type: "delete" });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <TeacherWorkspace name={name} current="/jadwal">
    <main id="main" className="teacher-home schedule-main">
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat jadwal"><span /><span /></div> : loadError ? <p role="alert">Jadwal tidak dapat dimuat. Muat ulang untuk mencoba lagi.</p> : <>
        <div className="schedule-page-heading"><h1>Jadwal mengajar</h1><div className="schedule-heading-actions"><button className="upload-button" type="button" disabled={!validYear || !term || Boolean(termError)} onClick={() => edit(blank())}><Plus size={20} />Tambah jadwal</button><Mascot kind="book" /></div></div>
        <div className="schedule-term-controls"><label className="schedule-field">Tahun ajaran<div className="school-year"><input aria-label="Awal tahun ajaran" type="number" min={2000} max={2100} required value={year} onChange={event => setYear(event.target.value)} /><span>/ {validYear ? Number(year) + 1 : "..."}</span></div></label><div className="schedule-field"><label htmlFor="schedule-semester">Semester</label><ThemedSelect id="schedule-semester" value={semester} onChange={event => setSemester(event.target.value)}><option value="1">Ganjil</option><option value="2">Genap</option></ThemedSelect></div><button className="schedule-text-button" type="button" onClick={() => setShowFolders(true)}><FolderCog size={18} />Kelola mapel</button></div>
        {!validYear ? <p className="source-error" role="alert">Isi tahun ajaran 2000–2100.</p> : termError ? <p role="alert">{termError}</p> : !term ? <div className="materials-skeleton" role="status" aria-label="Memuat semester"><span /><span /></div> : entries.length ? <div className="schedule-days">{weekdays.map((day, index) => { const slots = entries.filter(slot => slot.day === index + 1); return slots.length > 0 && <section className="schedule-day" key={day}><h2>{day}</h2>{slots.map(slot => <article className="schedule-slot" key={slot.id}><p><Clock size={17} />{slot.start}–{slot.end}</p><Link href={`/buat-media?folder=${encodeURIComponent(slot.folderId)}#materi`}>{folders.find(folder => folder.id === slot.folderId)?.name || "Mapel tidak tersedia"}</Link><span>Kelas {slot.className}</span><div><button className="icon-button" type="button" aria-label={`Ubah jadwal ${day} ${slot.start}`} title="Ubah jadwal" onClick={() => edit(slot)}><PencilLine size={18} /></button><button className="icon-button schedule-danger" type="button" aria-label={`Hapus jadwal ${day} ${slot.start}`} title="Hapus jadwal" onClick={() => { setError(""); setDeleting({ ...slot, termKey: term.key }); }}><Trash2 size={18} /></button></div></article>)}</section>; })}</div> : <div className="schedule-empty"><Mascot kind="correction" mood="calm" /><h2>Belum ada jadwal semester ini.</h2></div>}
      </>}
    </main>
    {showFolders && <FolderManager teacherId={teacherId} folders={folders} onClose={() => { setShowFolders(false); setNotice(null); }} onChange={setFolders} onNotice={setNotice} />}
    {draft && <Modal title="Jadwal mengajar" onClose={() => !busy && setDraft(null)}><form className="schedule-dialog" onSubmit={save}><h2>Jadwal mengajar</h2><div className="schedule-field"><label htmlFor="schedule-mapel">Mapel</label>{folders.length ? <ThemedSelect id="schedule-mapel" required value={draft.folderId} onChange={event => setDraft({ ...draft, folderId: event.target.value })}><option value="">Pilih mapel</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</ThemedSelect> : <input id="schedule-mapel" required maxLength={80} placeholder="Mis. Matematika" value={draft.newSubject || ""} onChange={event => setDraft({ ...draft, newSubject: event.target.value })} />}</div><label className="schedule-field">Kelas<input required maxLength={80} placeholder="4A" value={draft.className} onChange={event => setDraft({ ...draft, className: event.target.value })} /></label><div className="schedule-field"><label htmlFor="schedule-day">Hari</label><ThemedSelect id="schedule-day" value={draft.day} onChange={event => setDraft({ ...draft, day: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</ThemedSelect></div><div className="schedule-field-pair"><label className="schedule-field">Mulai<input type="time" required value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label><label className="schedule-field">Selesai<input type="time" required value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label></div>{error && <p className="source-error" role="alert">{error}</p>}<div className="source-actions"><button type="button" className="source-secondary" disabled={busy} onClick={() => closeModal(() => setDraft(null))}>Batal</button><button className="upload-button" disabled={busy}>Simpan jadwal</button></div></form></Modal>}
    {deleting && <Modal title="Hapus jadwal" className="action-confirmation-dialog" dismissible={!busy} onClose={() => setDeleting(null)}>
      <ActionConfirmation title="Hapus jam mengajar ini?" confirmLabel="Hapus jadwal" busy={busy} error={error}
        onCancel={() => closeModal(() => setDeleting(null))} onConfirm={remove}>
        <p>{weekdays[deleting.day - 1]}, {deleting.start}–{deleting.end} · Kelas {deleting.className}</p>
      </ActionConfirmation>
    </Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} insideDialog={showFolders} />}
  </TeacherWorkspace>;
}
