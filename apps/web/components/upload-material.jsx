"use client";
import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import Modal, { closeModal } from "./modal";
import ThemedSelect from "./themed-select";
import { Mascot } from "./mascot";
import { saveMaterial } from "../lib/materials";

export default function UploadMaterial({ onClose, onSaved, folders, initialFolder = "" }) {
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState(initialFolder);
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const input = useRef(null);
  const request = useRef(0);

  async function choose(next) {
    if (!next) return;
    const sequence = ++request.current;
    setFile(null);
    setReading(false);
    if (!/\.(pdf|txt)$/i.test(next.name)) { setError("Pilih file PDF atau TXT."); return; }
    if (!next.size || next.size > 10 * 1024 * 1024) { setError("File harus berisi materi dan maksimal 10 MB."); return; }
    setError("");
    setReading(true);
    try {
      if (/\.txt$/i.test(next.name)) {
        const body = await next.text();
        if (sequence !== request.current) return;
        if (!body.trim() || body.length > 40000) { setError("File teks harus berisi materi, maksimal 40.000 karakter."); return; }
        setText(body);
      } else setText("");
      setFile(next);
      setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 120));
    } catch { if (sequence === request.current) setError("File belum bisa dibaca. Coba pilih lagi."); }
    finally { if (sequence === request.current) setReading(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (saving || reading) return;
    if (!title.trim()) { setError("Isi judul materi terlebih dahulu."); return; }
    if (!file && !text.trim()) { setError("Pilih file atau masukkan teks materi."); return; }
    setSaving(true);
    setError("");
    try {
      const material = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: title.trim(), folderId, file, text: text.trim(), createdAt: Date.now() };
      await saveMaterial(material);
      onSaved(material);
    } catch { setError("Materi belum tersimpan. Periksa ruang penyimpanan browser dan coba lagi."); setSaving(false); }
  }
  return <Modal title="Unggah materi" onClose={onClose} wide>
    <form className="source-form" onSubmit={submit}>
      <div className="source-heading"><h2>Unggah materi</h2><Mascot kind="pen" mood="think" /></div>
      <div className="source-field source-folder-field"><label htmlFor="upload-folder">Mata pelajaran (opsional)</label><ThemedSelect id="upload-folder" value={folderId} onChange={event => setFolderId(event.target.value)}><option value="">Tanpa mata pelajaran</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</ThemedSelect></div>
      <div className="source-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files[0]); }}>
        {file ? <FileText size={30} /> : <Upload size={30} />}
        <div><strong>{file?.name || "Unggah bahan ajar"}</strong><p>{file ? "Siap disimpan" : "PDF atau TXT, maksimal 10 MB"}</p></div>
        <button className="source-secondary" type="button" onClick={() => input.current?.click()}>{file ? "Ganti file" : "Pilih file"}</button>
        <input ref={input} className="source-file-input" type="file" accept=".pdf,.txt" aria-label="Pilih file materi" onChange={e => { choose(e.target.files[0]); e.target.value = ""; }} />
      </div>
      <label className="source-field">Judul materi<input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Judul pelajaran Anda" /></label>
      <label className="source-field">Teks materi <span>(opsional jika memakai PDF)</span><textarea rows={3} value={text} onChange={e => setText(e.target.value)} maxLength={40000} placeholder="Atau tempelkan materi di sini…" /></label>
      <p className="source-storage">Materi disimpan di browser ini.</p>
      {error && <p className="source-error" role="alert">{error}</p>}
      <div className="source-actions"><button type="button" className="source-secondary" onClick={() => closeModal(onClose)} disabled={saving}>Batal</button><button className="upload-button" type="submit" disabled={saving || reading}>{saving ? "Menyimpan…" : reading ? "Membaca file…" : "Simpan materi"}</button></div>
    </form>
  </Modal>;
}
