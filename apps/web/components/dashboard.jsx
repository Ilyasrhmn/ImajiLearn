"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Archive, BookOpen, CalendarDays, ClipboardPenLine, FileText, Files, FolderCog, LogOut, Scissors, Search, Upload } from "lucide-react";
import { Mascot } from "./mascot";
import UploadMaterial from "./upload-material";
import Modal from "./modal";
import { listMaterials } from "../lib/materials";

export default function Dashboard() {
  const [archive, setArchive] = useState(false);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [storageError, setStorageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    listMaterials().then(items => { if (active) setMaterials(items.sort((a, b) => b.createdAt - a.createdAt)); }).catch(() => { if (active) setStorageError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const visible = archive ? [] : materials.filter(item => item.title.toLocaleLowerCase("id").includes(query.toLocaleLowerCase("id")));
  function openFile(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
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
        <div><h1 id="welcome-title">Besok mengajar apa,<br />Guru?</h1><button className="upload-button" type="button" onClick={() => setUploading(true)}><Upload size={20} />Unggah materi</button></div>
        <div className="welcome-character" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div>
      </section>
      <section className="materials" aria-labelledby="materials-title">
        <h2 id="materials-title">{archive ? "Arsip materi" : "Materi"}</h2>
        <div className="material-actions"><div className="filters" role="group" aria-label="Tampilan materi"><button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}><Files size={18} />Aktif</button><button type="button" aria-pressed={archive} onClick={() => setArchive(true)}><Archive size={18} />Arsip</button></div><button className="manage" type="button" disabled><FolderCog size={20} />Kelola mapel</button></div>
        <label className="search-label">Cari materi<span className="search-box"><Search size={20} aria-hidden="true" /><input type="search" placeholder="Nama materi" value={query} onChange={e => setQuery(e.target.value)} /></span></label>
        {loading ? <p role="status">Memuat materi…</p> : storageError ? <p role="alert">Materi tidak dapat dimuat. Periksa pengaturan penyimpanan browser.</p> : visible.length ? <div className="material-list">{visible.map(item => <button className="material-card" type="button" key={item.id} onClick={() => setSelected(item)}><span className="material-file-icon"><FileText size={30} /></span><span><strong>{item.title}</strong><small>{item.file?.name || "Teks materi"}</small></span><span className="material-arrow" aria-hidden="true">›</span></button>)}</div> : <div className="empty-library" role="status"><Mascot kind="correction" mood="calm" /><h3>{query ? "Materi tidak ditemukan" : archive ? "Belum ada materi di arsip" : "Materi pertama"}</h3>{!archive && !query && <button type="button" className="upload-button" onClick={() => setUploading(true)}><Upload size={20} />Unggah materi</button>}</div>}
      </section>
    </main>
    {uploading && <UploadMaterial onClose={() => setUploading(false)} onSaved={material => { setMaterials(items => [material, ...items]); setStorageError(false); setArchive(false); setQuery(""); setUploading(false); }} />}
    {selected && <Modal title={selected.title} onClose={() => setSelected(null)}><div className="material-detail"><h2>{selected.title}</h2>{selected.file && <button className="source-secondary" type="button" onClick={() => openFile(selected.file)}><FileText size={20} />{selected.file.name}</button>}{selected.text && <p>{selected.text}</p>}</div></Modal>}
  </>;
}
