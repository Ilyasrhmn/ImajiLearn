"use client";
import { useState } from "react";
import Image from "next/image";
import { Archive, BookOpen, CalendarDays, ClipboardPenLine, Files, FolderCog, LogOut, Scissors, Search, Upload } from "lucide-react";
import { Mascot } from "./mascot";

export default function Dashboard() {
  const [archive, setArchive] = useState(false);
  const [query, setQuery] = useState("");
  return <>
    <a className="skip-link" href="#main">Lewati ke isi</a>
    <header className="workspace-header"><div className="header-inner">
      <a className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></a>
      <div className="account-actions"><button type="button" className="avatar" disabled aria-label="Pengaturan akun belum tersedia">G</button><button type="button" className="logout" disabled aria-label="Keluar belum tersedia"><LogOut size={20} /></button></div>
    </div></header>
    <main id="main" className="workspace-shell dashboard">
      <nav className="studio-sections" aria-label="Navigasi studio">
        <a href="/dashboard" aria-current="page"><BookOpen size={20} />Materi</a>
        <button type="button" disabled><Scissors size={20} />LKPD</button>
        <button type="button" disabled><ClipboardPenLine size={20} />Soal &amp; ujian</button>
        <button type="button" disabled><CalendarDays size={20} />Jadwal</button>
      </nav>
      <section className="welcome" aria-labelledby="welcome-title">
        <div><h1 id="welcome-title">Besok mengajar apa,<br />Guru?</h1><button className="upload-button" type="button" disabled><Upload size={20} />Unggah materi</button></div>
        <div className="welcome-character" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div>
      </section>
      <section className="materials" aria-labelledby="materials-title">
        <h2 id="materials-title">{archive ? "Arsip materi" : "Materi"}</h2>
        <div className="material-actions"><div className="filters" role="group" aria-label="Tampilan materi"><button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}><Files size={18} />Aktif</button><button type="button" aria-pressed={archive} onClick={() => setArchive(true)}><Archive size={18} />Arsip</button></div><button className="manage" type="button" disabled><FolderCog size={20} />Kelola mapel</button></div>
        <label className="search-label">Cari materi<span className="search-box"><Search size={20} aria-hidden="true" /><input type="search" placeholder="Nama materi" value={query} onChange={e => setQuery(e.target.value)} /></span></label>
        <div className="empty-library" role="status"><Mascot kind="correction" mood="calm" /><h3>{query ? "Materi tidak ditemukan" : archive ? "Belum ada materi di arsip" : "Materi pertama"}</h3>{!archive && !query && <button type="button" className="upload-button" disabled><Upload size={20} />Unggah materi</button>}</div>
      </section>
    </main>
  </>;
}
