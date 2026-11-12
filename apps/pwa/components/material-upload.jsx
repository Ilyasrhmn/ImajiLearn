"use client";
import { Select } from "./ui";
import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { NO_SUBJECT_LABEL, saveMaterial } from "@imajilearn/shared/lib/materials.mjs";
import { createId } from "@imajilearn/shared/lib/id.mjs";
import { Feedback, Sheet } from "./ui";

export default function MaterialUpload({ teacherId, folders, folderId, onClose, onSaved }) {
  const [title, setTitle] = useState(""), [text, setText] = useState(""), [folder, setFolder] = useState(folderId);
  const [file, setFile] = useState(null), [reading, setReading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const input = useRef(null), closeRef = useRef(null), sequence = useRef(0), lock = useRef(false), retry = useRef(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function choose(next) {
    if (!next || lock.current || reading) return;
    const id = ++sequence.current; setError("");
    if (!/\.(pdf|txt)$/i.test(next.name) || !next.size || next.size > 10 * 1024 * 1024) { setError("Pilih PDF atau TXT berisi materi, maksimal 10 MB."); return; }
    setReading(true);
    try {
      let value = "";
      if (/\.txt$/i.test(next.name)) { value = await next.text(); if (!value.trim() || value.length > 40000) throw new Error("Teks harus berisi materi, maksimal 40.000 karakter."); }
      if (id !== sequence.current || !mounted.current) return;
      setFile(next); setText(value); setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 120));
    } catch (err) { if (id === sequence.current && mounted.current) setError(err.message); }
    finally { if (id === sequence.current && mounted.current) setReading(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (lock.current || reading) return;
    if (!file && !text.trim()) { setError("Pilih file atau isi teks materi."); return; }
    lock.current = true; setBusy(true); setError("");
    const item = { title: title.trim(), text, file, folderId: folder };
    const key = retry.current && Object.keys(item).every(field => item[field] === retry.current.item[field]) ? retry.current.key : createId();
    retry.current = { key, item };
    try { const saved = await saveMaterial(teacherId, item, key); if (mounted.current) closeRef.current.close(() => onSaved(saved)); }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const dirty = Boolean(file || title || text || folder !== folderId);
  return <Sheet closeRef={closeRef} title="Tambah materi" onClose={onClose} busy={busy || reading} dirty={dirty}><form onSubmit={submit}><fieldset className="form-stack" disabled={busy || reading}><div className="upload-area" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}><button className="upload-picker" type="button" aria-label={file ? "Ganti file materi" : "Pilih file materi"} onClick={() => input.current?.click()}>{file ? <FileText size={30} aria-hidden="true" /> : <Upload size={30} aria-hidden="true" />}<strong>{file?.name || "PDF atau TXT"}</strong><small>Maksimal 10 MB</small></button><input ref={input} hidden type="file" accept=".pdf,.txt" aria-label="Pilih file materi" onChange={event => { choose(event.target.files[0]); event.target.value = ""; }} />{file && <button className="text-link" type="button" onClick={() => setFile(null)}><X size={16} />Lepas file</button>}</div><label className="field">Judul<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={120} pattern=".*\S.*" /></label><label className="field">Mapel<Select value={folder} onChange={event => setFolder(event.target.value)}><option value="">{NO_SUBJECT_LABEL}</option>{folders.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></label><label className="field">Teks materi{file && /\.pdf$/i.test(file.name) && <small>Opsional. Isi untuk mengganti teks hasil ekstraksi.</small>}<textarea value={text} onChange={event => setText(event.target.value)} rows={5} maxLength={40000} required={!file} /></label><Feedback error>{error}</Feedback><button className="primary full" type="submit">{busy ? "Menyimpan…" : reading ? "Membaca file…" : "Simpan materi"}</button></fieldset></form></Sheet>;
}
