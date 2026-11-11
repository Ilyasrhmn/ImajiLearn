"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpenText, Box, ClipboardCheck, ExternalLink, FileText, Music2, PanelsTopLeft, Search, Sparkles, Upload } from "lucide-react";
import TeacherWorkspace from "./teacher-workspace";
import MaterialLibrary from "./material-library";
import { Mascot } from "./mascot";
import UploadMaterial from "./upload-material";
import { listFolders, listMaterials } from "../lib/materials";
import "./create-media.css";

const tools = [
  { id: "reading", segment: "reading", label: "Bacaan bergambar", Icon: BookOpenText, tone: "blue" },
  { id: "slides", segment: "slides", label: "Slide", Icon: PanelsTopLeft, tone: "sage" },
  { id: "song", segment: "song", label: "Lagu belajar", Icon: Music2, tone: "pink" },
  { id: "visual", segment: "visual", label: "Visual interaktif", Icon: Box, tone: "yellow" },
  { id: "exam", label: "Soal & ujian", Icon: ClipboardCheck, tone: "lilac" },
];

function SourcePicker({ teacherId, tool }) {
  const [items, setItems] = useState(null);
  const [folders, setFolders] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([listMaterials(teacherId), listFolders(teacherId)]).then(([materials, subjects]) => {
      if (!active) return;
      setItems(materials.filter(item => !item.archived && !item.parentId));
      setFolders(subjects);
      setError(false);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [teacherId, attempt]);
  const destination = id => `/materi/${encodeURIComponent(id)}/${tool.segment}`;
  return <main id="main" className="media-studio-entry">
    <header><Link className="brand" href="/buat-media">ImajiLearn</Link><span>{tool.label}</span></header>
    <section aria-labelledby="studio-source-title">
      <div className="media-source-heading"><h1 id="studio-source-title">Pilih materi</h1><button className="upload-button" onClick={() => setUploading(true)}><Upload size={19} aria-hidden="true" />Unggah file</button></div>
      <label className="media-source-search"><Search size={21} aria-hidden="true" /><input aria-label="Cari nama materi" placeholder="Cari nama materi" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {error ? <div role="alert"><p>Materi belum dapat dimuat.</p><button className="source-secondary" onClick={() => setAttempt(value => value + 1)}>Coba lagi</button></div>
        : !items ? <div className="home-loading" role="status" aria-label="Memuat materi"><span /><span /></div>
          : items.length === 0 ? <div className="home-empty"><Mascot kind="book" /><p>Belum ada materi</p></div>
            : <ul className="media-source-list">{items.filter(item => item.title.toLocaleLowerCase("id").includes(query.toLocaleLowerCase("id"))).map(item => <li key={item.id}><Link href={destination(item.id)}><FileText size={24} aria-hidden="true" />{item.title}</Link></li>)}
              {!items.some(item => item.title.toLocaleLowerCase("id").includes(query.toLocaleLowerCase("id"))) && <li>Materi tidak ditemukan.</li>}</ul>}
    </section>
    {uploading && <UploadMaterial teacherId={teacherId} folders={folders} onClose={() => setUploading(false)} onSaved={material => { window.location.assign(destination(material.id)); }} />}
  </main>;
}

export default function CreateMedia({ teacherId, name, kind }) {
  const tool = tools.find(item => item.id === kind && item.segment);
  if (tool) return <SourcePicker teacherId={teacherId} tool={tool} />;
  return <TeacherWorkspace name={name} current="/buat-media">
    <main id="main" className="teacher-home create-media">
      <section className="create-media-welcome" aria-labelledby="create-media-title">
        <h1 id="create-media-title">Kelola materi dan buat media ajar bersama AI.</h1>
        <Image className="create-media-header-art" src="/illustrations/create-media-paper.webp" width={240} height={210} sizes="(max-width: 600px) 180px, (max-width: 1000px) 190px, 240px" alt="" />
      </section>
      <section className="create-media-toolkit" aria-labelledby="create-media-tools-title">
        <h2 id="create-media-tools-title">Buat media <Sparkles size={24} aria-hidden="true" /></h2>
        <div className="create-media-grid">{tools.map(({ id, label, Icon, tone }) => <a key={id} className={`create-media-card create-media-${tone}`} href={id === "exam" ? "/ujian" : `/buat-media?jenis=${id}`} target="_blank" rel="noopener noreferrer" aria-label={`${label}, buka di tab baru`}>
          <span className="create-media-icon"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="create-media-label">{label}</span><ExternalLink className="create-media-external" size={17} aria-hidden="true" />
        </a>)}<div className="create-media-friends" aria-hidden="true">{["book", "pencil", "pen", "eraser", "correction"].map(kind => <Mascot key={kind} kind={kind} />)}</div></div>
      </section>
      <MaterialLibrary teacherId={teacherId} />
    </main>
  </TeacherWorkspace>;
}
