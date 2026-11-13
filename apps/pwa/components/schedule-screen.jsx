"use client";
import { Notification, useNotice } from "./ui";
import { Select } from "./ui";
import ActionConfirmation from "@imajilearn/shared/components/action-confirmation.jsx";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock3, FolderCog, PencilLine, Plus, Trash2 } from "lucide-react";
import { createId } from "@imajilearn/shared/lib/id.mjs";
import { listFolders } from "@imajilearn/shared/lib/materials.mjs";
import { studioRequest } from "@imajilearn/shared/lib/studio-api.mjs";
import { currentTerm, readSchedule, weekdays } from "../lib/schedule.mjs";
import { useSession } from "./session-gate";
import { Empty, ErrorState, Feedback, Loading, PageTitle, Sheet } from "./ui";
import FolderManager from "./folder-manager";

export default function ScheduleScreen() {
  const { id } = useSession();
  const [period, setPeriod] = useState(currentTerm), [data, setData] = useState(null), [folders, setFolders] = useState([]);
  const [day, setDay] = useState(() => Math.max(1, Math.min(6, new Date().getDay()))), [error, setError] = useState(""), [notice, setNotice] = useNotice();
  const [sheet, setSheet] = useState(null), [attempt, setAttempt] = useState(0);
  const valid = /^20\d{2}$/.test(String(period.year)) || String(period.year) === "2100";
  const key = `${period.year}-${period.semester}`, ready = data?.key === key;
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    Promise.all([readSchedule(id, period.year, period.semester, controller.signal), listFolders(id)]).then(([result, subjects]) => { if (!controller.signal.aborted) { setData(result.data); setFolders(subjects); setError(""); } }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [id, period.year, period.semester, valid, attempt]);
  const slots = (ready ? data.entries : []).filter(slot => slot.day === day).sort((a, b) => a.start.localeCompare(b.start));
  function saved(message) { setSheet(null); setNotice(message, message.includes("dihapus") ? "delete" : "success"); setAttempt(n => n + 1); }
  return <><PageTitle title="Jadwal" action={<div className="page-actions"><button className="icon-button" aria-label="Kelola mapel" title="Kelola mapel" onClick={() => setSheet({ type: "folders" })}><FolderCog size={21} /></button><button className="icon-button add-button" disabled={!ready || !valid || Boolean(error)} aria-label="Tambah jadwal" onClick={() => setSheet({ type: "edit", slot: { key: createId(), day, start: "07:00", end: "08:00", className: "", folderId: "" } })}><Plus size={24} /></button></div>} /><div className="term-controls"><label className="field">Tahun ajaran<input type="number" min={2000} max={2100} value={period.year} onChange={event => setPeriod({ ...period, year: event.target.value })} /></label><label className="field">Semester<Select value={period.semester} onChange={event => setPeriod({ ...period, semester: event.target.value })}><option value="1">Ganjil</option><option value="2">Genap</option></Select></label></div><div className="week-days" aria-label="Pilih hari">{weekdays.map((name, i) => <button key={name} aria-pressed={day === i + 1} onClick={() => setDay(i + 1)}>{name.slice(0, 3)}</button>)}</div><Notification notice={notice} onDismiss={() => setNotice("")} />{!valid ? <Feedback error>Isi tahun ajaran 2000–2100.</Feedback> : error ? <ErrorState message={error} onRetry={() => { setError(""); setAttempt(n => n + 1); }} /> : !ready ? <Loading variant="schedule" label="Memuat jadwal" /> : slots.length ? <div className="lesson-list">{slots.map(slot => <article className="lesson" key={slot.id}><div className="lesson-time"><Clock3 size={16} /><strong>{slot.start}</strong><small>{slot.end}</small></div><div className="lesson-copy"><span>Kelas {slot.className}</span><h3>{folders.find(folder => folder.id === slot.folderId)?.name || "Mapel tidak tersedia"}</h3><Link className="text-link" href={`/materi?folder=${slot.folderId}`}>Buka materi</Link><div className="lesson-actions"><button className="icon-button" aria-label={`Ubah jadwal ${slot.start}`} onClick={() => setSheet({ type: "edit", slot })}><PencilLine size={18} /></button><button className="icon-button danger-text" aria-label={`Hapus jadwal ${slot.start}`} onClick={() => setSheet({ type: "delete", slot })}><Trash2 size={18} /></button></div></div></article>)}</div> : <Empty title="Belum ada jadwal hari ini" />}{sheet?.type === "folders" && <FolderManager teacherId={id} folders={folders} onClose={() => setSheet(null)} onChange={next => { setFolders(next); setAttempt(n => n + 1); }} />}{sheet && sheet.type !== "folders" && <SlotForm teacherId={id} folders={folders} period={period} slot={sheet.slot} deleting={sheet.type === "delete"} onClose={() => setSheet(null)} onSaved={saved} />}</>;
}

function SlotForm({ teacherId, folders, period, slot, deleting, onClose, onSaved }) {
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), closeRef = useRef(null);
  async function submit(event) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const form = deleting ? null : Object.fromEntries(new FormData(event.currentTarget));
      const body = deleting ? undefined : { ...form, day: Number(form.day), ...(slot.id ? {} : { year: Number(period.year), semester: period.semester }) };
      await studioRequest(teacherId, `/schedule/slots${slot.id ? `/${slot.id}` : ""}`, { method: deleting ? "DELETE" : slot.id ? "PATCH" : "POST", version: slot.resourceVersion, key: slot.key, body });
      closeRef.current.close(() => onSaved(deleting ? "Jadwal dihapus." : "Jadwal disimpan."));
    } catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
  }
  if (deleting) return <Sheet closeRef={closeRef} title="Hapus jadwal?" confirmation busy={busy} onClose={onClose}>
    <ActionConfirmation mobile title="Hapus jam mengajar ini?" confirmLabel="Hapus jadwal" busy={busy} error={error}
      onCancel={onClose} onConfirm={submit}>
      <p>{weekdays[slot.day - 1]}, {slot.start}–{slot.end} · Kelas {slot.className}</p>
    </ActionConfirmation>
  </Sheet>;
  return <Sheet closeRef={closeRef} title={slot.id ? "Ubah jadwal" : "Tambah jadwal"} busy={busy} dirty={dirty} onClose={onClose}><form onSubmit={submit} onChange={() => setDirty(true)}><fieldset className="form-stack" disabled={busy}>{folders.length ? <label className="field">Mapel<Select name="folderId" defaultValue={slot.folderId} required><option value="">Pilih mapel</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select></label> : <label className="field">Mapel<input name="newSubject" required maxLength={80} /></label>}<label className="field">Kelas<input name="className" required maxLength={80} defaultValue={slot.className} placeholder="4A" /></label><label className="field">Hari<Select name="day" defaultValue={slot.day}>{weekdays.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</Select></label><div className="term-controls"><label className="field">Mulai<input type="time" name="start" required defaultValue={slot.start} /></label><label className="field">Selesai<input type="time" name="end" required defaultValue={slot.end} /></label></div><Feedback error>{error}</Feedback><button className="primary full" type="submit">{busy ? "Menyimpan…" : "Simpan jadwal"}</button></fieldset></form></Sheet>;
}
