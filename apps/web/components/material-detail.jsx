"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Download, Music2, Scissors } from "lucide-react";
import Modal, { swapModalContent } from "./modal";
import Disclosure from "./disclosure";
import Icon from "./icon";
import MaterialReading from "./material-reading";
import { downloadMaterial, updateMaterial } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";
import "./material-detail.css";

export const formats = [
  { id: "reading", label: "Bacaan bergambar", description: "Baca dan tanya jawab bersama.", icon: "book" },
  { id: "mindmap", label: "Peta konsep", description: "Lihat hubungan antaride.", icon: "map" },
  { id: "slides", label: "Slide", description: "Jelaskan satu per satu.", icon: "slides" },
  { id: "song", label: "Lagu belajar", description: "Nyanyikan materi bersama kelas." },
];
const songs = [
  { id: "balonku", title: "Balonku Ada Lima" },
  { id: "cicak_dinding", title: "Cicak-Cicak di Dinding" },
  { id: "potong_bebek", title: "Potong Bebek Angsa" },
];

export default function MaterialDetail({ teacherId, material, onClose, onSaved }) {
  const [selected, setSelected] = useState(() => Array.isArray(material.selectedMedia) ? material.selectedMedia.filter(id => formats.some(format => format.id === id)) : []);
  const [song, setSong] = useState(() => songs.some(item => item.id === material.songTemplateId) ? material.songTemplateId : "balonku");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(undefined);
  const [readingOpen, setReadingOpen] = useState(false);
  const detail = useRef(null);
  const working = useRef(false);
  const canRead = !material.archived && material.extractionStatus === "ready";
  const readingPath = "/materials/" + encodeURIComponent(material.id) + "/reading";

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    studioRequest(teacherId, readingPath, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setReading(data); })
      .catch(() => { if (!controller.signal.aborted) setReading(null); });
    return () => controller.abort();
  }, [canRead, readingPath, teacherId]);

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  async function openReading() {
    if (working.current || !canRead || (!reading && !selected.includes("reading"))) return;
    working.current = true;
    setBusy(true); setError("");
    try {
      const previous = material.selectedMedia ?? [];
      if (previous.length !== selected.length || selected.some(id => !previous.includes(id)) ||
          song !== (material.songTemplateId ?? "balonku")) {
        onSaved(await updateMaterial(teacherId, material, { selectedMedia: selected, songTemplateId: song }));
      }
      const result = reading ?? (await studioRequest(teacherId, readingPath, { method: "POST" })).data;
      if (detail.current?.isConnected) {
        setReading(result);
        await swapModalContent(() => setReadingOpen(true), "[data-reading-heading]");
      }
    } catch (error) { setError(error.message); }
    finally { working.current = false; setBusy(false); }
  }
  async function downloadFile() {
    try {
      const url = URL.createObjectURL(await downloadMaterial(teacherId, material.id));
      const link = document.createElement("a");
      link.href = url; link.download = material.file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setError(error.message);
    }
  }
  return <Modal title={material.title} onClose={onClose} wide className="material-detail-modal">
    {readingOpen ? <MaterialReading reading={reading} onBack={() => swapModalContent(() => setReadingOpen(false), "[data-reading-action]")} /> :
    <div className="format-detail" ref={detail}>
      <h2>{material.title}</h2>
      {material.file ? (
        <button className="format-filename material-source-download" type="button" onClick={downloadFile} aria-label={`Unduh ${material.file.name}`}>
          <span>{material.file.name}</span><Download size={16} aria-hidden="true" />
        </button>
      ) : <p className="format-filename">Materi teks</p>}
      {material.archived ? <p className="format-archive">Pulihkan materi untuk memilih media.</p> : <>
        <fieldset className="format-fieldset" disabled={busy}><legend>Mau dibuat menjadi apa?</legend>
          <div className="format-choices">
            {formats.map(({ id, label, description, icon }) => (
              <label key={id} className={`format-choice${selected.includes(id) ? " selected" : ""}`}>
                <input type="checkbox" name="media" value={id} checked={selected.includes(id)} onChange={() => toggle(id)} />
                {icon ? <Icon name={icon} size={28} /> : <Music2 size={28} aria-hidden="true" />}
                <strong>{label}</strong>
                <span>{description}</span>
                <Check size={20} className="format-check" aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="song-settings" data-open={selected.includes("song")} inert={!selected.includes("song")} aria-hidden={!selected.includes("song")}><div><fieldset><legend>Pakai lagu yang mana?</legend><div className="song-options">{songs.map(item => <label className={`song-option${song === item.id ? " selected" : ""}`} key={item.id}><input type="radio" name="song" checked={song === item.id} onChange={() => setSong(item.id)} /><span>{item.title}</span></label>)}</div></fieldset></div></div>
        <div className="media-selection-actions">
          <button type="button" className="format-select-all" disabled={busy} onClick={() => setSelected(selected.length === formats.length ? [] : formats.map(format => format.id))}>
            {selected.length === formats.length ? "Batalkan semua" : "Pilih semua"}
          </button>
          <button type="button" className="upload-button" data-reading-action onClick={openReading}
            disabled={busy || !canRead || reading === undefined || (!reading && !selected.includes("reading"))}>
            <BookOpen size={20} aria-hidden="true" />
            {busy && !reading ? "Membuat bacaan…" : reading ? "Buka bacaan" : "Buat bacaan"}
          </button>
        </div>
      </>}
      {!material.archived && <div className="material-lkpd-action"><a className="source-secondary" href={`/lkpd?material=${encodeURIComponent(material.id)}`}><Scissors size={20} aria-hidden="true" />Buat LKPD</a></div>}
      {material.extractionStatus === "failed" && <p className="source-error" role="status">Teks file belum terbaca. Unggah ulang dengan teks materi untuk menggunakannya.</p>}
      {error && <p className="source-error" role="alert">{error}</p>}
      {material.text && <Disclosure title="Lihat teks sumber"><p className="format-source-text">{material.text}</p></Disclosure>}
    </div>}
  </Modal>;
}
