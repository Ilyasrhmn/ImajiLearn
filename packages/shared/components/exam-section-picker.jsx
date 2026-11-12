"use client";
import { useRef, useState } from "react";
import SectionPicker from "./material-section-picker";
import Modal, { closeModal } from "./modal";
import { getMaterial } from "../lib/materials.mjs";
import "./exam-source-sections.css";

export default function ExamSectionPicker({ teacherId, material, selected, onClose, onChoose }) {
  const picker = useRef(null), lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function apply() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const id = await picker.current.apply();
      if (id === null) return;
      const source = await getMaterial(teacherId, id ?? selected?.id ?? material.id);
      if (source.extractionStatus !== "ready" || !source.text?.trim()) {
        setError(source.extractionError === "SOURCE_TEXT_TOO_LONG" ? "Pilih bagian yang lebih pendek, maksimal 40.000 karakter." : "Teks pada bagian ini belum terbaca. Pilih halaman lain.");
        return;
      }
      closeModal(() => { onChoose(source); onClose(); });
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="Bagian untuk ujian" className="exam-section-dialog" busy={busy} dismissible={!busy} onClose={onClose}>
    <h2>Bagian untuk ujian</h2>
    <SectionPicker ref={picker} teacherId={teacherId} parentId={material.id}
      current={selected?.parentId ? { first:selected.pageStart, last:selected.pageEnd, pages:selected.sectionPages } : null}
      onChoose={() => {}} onCreate={apply} creating={busy} actionLabel="Gunakan bagian" />
    {error && <p role="alert" className="source-error">{error}</p>}
  </Modal>;
}
