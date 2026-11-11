import { useRef, useState } from "react";
import Modal, { closeModal } from "./modal";
import { Mascot } from "./mascot";
import { formats } from "./material-formats.mjs";
import { generateMaterialMedia, rememberMaterialMedia } from "../lib/material-media.mjs";
import { studioRequest } from "../lib/studio-api.mjs";
import { sourceTextLimitMessage } from "../lib/material-limits.mjs";

export default function MaterialBatch({ teacherId, material, sectionLabel, close, choosePages }) {
  const [selected, setSelected] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const blocked = material.extractionStatus !== "ready";
  async function generate(event) {
    event.preventDefault();
    if (running.current || blocked || !selected.length) return;
    running.current = true;
    setBusy(true);
    const accepted = [];
    for (const format of formats.filter(item => selected.includes(item.id))) {
      setStatuses(current => ({ ...current, [format.id]: "Membuat…" }));
      try {
        const path = `/materials/${material.id}/${format.segment}`;
        let { data } = await studioRequest(teacherId, path);
        if (!data || (format.id === "song" && data.status === "failed")) {
          data = await generateMaterialMedia(teacherId, path);
        }
        if (data && !["failed", "uncertain"].includes(data.status)) accepted.push(format.id);
        const status = format.id !== "song" || data?.status === "ready" ? "Siap"
          : data?.status === "failed" || data?.status === "uncertain" ? data.error ?? "Lagu belum siap" : "Diproses";
        setStatuses(current => ({ ...current, [format.id]: status }));
      } catch (error) { setStatuses(current => ({ ...current, [format.id]: error.message })); }
    }
    if (accepted.length) void rememberMaterialMedia(teacherId, material.parentId ?? material.id, accepted);
    running.current = false;
    setBusy(false);
  }
  return <Modal title="Buat media" onClose={close} dismissible={!busy} showClose={false} className="material-generate-dialog">
    <div aria-hidden="true"><Mascot kind="book" className="material-generate-mascot" /></div>
    <h2>{blocked ? material.extractionError === "SOURCE_TEXT_TOO_LONG" ? "Teks sumber terlalu panjang" : "Teks sumber tidak terbaca" : "Buat media"}</h2>
    {blocked && material.extractionError === "SOURCE_TEXT_TOO_LONG" && <p className="source-error">{sourceTextLimitMessage}</p>}
    {!blocked && <p>{sectionLabel}</p>}
    {!blocked && <form id="material-batch" onSubmit={generate} className="material-batch-options">
      {formats.map(format => <label key={format.id}>
        <input type="checkbox" disabled={busy} checked={selected.includes(format.id)} onChange={event => {
          setSelected(current => event.target.checked ? [...current, format.id] : current.filter(id => id !== format.id));
        }} /> {format.label}
        {statuses[format.id] && <small role="status">{statuses[format.id]}</small>}
      </label>)}
    </form>}
    <div className="source-actions">
      <button type="button" className="source-secondary" disabled={busy} onClick={() => closeModal(close)}>Tutup</button>
      {blocked ? <button type="button" className="upload-button" onClick={() => closeModal(choosePages)}>Pilih halaman</button>
        : <button type="submit" form="material-batch" className="upload-button" disabled={busy || !selected.length}>{busy ? "Membuat…" : "Buat media"}</button>}
    </div>
  </Modal>;
}
