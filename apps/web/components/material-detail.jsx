"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Download, Music2, Scissors } from "lucide-react";
import Modal, { swapModalContent } from "./modal";
import Disclosure from "./disclosure";
import Icon from "./icon";
import MaterialReading from "./material-reading";
import MaterialVisual from "./material-visual";
import MaterialSlides from "./material-slides";
import MaterialSong from "./material-song";
import { downloadMaterial, updateMaterial } from "../lib/materials";
import { studioRequest } from "../lib/studio-api.mjs";
import "./material-detail.css";

export const formats = [
  { id: "reading", label: "Bacaan bergambar", description: "Baca dan tanya jawab bersama.", icon: "book" },
  { id: "mindmap", label: "Visual interaktif", description: "Jelajahi bagian dan alur.", icon: "map" },
  { id: "slides", label: "Slide", description: "Jelaskan satu per satu.", icon: "slides" },
  { id: "song", label: "Lagu belajar", description: "Nyanyikan materi bersama kelas." },
];
const outputActions = [
  { id: "reading", segment: "reading", label: "bacaan", icon: "book" },
  { id: "mindmap", segment: "visual", label: "visual", icon: "map" },
  { id: "slides", segment: "slides", label: "slide", icon: "slides" },
  { id: "song", segment: "song", label: "lagu", icon: "song" },
];

export default function MaterialDetail({ teacherId, material, onClose, onSaved }) {
  const [selected, setSelected] = useState(() => Array.isArray(material.selectedMedia) ? material.selectedMedia.filter(id => formats.some(format => format.id === id)) : []);
  const [busyId, setBusyId] = useState(null);
  const busy = busyId !== null;
  const [error, setError] = useState("");
  const [outputs, setOutputs] = useState({});
  const [openId, setOpenId] = useState(null);
  const detail = useRef(null);
  const working = useRef(false);
  const sourceReady = !material.archived && material.extractionStatus === "ready";
  const sourcePath = "/materials/" + encodeURIComponent(material.id);

  useEffect(() => {
    if (!sourceReady) return;
    const controller = new AbortController();
    for (const { id, segment } of outputActions) {
      const store = data => {
        if (!controller.signal.aborted) setOutputs(current => ({ ...current, [id]: data }));
      };
      studioRequest(teacherId, sourcePath + "/" + segment, { signal: controller.signal })
        .then(({ data }) => store(data)).catch(() => store(null));
    }
    return () => controller.abort();
  }, [sourceReady, sourcePath, teacherId]);

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  async function openOutput({ id, segment }) {
    const saved = outputs[id];
    if (working.current || !sourceReady || (!saved && !selected.includes(id))) return;
    working.current = true;
    setBusyId(id); setError("");
    try {
      const previous = material.selectedMedia ?? [];
      if (previous.length !== selected.length || selected.some(id => !previous.includes(id))) {
        onSaved(await updateMaterial(teacherId, material, { selectedMedia: selected, songTemplateId: material.songTemplateId ?? "balonku" }));
      }
      const result = saved ?? (await studioRequest(teacherId, sourcePath + "/" + segment, { method: "POST" })).data;
      if (detail.current?.isConnected) {
        setOutputs(current => ({ ...current, [id]: result }));
        await swapModalContent(() => setOpenId(id), "[data-output-heading]");
      }
    } catch (error) { setError(error.message); }
    finally { working.current = false; setBusyId(null); }
  }
  const back = () => swapModalContent(() => setOpenId(null), `[data-output-action="${openId}"]`);
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
    {openId === "reading" ? <MaterialReading reading={outputs.reading} teacherId={teacherId}
      illustrationPath={sourcePath + "/reading/illustration"} onBack={back} /> :
    openId === "mindmap" ? <MaterialVisual visual={outputs.mindmap} onBack={back} /> :
    openId === "slides" ? <MaterialSlides deck={outputs.slides} teacherId={teacherId}
      illustrationsPath={sourcePath + "/slides/illustrations"} revision={material.revision} onBack={back} /> :
    openId === "song" ? <MaterialSong song={outputs.song} teacherId={teacherId}
      songPath={sourcePath + "/song"} revision={material.revision} onBack={back} /> :
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
        {selected.includes("song") && <p className="song-description">Buat lagu ceria dari isi materi, dengan musik energik dan refrain untuk dinyanyikan bersama anak.</p>}
        <div className="media-selection-actions">
          <button type="button" className="format-select-all" disabled={busy} onClick={() => setSelected(selected.length === formats.length ? [] : formats.map(format => format.id))}>
            {selected.length === formats.length ? "Batalkan semua" : "Pilih semua"}
          </button>
          <div className="media-output-actions">
            {outputActions.filter(({ id }) => selected.includes(id) || outputs[id]).map(action => (
              <button key={action.id} type="button" className="upload-button" data-output-action={action.id}
                onClick={() => openOutput(action)} disabled={busy || !sourceReady || outputs[action.id] === undefined}>
                <Icon name={action.icon} size={20} />
                {outputs[action.id] ? "Buka " + action.label : busyId === action.id ? "Membuat " + action.label + "…" : "Buat " + action.label}
              </button>
            ))}
          </div>
        </div>
      </>}
      {!material.archived && <div className="material-lkpd-action"><a className="source-secondary" href={`/lkpd?material=${encodeURIComponent(material.id)}`}><Scissors size={20} aria-hidden="true" />Buat LKPD</a></div>}
      {material.extractionStatus === "failed" && <p className="source-error" role="status">Teks file belum terbaca. Unggah ulang dengan teks materi untuk menggunakannya.</p>}
      {error && <p className="source-error" role="alert">{error}</p>}
      {material.text && <Disclosure title="Lihat teks sumber"><p className="format-source-text">{material.text}</p></Disclosure>}
    </div>}
  </Modal>;
}
