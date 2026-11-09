"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardPenLine, Clock, FolderCog, PencilLine, Plus, Scissors, Trash2 } from "lucide-react";
import Modal, { closeModal } from "./modal";
import FolderManager from "./folder-manager";
import ThemedSelect from "./themed-select";
import Notice from "./notice";
import { Mascot } from "./mascot";
import AccountAvatar from "./account-avatar";
import LogoutButton from "./logout-button";
import { changeSchedule, listFolders, listSchedule } from "../lib/materials";
import "./teaching-schedule.css";

const weekdays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blank = () => ({ id: makeId(), folderId: "", className: "", day: 1, start: "07:00", end: "08:00" });

export default function TeachingSchedule({ teacherId }) {
  const [folders, setFolders] = useState([]), [terms, setTerms] = useState([]), [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false);
  const [year, setYear] = useState(""), [semester, setSemester] = useState("1");
  const [draft, setDraft] = useState(null), [deleting, setDeleting] = useState(null), [showFolders, setShowFolders] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    Promise.all([listFolders(teacherId), listSchedule(teacherId)]).then(([subjects, schedule]) => {
      if (!active) return;
      const today = new Date();
      setYear(String(today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear()));
      setSemester(today.getMonth() < 6 ? "2" : "1");
      setFolders(subjects); setTerms(schedule); setReady(true);
    }).catch(() => { if (active) { setLoadError(true); setReady(true); } });
    return () => { active = false; };
  }, [teacherId]);
  const validYear = /^20\d{2}$/.test(year) || year === "2100";
  const term = terms.find(item => item.key === `${year}-${semester}`);
  const entries = [...(term?.entries || [])].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  function edit(slot) { setError(""); setDraft({ ...slot, year: Number(year), semester }); }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { year: slotYear, semester: slotSemester, newSubject, ...slot } = draft;
      const { term: result, createdFolder } = await changeSchedule(teacherId, { year: slotYear, semester: slotSemester, slot, newSubject });
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
      const { term: result } = await changeSchedule(teacherId, { ...deleting, slot: { id: deleting.id }, remove: true });
      setTerms(current => [...current.filter(item => item.key !== result.key), result]);
      setDeleting(null); setNotice({ message: "Jadwal dihapus", type: "delete" });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <><a className="skip-link" href="#main">Lewati ke isi</a><header className="workspace-header"><div className="header-inner"><Link className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></Link><div className="account-actions"><AccountAvatar teacherId={teacherId} /><LogoutButton /></div></div></header>
    <main id="main" className="workspace-shell schedule-main"><nav className="studio-sections" aria-label="Navigasi studio"><Link href="/dashboard"><BookOpen size={20} />Materi</Link><Link href="/lkpd"><Scissors size={20} />LKPD</Link><Link href="/ujian"><ClipboardPenLine size={20} />Soal &amp; ujian</Link><Link href="/jadwal" aria-current="page"><CalendarDays size={20} />Jadwal</Link></nav>
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat jadwal"><span /><span /></div> : loadError ? <p role="alert">Jadwal tidak dapat dimuat. Periksa penyimpanan browser.</p> : <>
        <div className="schedule-page-heading"><h1>Jadwal mengajar</h1><div className="schedule-heading-actions"><button className="upload-button" type="button" disabled={!validYear} onClick={() => edit(blank())}><Plus size={20} />Tambah jadwal</button><Mascot kind="book" /></div></div>
        <div className="schedule-term-controls"><label className="schedule-field">Tahun ajaran<div className="school-year"><input aria-label="Awal tahun ajaran" type="number" min={2000} max={2100} required value={year} onChange={event => setYear(event.target.value)} /><span>/ {validYear ? Number(year) + 1 : "..."}</span></div></label><div className="schedule-field"><label htmlFor="schedule-semester">Semester</label><ThemedSelect id="schedule-semester" value={semester} onChange={event => setSemester(event.target.value)}><option value="1">Ganjil</option><option value="2">Genap</option></ThemedSelect></div><button className="schedule-text-button" type="button" onClick={() => setShowFolders(true)}><FolderCog size={18} />Kelola mapel</button></div>
        {!validYear ? <p className="source-error" role="alert">Isi tahun ajaran 2000–2100.</p> : entries.length ? <div className="schedule-days">{weekdays.map((day, index) => { const slots = entries.filter(slot => slot.day === index + 1); return slots.length > 0 && <section className="schedule-day" key={day}><h2>{day}</h2>{slots.map(slot => <article className="schedule-slot" key={slot.id}><p><Clock size={17} />{slot.start}–{slot.end}</p><Link href={`/dashboard?folder=${encodeURIComponent(slot.folderId)}`}>{folders.find(folder => folder.id === slot.folderId)?.name || "Mapel tidak tersedia"}</Link><span>Kelas {slot.className}</span><div><button className="icon-button" type="button" aria-label={`Ubah jadwal ${day} ${slot.start}`} title="Ubah jadwal" onClick={() => edit(slot)}><PencilLine size={18} /></button><button className="icon-button schedule-danger" type="button" aria-label={`Hapus jadwal ${day} ${slot.start}`} title="Hapus jadwal" onClick={() => { setError(""); setDeleting({ id: slot.id, year: Number(year), semester }); }}><Trash2 size={18} /></button></div></article>)}</section>; })}</div> : <div className="schedule-empty"><Mascot kind="correction" mood="calm" /><h2>Belum ada jadwal semester ini.</h2></div>}
      </>}
    </main>
    {showFolders && <FolderManager teacherId={teacherId} folders={folders} onClose={() => { setShowFolders(false); setNotice(null); }} onChange={setFolders} onNotice={setNotice} />}
    {draft && <Modal title="Jadwal mengajar" onClose={() => !busy && setDraft(null)}><form className="schedule-dialog" onSubmit={save}><h2>Jadwal mengajar</h2><div className="schedule-field"><label htmlFor="schedule-mapel">Mapel</label>{folders.length ? <ThemedSelect id="schedule-mapel" required value={draft.folderId} onChange={event => setDraft({ ...draft, folderId: event.target.value })}><option value="">Pilih mapel</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</ThemedSelect> : <input id="schedule-mapel" required maxLength={80} placeholder="Mis. Matematika" value={draft.newSubject || ""} onChange={event => setDraft({ ...draft, newSubject: event.target.value })} />}</div><label className="schedule-field">Kelas<input required maxLength={80} placeholder="4A" value={draft.className} onChange={event => setDraft({ ...draft, className: event.target.value })} /></label><div className="schedule-field"><label htmlFor="schedule-day">Hari</label><ThemedSelect id="schedule-day" value={draft.day} onChange={event => setDraft({ ...draft, day: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</ThemedSelect></div><div className="schedule-field-pair"><label className="schedule-field">Mulai<input type="time" required value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label><label className="schedule-field">Selesai<input type="time" required value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label></div>{error && <p className="source-error" role="alert">{error}</p>}<div className="source-actions"><button type="button" className="source-secondary" disabled={busy} onClick={() => closeModal(() => setDraft(null))}>Batal</button><button className="upload-button" disabled={busy}>Simpan jadwal</button></div></form></Modal>}
    {deleting && <Modal title="Hapus jadwal" onClose={() => !busy && setDeleting(null)}><div className="material-confirm"><Mascot kind="eraser" mood="think" /><h2>Hapus jam mengajar ini?</h2>{error && <p className="source-error" role="alert">{error}</p>}<div className="source-actions"><button className="source-secondary" disabled={busy} onClick={() => closeModal(() => setDeleting(null))}>Batal</button><button className="upload-button" disabled={busy} onClick={remove}>Hapus jadwal</button></div></div></Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} insideDialog={showFolders} />}
  </>;
}
