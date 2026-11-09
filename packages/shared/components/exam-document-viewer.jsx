"use client";
import ThemedSelect from "./themed-select";
import { useState, startTransition, ViewTransition } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, FileText, TableProperties, KeyRound, Printer, Copy } from "lucide-react";
import { studioAlert } from "./studio-alert";
import { EXAM_TYPES, QUESTION_FORMS, COGNITIVE_LEVELS, DIFFICULTIES, finalGrade } from "../lib/exams.mjs";

const tabs = [{ id: "questions", label: "Naskah soal", Icon: FileText }, { id: "blueprint", label: "Kisi-kisi", Icon: TableProperties }, { id: "answers", label: "Kunci & skor", Icon: KeyRound }];

function Edit({ label, value, onChange, placeholder = "", visibleLabel = false, className = "", maxLength = 12000 }) {
  return <label className={`exam-edit ${className}`}><span className={visibleLabel ? "exam-edit-label" : "sr-only"}>{label}</span>
    <textarea aria-label={label} rows={Math.max(1, Math.min(20, value.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 65)), 0)))} maxLength={maxLength} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    <span className="exam-print-value">{value}</span>
  </label>;
}

function SchoolHeader({ exam, updateHeader }) {
  return <header className="exam-paper-header">
    <Edit label="Nama sekolah" value={exam.header.school} onChange={value => updateHeader("school", value)} placeholder="Nama sekolah" className="exam-school-name" maxLength={200} />
    <Edit label="Kecamatan / kabupaten" value={exam.header.district} onChange={value => updateHeader("district", value)} placeholder="Kecamatan / kabupaten" maxLength={200} />
    <h2>{EXAM_TYPES[exam.config.type]}</h2>
    <div className="exam-paper-meta">
      <Edit label="Mata pelajaran" visibleLabel value={exam.header.subject} onChange={value => updateHeader("subject", value)} placeholder="Mata pelajaran" maxLength={100} />
      <Edit label="Kelas" visibleLabel value={exam.header.grade} onChange={value => updateHeader("grade", value)} maxLength={20} />
      <Edit label="Semester" visibleLabel value={exam.header.semester} onChange={value => updateHeader("semester", value)} maxLength={20} />
      <Edit label="Waktu (menit)" visibleLabel value={exam.header.minutes} onChange={value => updateHeader("minutes", value.replace(/[^0-9]/g, "").slice(0, 3))} maxLength={3} />
    </div>
  </header>;
}

function Questions({ exam, updateQuestion }) {
  return <>
    <div className="exam-student-identity"><span>Nama: <span className="exam-fill-line" /></span><span>No. absen: <span className="exam-fill-line short" /></span></div>
    {Object.entries(QUESTION_FORMS).map(([form, label]) => {
      const questions = exam.questions.filter(q => q.form === form);
      return questions.length > 0 && <section className="exam-question-group" key={form}><h3>{label}</h3>{questions.map(q => <div className="exam-question" key={q.id}>
        <span className="exam-question-number">{q.number}.</span><div>
          <Edit label={`Soal ${q.number}`} value={q.prompt} placeholder="Tulis soal…" onChange={value => updateQuestion(q.id, { prompt: value })} />
          {q.form === "multipleChoice" ? <div className="exam-choices">{q.options.map((option, index) => <div key={index}><span>{String.fromCharCode(65 + index)}.</span><Edit label={`Soal ${q.number} pilihan ${String.fromCharCode(65 + index)}`} value={option} placeholder="Tulis pilihan…" onChange={value => updateQuestion(q.id, { options: q.options.map((old, i) => i === index ? value : old) })} /></div>)}</div> : <div className={`exam-answer-space ${q.form}`} aria-hidden="true" />}
        </div>
      </div>)}</section>;
    })}
  </>;
}

function Blueprint({ exam, updateQuestion }) {
  return <><h3 className="exam-document-title">Kisi-kisi soal</h3><div className="exam-table-scroll" role="region" aria-label="Tabel kisi-kisi soal" tabIndex={0}><table className="exam-blueprint"><thead><tr>{["No.", "Materi", "Capaian pembelajaran", "Indikator soal", "Level kognitif", "Kesulitan", "Bentuk soal"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{exam.questions.map(q => <tr key={q.id}><th scope="row">{q.number}</th>
    <td><Edit label={`Materi soal ${q.number}`} value={q.topic} placeholder="Materi" onChange={value => updateQuestion(q.id, { topic: value })} /></td>
    <td><Edit label={`Capaian pembelajaran soal ${q.number}`} value={q.learningOutcome} placeholder="Capaian pembelajaran" onChange={value => updateQuestion(q.id, { learningOutcome: value })} /></td>
    <td><Edit label={`Indikator soal ${q.number}`} value={q.indicator} placeholder="Indikator soal" onChange={value => updateQuestion(q.id, { indicator: value })} /></td>
    <td><ThemedSelect className="exam-cognitive" aria-label={`Level kognitif soal ${q.number}`} value={q.cognitiveLevel} onChange={event => updateQuestion(q.id, { cognitiveLevel: event.target.value })}>{Object.entries(COGNITIVE_LEVELS).map(([id, label]) => <option value={id} key={id}>{id} · {label}</option>)}</ThemedSelect><span className="exam-print-value">{q.cognitiveLevel} · {COGNITIVE_LEVELS[q.cognitiveLevel]}</span></td>
    <td><ThemedSelect className="exam-cognitive" aria-label={`Kesulitan soal ${q.number}`} value={q.difficulty || "medium"} onChange={event=>updateQuestion(q.id,{difficulty:event.target.value})}>{["easy","medium","hard"].map(id=><option key={id} value={id}>{DIFFICULTIES[id]}</option>)}</ThemedSelect><span className="exam-print-value">{DIFFICULTIES[q.difficulty || "medium"]}</span></td>
    <td>{QUESTION_FORMS[q.form]}</td>
  </tr>)}</tbody></table></div></>;
}

function Answers({ exam, updateQuestion }) {
  const maximum = exam.questions.reduce((sum, q) => sum + q.maxScore, 0);
  return <><h3 className="exam-document-title">Kunci jawaban & pedoman skor</h3><div className="exam-answer-key">{exam.questions.map(q => <section className="exam-key-item" key={q.id}>
    <h4>{q.number}. {q.prompt || QUESTION_FORMS[q.form]}</h4>
    <div className="exam-key-fields">
      {q.form === "multipleChoice" ? <label className="exam-edit"><span className="exam-edit-label">Jawaban</span><ThemedSelect aria-label={`Jawaban soal ${q.number}`} value={q.answer} onChange={event => updateQuestion(q.id, { answer: event.target.value })}><option value="">Pilih jawaban</option>{q.options.map((_, index) => <option key={index} value={String.fromCharCode(65 + index)}>{String.fromCharCode(65 + index)}</option>)}</ThemedSelect><span className="exam-print-value">{q.answer}</span></label>
        : <Edit label={`Jawaban soal ${q.number}`} visibleLabel value={q.answer} placeholder="Tulis jawaban…" onChange={value => updateQuestion(q.id, { answer: value })} />}
      <label className="exam-edit exam-score"><span className="exam-edit-label">Skor maksimal</span><input type="number" aria-label={`Skor soal ${q.number}`} min={0} max={1000} step="0.5" value={q.maxScore} onChange={event => { const score = Number(event.target.value); if (score >= 0 && score <= 1000) updateQuestion(q.id, { maxScore: score }); }} /><span className="exam-print-value">{q.maxScore}</span></label>
      <Edit label={`Pembahasan soal ${q.number}`} visibleLabel value={q.explanation} placeholder="Tulis pembahasan…" onChange={value => updateQuestion(q.id, { explanation: value })} />
      {q.form === "essay" && <Edit label={`Pedoman penskoran soal ${q.number}`} visibleLabel value={q.rubric} placeholder="Kriteria jawaban dan bobot skor…" onChange={value => updateQuestion(q.id, { rubric: value })} />}
    </div>
  </section>)}</div><section className="exam-grade-guide"><h3>Konversi nilai</h3><p>Nilai = skor perolehan ÷ {maximum} × 100</p><table><thead><tr><th scope="col">Skor perolehan</th><th scope="col">Nilai</th></tr></thead><tbody>{[0, .25, .5, .75, 1].map(fraction => { const score = Math.round(maximum * fraction * 100) / 100; return <tr key={fraction}><td>{score}</td><td>{finalGrade(score, maximum)}</td></tr>; })}</tbody></table></section></>;
}

export default function ExamDocumentViewer({ exam, saved, onChange, onBack, onRemedial }) {
  const [tab, setTab] = useState("questions");
  const updateQuestion = (id, patch) => onChange({ ...exam, questions: exam.questions.map(q => q.id === id ? { ...q, ...patch } : q) });
  const updateHeader = (key, value) => onChange({ ...exam, header: { ...exam.header, [key]: value } });
  function changeTab(id) { startTransition(() => setTab(id)); }
  function print(id) {
    const incomplete = !exam.header.school.trim() || !exam.header.subject.trim() || !exam.header.grade.trim() || !exam.header.semester.trim() || Number(exam.header.minutes) < 1
      || exam.questions.some(q => !q.prompt.trim() || (id === "questions" && q.options.some(option => !option.trim()))
        || (id === "blueprint" && (!q.topic.trim() || !q.learningOutcome.trim() || !q.indicator.trim()))
        || (id === "answers" && (!q.answer.trim() || !q.explanation.trim() || (q.form === "essay" && !q.rubric.trim()))));
    if (incomplete) {
      flushSync(() => setTab(id));
      studioAlert({ title: "Lengkapi dokumen terlebih dahulu", message: "Isi kop sekolah dan bagian dokumen yang masih kosong sebelum mencetak.", kind: "pen", warning: true });
      return;
    }
    if (id === "answers" && exam.questions.every(q => q.maxScore === 0)) { studioAlert({ title: "Periksa skor soal", message: "Total skor harus lebih dari nol.", warning: true, kind: "pen" }); return; }
    flushSync(() => setTab(id));
    window.print();
  }
  return <div className="exam-workspace">
    <div className="exam-editor-heading"><button className="text-button" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" />Semua naskah</button><span role="status" className={saved ? "exam-save-status" : "field-error"}>{saved ? "Tersimpan" : "Belum tersimpan"}</span></div>
    <div className="exam-viewer-title"><h1>{exam.title?.trim() || EXAM_TYPES[exam.config.type]}</h1><div>
      <button className="button button-secondary" onClick={() => studioAlert({ title: "Pembuatan soal belum tersedia", message: "Anda tetap bisa menulis dan mengedit naskah ini.", warning: true, kind: "pen" })}><FileText size={19} aria-hidden="true" />Isi otomatis</button>
      {exam.config.type !== "remedial" && <button className="icon-button" aria-label="Salin untuk remedial" title="Salin untuk remedial" disabled={!saved} onClick={onRemedial}><Copy size={21} aria-hidden="true" /></button>}
    </div></div>
    <div className="exam-print-actions" role="group" aria-label="Cetak dokumen">{tabs.map(item => <button key={item.id} className="button button-secondary" onClick={() => print(item.id)}><Printer size={18} aria-hidden="true" />Cetak {item.id === "questions" ? "soal" : item.id === "blueprint" ? "kisi-kisi" : "kunci"}</button>)}</div>
    <div className="exam-tabs" role="tablist" aria-label="Dokumen ujian">{tabs.map((item, index) => <button key={item.id} id={`exam-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls="exam-document" tabIndex={tab === item.id ? 0 : -1} onClick={() => changeTab(item.id)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      changeTab(next.id); document.getElementById(`exam-tab-${next.id}`).focus();
    }}><item.Icon size={19} aria-hidden="true" />{item.label}</button>)}</div>
    <ViewTransition update="panel-swap" default="none"><section id="exam-document" className={`exam-paper exam-paper-${tab}`} data-print-document={tab} role="tabpanel" aria-labelledby={`exam-tab-${tab}`} tabIndex={0}>
      <SchoolHeader exam={exam} updateHeader={updateHeader} />
      {tab === "questions" ? <Questions exam={exam} updateQuestion={updateQuestion} /> : tab === "blueprint" ? <Blueprint exam={exam} updateQuestion={updateQuestion} /> : <Answers exam={exam} updateQuestion={updateQuestion} />}
    </section></ViewTransition>
  </div>;
}
