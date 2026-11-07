"use client";
import { useState } from "react";
import { BookOpen, Check, FileText, GitBranch, Music2, Presentation } from "lucide-react";
import Modal, { closeModal } from "./modal";
import Disclosure from "./disclosure";
import { updateMaterial } from "../lib/materials";

const formats = [
  { id: "reading", label: "Bacaan bergambar", description: "Baca dan tanya jawab bersama.", Icon: BookOpen },
  { id: "mindmap", label: "Peta konsep", description: "Lihat hubungan antaride.", Icon: GitBranch },
  { id: "slides", label: "Slide", description: "Jelaskan satu per satu.", Icon: Presentation },
  { id: "song", label: "Lagu belajar", description: "Nyanyikan materi bersama kelas.", Icon: Music2 },
];
const songs = [
  { id: "balonku", title: "Balonku Ada Lima" },
  { id: "cicak_dinding", title: "Cicak-Cicak di Dinding" },
  { id: "potong_bebek", title: "Potong Bebek Angsa" },
];

export default function MaterialDetail({ material, onClose, onSaved }) {
  const [selected, setSelected] = useState(() => Array.isArray(material.selectedMedia) ? material.selectedMedia.filter(id => formats.some(format => format.id === id)) : []);
  const [song, setSong] = useState(() => songs.some(item => item.id === material.songTemplateId) ? material.songTemplateId : "balonku");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const updated = await updateMaterial(material.id, { selectedMedia: selected, songTemplateId: song });
      onSaved(updated);
    } catch { setError("Pilihan belum tersimpan. Coba lagi."); setBusy(false); }
  }
  function downloadFile() {
    const url = URL.createObjectURL(material.file);
    const link = document.createElement("a");
    link.href = url; link.download = material.file.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <Modal title={material.title} onClose={onClose} wide>
    <div className="format-detail">
      <h2>{material.title}</h2>
      <p className="format-filename">{material.file?.name || "Teks materi"}</p>
      {material.archived ? <p className="format-archive">Pulihkan materi untuk memilih media.</p> : <>
        <fieldset className="format-fieldset"><legend>Mau dibuat menjadi apa?</legend>
          <div className="format-choices">{formats.map(({ id, label, description, Icon }) => <label key={id} className={`format-choice${selected.includes(id) ? " selected" : ""}`}><input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} /><Icon size={26} aria-hidden="true" /><strong>{label}</strong><span>{description}</span>{selected.includes(id) && <Check className="format-check" size={20} aria-hidden="true" />}</label>)}</div>
        </fieldset>
        <div className="song-settings" data-open={selected.includes("song")} inert={!selected.includes("song")} aria-hidden={!selected.includes("song")}><div><fieldset><legend>Pakai lagu yang mana?</legend><div className="song-options">{songs.map(item => <label className={`song-option${song === item.id ? " selected" : ""}`} key={item.id}><input type="radio" name="song" checked={song === item.id} onChange={() => setSong(item.id)} /><span>{item.title}</span></label>)}</div></fieldset></div></div>
        {error && <p className="source-error" role="alert">{error}</p>}
        <div className="media-selection-actions"><button type="button" className="format-select-all" onClick={() => setSelected(selected.length === formats.length ? [] : formats.map(format => format.id))}>{selected.length === formats.length ? "Batalkan semua" : "Pilih semua"}</button><button type="button" className="upload-button" onClick={save} disabled={busy}>{busy ? "Menyimpan..." : "Simpan pilihan"}<Check size={18} aria-hidden="true" /></button></div>
      </>}
      {material.file && <button type="button" className="source-secondary format-source-file" onClick={downloadFile}><FileText size={19} aria-hidden="true" />{material.file.name}</button>}
      {material.text && <Disclosure title="Lihat teks sumber"><p className="format-source-text">{material.text}</p></Disclosure>}
      <button className="format-cancel" type="button" onClick={() => closeModal(onClose)}>Tutup</button>
    </div>
  </Modal>;
}
