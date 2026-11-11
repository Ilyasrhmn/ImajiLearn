"use client";
import ThemedSelect from "./themed-select";
import { useState } from "react";
import { ArrowRight, Copy, FileText, PencilLine, Search, Trash2 } from "lucide-react";
import { examTitle, filterExams } from "../lib/exams.mjs";
import Modal, { closeModal } from "./modal";
import "./exam-source-tools.css";

export default function ExamLibrary({ exams, onOpen, onDelete, onDuplicate, onRename }) {
  const [query, setQuery] = useState(""), [grade, setGrade] = useState(""), [subject, setSubject] = useState(""), [sort, setSort] = useState("newest");
  const [renaming, setRenaming] = useState(null), [title, setTitle] = useState("");
  const shown = filterExams(exams, { query, grade, subject, sort });
  const [renameBusy, setRenameBusy] = useState(false), [renameError, setRenameError] = useState("");
  async function saveName(event) {
    event.preventDefault(); if (renameBusy || !title.trim()) return;
    setRenameBusy(true); setRenameError("");
    try { const result = await onRename(renaming, title.trim()); if (result?.error || result === false) { setRenameError(result?.error || "Nama belum dapat disimpan."); return; } closeModal(() => setRenaming(null)); }
    catch (error) { setRenameError(error.message); } finally { setRenameBusy(false); }
  }
  return <section className="exam-saved" aria-labelledby="exam-saved-title">
    <h2 id="exam-saved-title">Naskah tersimpan</h2>
    <div className="exam-library-filters">
      <label className="exam-source-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="Cari naskah" placeholder="Cari naskah" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <ThemedSelect aria-label="Filter kelas" value={grade} onChange={e => setGrade(e.target.value)}><option value="">Semua kelas</option>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>Kelas {n}</option>)}</ThemedSelect>
      <ThemedSelect aria-label="Filter mata pelajaran" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Semua pelajaran</option>{[...new Set(exams.map(exam => exam.header.subject))].filter(Boolean).sort().map(name => <option key={name}>{name}</option>)}</ThemedSelect>
      <ThemedSelect aria-label="Urutkan naskah" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name">Nama A–Z</option></ThemedSelect>
    </div>
    <div>{shown.map(exam => <article key={exam.id} className="exam-saved-item">
      <button className="exam-saved-open" onClick={() => onOpen(exam.id)}><FileText size={25} aria-hidden="true" /><span><strong>{examTitle(exam)}</strong><span>Kelas {exam.config.grade} · {(exam.questions?.length ?? Object.values(exam.config.counts).reduce((sum, count) => sum + count, 0))} soal</span></span><ArrowRight size={20} aria-hidden="true" /></button>
      <div className="exam-library-actions">
        <button className="icon-button" aria-label={`Ubah nama ${examTitle(exam)}`} title="Ubah nama" onClick={() => { setRenaming(exam.id); setTitle(examTitle(exam)); setRenameError(""); }}><PencilLine size={20} aria-hidden="true" /></button>
        <button className="icon-button" aria-label={`Duplikasi ${examTitle(exam)}`} title="Duplikasi" onClick={() => onDuplicate(exam)}><Copy size={20} aria-hidden="true" /></button>
        <button className="icon-button danger" aria-label={`Hapus ${examTitle(exam)}`} title="Hapus naskah" onClick={() => onDelete(exam.id)}><Trash2 size={20} aria-hidden="true" /></button>
      </div>
    </article>)}{!shown.length && <p>Naskah tidak ditemukan.</p>}</div>
    {renaming && <Modal title="Ubah nama naskah" busy={renameBusy} onClose={() => setRenaming(null)}><form className="exam-rename" onSubmit={saveName}><h2>Ubah nama naskah</h2><label htmlFor="exam-name">Nama naskah</label><input id="exam-name" readOnly={renameBusy} autoFocus required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /><div className="draft-actions"><button type="button" disabled={renameBusy} className="button button-secondary" onClick={() => closeModal(() => setRenaming(null))}>Batal</button><button className="button" disabled={!title.trim() || renameBusy}>{renameBusy ? "Menyimpan…" : "Simpan"}</button></div>{renameError && <p role="alert" className="field-error">{renameError}</p>}</form></Modal>}
  </section>;
}
