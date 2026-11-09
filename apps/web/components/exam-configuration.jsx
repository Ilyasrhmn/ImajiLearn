"use client";
import ThemedSelect from "./themed-select";
import { useEffect, useState } from "react";
import { ArrowRight, Check, FileText } from "lucide-react";
import ExamLibrary from "./exam-library";
import { Mascot } from "./mascot";
import { EXAM_TYPES, QUESTION_FORMS, initialExamConfig, validateExamConfig, DIFFICULTIES } from "../lib/exams.mjs";

export default function ExamConfiguration({ materials, folders, exams, profile, onCreate, onOpen, onDelete, onRename, onDuplicate }) {
  const [config, setConfig] = useState(() => ({ ...initialExamConfig(), grade: profile.grade || "4" }));
  const [folder,setFolder]=useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (error) document.getElementById("exam-config-error")?.focus(); }, [error]);
  const sources = materials.filter(m => !m.archived && !m.isSample);
  const shown = sources.filter(m => (folder === "all" || (folder === "unfiled" ? !m.folderId : m.folderId === folder)) && m.title.toLocaleLowerCase("id").includes(search.toLocaleLowerCase("id")));
  const allShownSelected = shown.length > 0 && shown.every(material => config.materialIds.includes(material.id));
  function toggleShown() { const visibleIds = shown.map(material => material.id); change("materialIds", allShownSelected ? config.materialIds.filter(id => !visibleIds.includes(id)) : [...new Set([...config.materialIds, ...visibleIds])]); }
  const change = (key, value) => { setConfig(previous => ({ ...previous, [key]: value })); setError(""); };
  function toggle(id) { change("materialIds", config.materialIds.includes(id) ? config.materialIds.filter(value => value !== id) : [...config.materialIds, id]); }
  function submit(event) {
    event.preventDefault();
    const message = validateExamConfig(config);
    if (message) { setError(message); return; }
    onCreate(config);
  }
  return <>
    <div className="exam-heading"><h1>Soal & ujian</h1><Mascot kind="pen" mood="think" /></div>
    <form className="exam-config" onSubmit={submit}>
      <section className="exam-sources" aria-labelledby="exam-sources-title">
        <div className="exam-section-heading"><h2 id="exam-sources-title">Materi</h2>{sources.length > 1 && <button type="button" className="text-button" disabled={!shown.length} onClick={toggleShown}>{allShownSelected ? "Batalkan semua" : "Pilih semua"}</button>}</div>
        <div className="exam-subject-filter"><ThemedSelect aria-label="Filter mapel materi ujian" value={folder} onChange={event => setFolder(event.target.value)}><option value="all">Semua mapel</option><option value="unfiled">Belum dikelompokkan</option>{folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</ThemedSelect></div>
        {sources.length > 5 && <label className="exam-search"><span className="sr-only">Cari materi</span><input type="search" placeholder="Cari materi" value={search} onChange={event => setSearch(event.target.value)} /></label>}
        {sources.length ? <div className="exam-source-list">{shown.length ? shown.map(material => <label className="exam-source" key={material.id}>
          <input type="checkbox" checked={config.materialIds.includes(material.id)} onChange={() => toggle(material.id)} />
          <FileText size={23} aria-hidden="true" /><span>{material.title}</span><Check className="exam-source-check" size={18} aria-hidden="true" />
        </label>) : <p className="exam-empty-search">Materi tidak ditemukan.</p>}</div> : <div className="exam-empty-sources"><FileText size={28} aria-hidden="true" /><p>Belum ada materi. Tulis ringkasannya di bawah.</p></div>}
        <div className="exam-field exam-summary"><label htmlFor="exam-summary">Ringkasan materi</label><textarea id="exam-summary" rows={6} maxLength={20000} placeholder="Tulis materi yang akan diujikan…" value={config.summary} onChange={event => change("summary", event.target.value)} /></div>
      </section>
      <section className="exam-options" aria-labelledby="exam-options-title">
        <h2 id="exam-options-title">Pengaturan ujian</h2>
        <div className="exam-field"><label htmlFor="exam-type">Jenis ujian</label><ThemedSelect id="exam-type" value={config.type} onChange={event => change("type", event.target.value)}>{Object.entries(EXAM_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</ThemedSelect></div>
        <div className="exam-field"><label htmlFor="exam-subject">Mata pelajaran</label><input id="exam-subject" required maxLength={100} value={config.subject} onChange={event => change("subject", event.target.value)} /></div>
        <div className="exam-field-pair">
          <div className="exam-field"><label htmlFor="exam-grade">Kelas</label><ThemedSelect id="exam-grade" value={config.grade} onChange={event => change("grade", event.target.value)}>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>Kelas {grade}</option>)}</ThemedSelect></div>
          <div className="exam-field"><label htmlFor="exam-semester">Semester</label><ThemedSelect id="exam-semester" value={config.semester} onChange={event => change("semester", event.target.value)}><option value="1">Ganjil</option><option value="2">Genap</option></ThemedSelect></div>
        </div>
        <div className="exam-field"><label htmlFor="exam-minutes">Waktu (menit)</label><input id="exam-minutes" type="number" min={10} max={240} value={config.minutes} onChange={event => change("minutes", event.target.value === "" ? "" : Number(event.target.value))} required /></div>
        <fieldset className="exam-counts"><legend>Jumlah soal</legend><div>{Object.entries(QUESTION_FORMS).map(([id, label]) => <div className="exam-field" key={id}><label htmlFor={`exam-count-${id}`}>{label}</label><input id={`exam-count-${id}`} type="number" min={0} max={50} step={1} required value={config.counts[id]} onChange={event => change("counts", { ...config.counts, [id]: event.target.value === "" ? "" : Number(event.target.value) })} /></div>)}</div></fieldset>
        <div className="exam-field"><label htmlFor="exam-difficulty">Tingkat kesulitan</label><ThemedSelect id="exam-difficulty" value={config.difficulty} onChange={event=>change("difficulty",event.target.value)}>{Object.entries(DIFFICULTIES).map(([id,label])=><option value={id} key={id}>{label}</option>)}</ThemedSelect></div>
        {error && <p id="exam-config-error" role="alert" tabIndex={-1} className="field-error">{error}</p>}
        <button className="button exam-create">Siapkan naskah<ArrowRight size={20} aria-hidden="true" /></button>
      </section>
    </form>
    {exams.length > 0 && <ExamLibrary exams={exams} onOpen={onOpen} onDelete={onDelete} onRename={onRename} onDuplicate={onDuplicate} />}
  </>;
}
