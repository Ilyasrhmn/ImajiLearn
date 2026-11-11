"use client";
import ThemedSelect from "./themed-select";
import { useEffect, useRef, useState, startTransition, ViewTransition } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Check, FileText, Printer, PencilLine, Minus, Plus, Scan, X } from "lucide-react";
import LkpdPages from "./lkpd-pages";
import { studioAlert } from "./studio-alert";
import { validateLkpdContent } from "../lib/lkpd.mjs";
import { worksheetOverflows } from "./lkpd-preflight";

function OptionalEditor({ document, onSave, onCancel }) {
  const [content, setContent] = useState(() => structuredClone(document.content));
  const [error, setError] = useState("");
  const patchItem = (id, key, value) => setContent(old => ({ ...old, items: old.items.map(item => item.id === id ? { ...item, [key]: value } : item) }));
  return <form className="lkpd-editor" onSubmit={event => {
    event.preventDefault();
    const invalid = validateLkpdContent(content, document.templateId);
    if (invalid) { setError(invalid); return; }
    onSave({ ...document, content });
  }}>
    <div className="lkpd-editor-heading"><h2>Edit LKPD</h2><button type="button" className="icon-button" aria-label="Batalkan edit" onClick={onCancel}><X size={20} aria-hidden="true" /></button></div>
    <label>Judul<input maxLength={90} required value={content.title} onChange={event => setContent({ ...content, title: event.target.value })} /></label>
    {content.instructions.map((instruction, i) => <label key={i}>Petunjuk {i + 1}<textarea maxLength={140} required rows={2} value={instruction} onChange={event => setContent({ ...content, instructions: content.instructions.map((value, index) => index === i ? event.target.value : value) })} /></label>)}
    <div className="lkpd-edit-items">{content.items.map((item, i) => <fieldset key={item.id}><legend>Bagian {i + 1}</legend><label>Label<input maxLength={64} required={document.templateId !== "cube"} value={item.front} onChange={event => patchItem(item.id, "front", event.target.value)} /></label>
      <label>Isi / penjelasan<textarea rows={2} maxLength={180} required={document.templateId === "fold"} value={item.back} onChange={event => patchItem(item.id, "back", event.target.value)} /></label>
      {document.templateId === "match" && <label>Pasangan<textarea rows={2} maxLength={110} required value={content.pairs.find(pair => pair.itemId === item.id).target} onChange={event => setContent({ ...content, pairs: content.pairs.map(pair => pair.itemId === item.id ? { ...pair, target: event.target.value } : pair) })} /></label>}
    </fieldset>)}</div>
    {content.groups.map((group, index) => <label key={group.id}>Nama kelompok {index + 1}<input maxLength={48} required value={group.label} onChange={event => setContent({ ...content, groups: content.groups.map((old, i) => i === index ? { ...old, label: event.target.value } : old) })} /></label>)}
    <label>Catatan guru<textarea rows={3} maxLength={600} value={content.teacher.notes} onChange={event => setContent({ ...content, teacher: { ...content.teacher, notes: event.target.value } })} /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="lkpd-editor-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Batal</button><button className="button">Simpan perubahan<Check size={18} aria-hidden="true" /></button></div>
  </form>;
}

export default function LkpdViewer({ document, saved, onChange, onBack, onNavigationBlock }) {
  const [view, setView] = useState("student"), [editing, setEditing] = useState(false), [printing, setPrinting] = useState(false);
  const [fit, setFit] = useState(.8), [zoom, setZoom] = useState(null);
  const preview = useRef(null), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const observer = new ResizeObserver(([entry]) => setFit(Math.min(1, Math.max(.2, (entry.contentRect.width - 4) / (210 * 96 / 25.4)))));
    observer.observe(preview.current);
    return () => { mounted.current = false; observer.disconnect(); };
  }, []);
  async function print() {
    if (editing || printing) return;
    setPrinting(true);
    try {
      await window.document.fonts.ready;
      const images = [...preview.current.querySelectorAll("img")];
      await Promise.all(images.map(image => image.decode()));
      if (!mounted.current) return;
      const overflow = worksheetOverflows(preview.current);
      if (overflow) { studioAlert({ title: "Isi belum muat pada pola", message: "Batalkan perubahan terakhir atau persingkat teks melalui Edit.", warning: true, kind: "pen" }); return; }
      window.print();
    } catch { if (mounted.current) studioAlert({ title: "Cetakan belum siap", message: "Gambar belum dapat dimuat. Coba lagi.", warning: true, kind: "pen" }); }
    finally { if (mounted.current) setPrinting(false); }
  }
  useEffect(() => { onNavigationBlock?.(editing || !saved); return () => onNavigationBlock?.(false); }, [editing, saved, onNavigationBlock]);
  const scale = zoom ?? fit;
  return <div className="lkpd-workspace">
    <div className="lkpd-viewer-back"><button className="text-button" disabled={Boolean(onNavigationBlock) && (editing || !saved)} onClick={onBack}><ArrowLeft size={19} aria-hidden="true" />Semua LKPD</button><span role="status">{saved ? "Tersimpan di perangkat ini" : "Belum tersimpan"}</span></div>
    <div className="lkpd-result-heading"><h1>{document.content.title}</h1><button className="button" onClick={print} disabled={printing || editing}><Printer size={20} aria-hidden="true" />{printing ? "Menyiapkan…" : "Cetak / PDF"}</button></div>
    <div className="lkpd-result-controls">
      <div className="lkpd-view-tabs" role="tablist" aria-label="Lembar LKPD">{[{ id: "student", label: "Lembar anak", Icon: FileText }, { id: "teacher", label: "Panduan guru", Icon: Check }].map((item, index) => <button key={item.id} id={`lkpd-tab-${item.id}`} role="tab" tabIndex={view === item.id ? 0 : -1} aria-selected={view === item.id} aria-controls="lkpd-document" onClick={() => startTransition(() => setView(item.id))} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? "student" : event.key === "End" ? "teacher" : index ? "student" : "teacher";
        flushSync(() => setView(next)); window.document.getElementById(`lkpd-tab-${next}`).focus();
      }}><item.Icon size={18} aria-hidden="true" />{item.label}</button>)}</div>
      <div className="lkpd-display-actions"><label className="sr-only" htmlFor="lkpd-print-theme">Warna cetak</label><ThemedSelect id="lkpd-print-theme" value={document.theme} onChange={event => onChange({ ...document, theme: event.target.value })}><option value="ink">Hemat tinta</option><option value="color">Berwarna</option></ThemedSelect><button className="icon-button" aria-label="Edit LKPD" title="Edit LKPD" aria-expanded={editing} onClick={() => setEditing(!editing)}><PencilLine size={21} aria-hidden="true" /></button></div>
    </div>
    <div className="lkpd-editor-reveal" data-open={editing} inert={!editing} aria-hidden={!editing}><div><OptionalEditor key={`${document.id}-${editing}`} document={document} onSave={next => { if (onChange(next) !== false) setEditing(false); }} onCancel={() => setEditing(false)} /></div></div>
    <div className="lkpd-zoom-tools" role="group" aria-label="Ukuran pratinjau"><button className="icon-button" aria-label="Perkecil pratinjau" title="Perkecil" disabled={scale <= .25} onClick={() => setZoom(Math.max(.25, scale - .1))}><Minus size={17} aria-hidden="true" /></button><button className="text-button" onClick={() => setZoom(null)} title="Sesuaikan layar"><Scan size={17} aria-hidden="true" />{Math.round(scale * 100)}%</button><button className="icon-button" aria-label="Perbesar pratinjau" title="Perbesar" disabled={scale >= 1.5} onClick={() => setZoom(Math.min(1.5, scale + .1))}><Plus size={17} aria-hidden="true" /></button></div>
    <div ref={preview} className="lkpd-preview"><ViewTransition update="panel-swap" default="none"><section id="lkpd-document" role="tabpanel" tabIndex={0} aria-labelledby={`lkpd-tab-${view}`} className="lkpd-preview-scale" style={{ "--lkpd-scale": scale }}><LkpdPages document={document} view={view} /></section></ViewTransition></div>
    {document.templateId === "cube" || document.templateId === "fold" ? <p className="lkpd-print-size">Cetak ukuran sebenarnya (100%). Cocokkan garis ukur sebelum memotong.</p> : null}
  </div>;
}
