"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { BookOpen, Check, Download, GitBranch, Music2, Presentation, Scissors } from "lucide-react";
import { downloadMaterial, updateMaterial } from "@imajilearn/shared/lib/materials.mjs";
import { Feedback, Sheet } from "./ui";

const formats = [{ id: "reading", label: "Bacaan bergambar", Icon: BookOpen }, { id: "mindmap", label: "Peta konsep", Icon: GitBranch }, { id: "slides", label: "Slide", Icon: Presentation }, { id: "song", label: "Lagu belajar", Icon: Music2 }];
const songs = [{ id: "balonku", label: "Balonku Ada Lima" }, { id: "cicak_dinding", label: "Cicak-Cicak di Dinding" }, { id: "potong_bebek", label: "Potong Bebek Angsa" }];
export default function MaterialDetail({ teacherId, item, onClose, onSaved }) {
  const [selected, setSelected] = useState(item.selectedMedia || []), [song, setSong] = useState(item.songTemplateId || "balonku");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const lock = useRef(false), closeRef = useRef(null);
  const dirty = JSON.stringify(selected) !== JSON.stringify(item.selectedMedia || []) || song !== (item.songTemplateId || "balonku");
  async function save(event) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const updated = await updateMaterial(teacherId, item, { selectedMedia: selected, songTemplateId: song }); closeRef.current.close(() => onSaved(updated)); }
    catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
  }
  async function download() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const blob = await downloadMaterial(teacherId, item.id); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = item.file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
  }
  return <Sheet closeRef={closeRef} title="Detail materi" onClose={onClose} busy={busy} dirty={dirty}><h3 className="detail-title">{item.title}</h3><p className="meta">{item.file?.name || "Teks materi"}</p>{item.extractionStatus === "failed" && <Feedback error>Teks file belum terbaca. Unggah ulang dengan teks materi untuk menggunakannya.</Feedback>}{item.archived ? <p className="section">Pulihkan materi untuk memilih media.</p> : <form onSubmit={save}><fieldset disabled={busy}><legend className="media-legend">Media belajar</legend><div className="media-options">{formats.map(({ id, label, Icon }) => <label key={id} className="media-choice"><input type="checkbox" checked={selected.includes(id)} onChange={() => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id])} /><Icon size={20} /><span>{label}</span></label>)}</div><button type="button" className="text-link" onClick={() => setSelected(selected.length === formats.length ? [] : formats.map(row => row.id))}>{selected.length === formats.length ? "Batalkan semua" : "Pilih semua"}</button>{selected.includes("song") && <label className="field">Template lagu<select value={song} onChange={event => setSong(event.target.value)}>{songs.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>}<div className="detail-buttons"><button className="primary full" type="submit"><Check size={18} />{busy ? "Menyimpan…" : "Simpan pilihan"}</button>{!dirty && <Link className="secondary" href={`/lkpd?material=${encodeURIComponent(item.id)}`}><Scissors size={18} />Buat LKPD</Link>}</div></fieldset></form>}{item.file && <button className="download-button full section" disabled={busy} onClick={download}><Download size={18} />Unduh sumber</button>}<Feedback error>{error}</Feedback>{item.text && <details className="detail-source"><summary>Teks sumber</summary><p className="source-text">{item.text}</p></details>}</Sheet>;
}
