"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Archive, ArchiveRestore, BookOpen, CalendarDays, ChevronRight, ClipboardPenLine, FileText, Files, Folder, FolderCog, FolderInput, ArrowLeft, LogOut, Pin, PinOff, Scissors, Search, Trash2, Upload } from "lucide-react";
import { Mascot } from "./mascot";
import UploadMaterial from "./upload-material";
import MaterialDetail, { formats } from "./material-detail";
import Notice from "./notice";
import Modal, { closeModal } from "./modal";
import FolderManager from "./folder-manager";
import ThemedSelect from "./themed-select";
import { deleteMaterial, listFolders, listMaterials, updateMaterial } from "../lib/materials";

export default function Dashboard() {
  const [archive, setArchive] = useState(false);
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState("");
  const [managing, setManaging] = useState(false);
  const [moving, setMoving] = useState(null);
  const [destination, setDestination] = useState("");
  const [moveError, setMoveError] = useState("");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [storageError, setStorageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    const syncLocation = () => setFolderId(new URLSearchParams(window.location.search).get("folder") || "");
    window.addEventListener("popstate", syncLocation);
    Promise.all([listMaterials(), listFolders()]).then(([items, subjects]) => { if (active) { setMaterials(items.sort((a, b) => b.createdAt - a.createdAt)); setFolders(subjects); setFolderId(new URLSearchParams(window.location.search).get("folder") || ""); } }).catch(() => { if (active) setStorageError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener("popstate", syncLocation); };
  }, []);
  const activeFolder = folders.find(folder => folder.id === folderId);
  const visible = materials.filter(item => Boolean(item.archived) === archive && (query.trim() ? true : folderId ? item.folderId === folderId : !item.folderId) && `${item.title} ${item.file?.name || ""}`.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt);
  function openFolder(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("folder", id); else url.searchParams.delete("folder");
    window.history.pushState({}, "", url);
    setFolderId(id); setQuery("");
  }
  async function moveMaterial() {
    if (busy || !moving) return;
    setBusy(true); setMoveError("");
    try {
      const updated = await updateMaterial(moving.id, { folderId: destination });
      setMaterials(items => items.map(item => item.id === moving.id ? updated : item));
      setMoving(null); setNotice({ message: "Materi dipindahkan", type: "success" });
    } catch { setMoveError("Materi belum dipindahkan. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function update(item, changes, message) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updateMaterial(item.id, changes);
      setMaterials(items => items.map(current => current.id === item.id ? updated : current));
      setNotice({ message, type: "success" });
    } catch { setNotice({ message: "Perubahan belum tersimpan. Coba lagi.", type: "error" }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !deleting) return;
    setBusy(true);
    setDeleteError("");
    try {
      await deleteMaterial(deleting.id);
      setMaterials(items => items.filter(item => item.id !== deleting.id));
      setDeleting(null);
      setNotice({ message: "Materi dihapus", type: "delete" });
    } catch { setDeleteError("Materi belum terhapus. Coba lagi."); }
    finally { setBusy(false); }
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
        {folderId && <button className="folder-back" type="button" onClick={() => openFolder("")}><ArrowLeft size={19} />Semua materi</button>}<h2 id="materials-title">{archive ? "Arsip materi" : activeFolder?.name || "Materi"}</h2>
        <div className="material-actions"><div className="filters" role="group" aria-label="Tampilan materi"><button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}><Files size={18} />Aktif</button><button type="button" aria-pressed={archive} onClick={() => setArchive(true)}><Archive size={18} />Arsip</button></div><button className="manage" type="button" onClick={() => setManaging(true)}><FolderCog size={20} />Kelola mapel</button></div>
        <label className="search-label">Cari materi<span className="search-box"><Search size={20} aria-hidden="true" /><input type="search" placeholder="Nama materi" value={query} onChange={e => setQuery(e.target.value)} /></span></label>
        {!archive && !folderId && !query.trim() && folders.length > 0 && <div className="subject-folder-grid">{folders.map(folder => <button className="subject-folder" type="button" key={folder.id} onClick={() => openFolder(folder.id)}><Folder size={38} aria-hidden="true" /><span>{folder.name}</span></button>)}</div>}
        {!archive && !folderId && !query.trim() && folders.length > 0 && visible.length > 0 && <h3 className="unfiled-heading">Belum masuk folder</h3>}
        {loading ? <p role="status">Memuat materi...</p> : storageError ? <p role="alert">Materi tidak dapat dimuat. Periksa pengaturan penyimpanan browser.</p> : !archive && !folderId && !query.trim() && folders.length > 0 && !visible.length ? null : visible.length ? <div className="material-list">{visible.map(item => <article className="material-card" key={item.id}><button className="material-card-open" type="button" onClick={() => setSelected(item)}><span className="material-file-icon"><FileText size={30} /></span><span className="material-card-label"><strong>{item.title}</strong><small>{formats.filter(format => item.selectedMedia?.includes(format.id)).map(format => format.label).join(" · ") || item.file?.name || "Teks materi"}</small></span><ChevronRight className="material-arrow" size={22} aria-hidden="true" /></button><div className="material-card-actions" role="group" aria-label={`Kelola ${item.title}`}><button type="button" disabled={busy} title={item.pinned ? "Lepas sematan" : "Sematkan"} aria-label={item.pinned ? "Lepas sematan" : "Sematkan"} aria-pressed={Boolean(item.pinned)} onClick={() => update(item, { pinned: !item.pinned }, item.pinned ? "Sematan dilepas" : "Materi disematkan")}>{item.pinned ? <PinOff size={20} /> : <Pin size={20} />}</button><button type="button" disabled={busy} title={item.archived ? "Pulihkan materi" : "Arsipkan"} aria-label={item.archived ? "Pulihkan materi" : "Arsipkan"} onClick={() => update(item, { archived: !item.archived }, item.archived ? "Materi dipulihkan" : "Materi diarsipkan")}>{item.archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}</button><button type="button" disabled={busy} title="Pindahkan materi" aria-label="Pindahkan materi" onClick={() => { setMoving(item); setDestination(item.folderId || ""); setMoveError(""); }}><FolderInput size={20} /></button><button className="material-delete" type="button" disabled={busy} title="Hapus materi" aria-label="Hapus materi" onClick={() => { setDeleteError(""); setDeleting(item); }}><Trash2 size={20} /></button></div></article>)}</div> : <div className="empty-library" role="status"><Mascot kind="correction" mood="calm" /><h3>{query ? "Materi tidak ditemukan" : archive ? "Belum ada materi di arsip" : folderId ? "Belum ada materi di folder ini" : "Materi pertama"}</h3>{!archive && !query && <button type="button" className="upload-button" onClick={() => setUploading(true)}><Upload size={20} />Unggah materi</button>}</div>}
      </section>
    </main>
    {managing && <FolderManager folders={folders} onClose={() => { setManaging(false); setNotice(null); }} onNotice={setNotice} onChange={next => { setFolders(next); if (folderId && !next.some(folder => folder.id === folderId)) openFolder(""); }} />}
    {moving && <Modal title="Pindahkan materi" onClose={() => setMoving(null)}><div className="move-material"><h2>Pindahkan materi</h2><label className="source-field" htmlFor="move-destination">Mapel</label><ThemedSelect id="move-destination" value={destination} onChange={e => setDestination(e.target.value)}><option value="">Belum masuk folder</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</ThemedSelect>{moveError && <p className="source-error" role="alert">{moveError}</p>}<div className="source-actions"><button type="button" className="source-secondary" onClick={() => closeModal(() => setMoving(null))} disabled={busy}>Batal</button><button type="button" className="upload-button" disabled={busy} onClick={moveMaterial}>Pindahkan</button></div></div></Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} insideDialog={managing} />}
    {deleting && <Modal title="Hapus materi" onClose={() => !busy && setDeleting(null)}><div className="material-confirm"><Mascot kind="eraser" mood="think" /><h2>Hapus materi ini?</h2><p><strong>{deleting.title}</strong> akan dihapus dari perangkat ini.</p>{deleteError && <p className="source-error" role="alert">{deleteError}</p>}<div className="source-actions"><button type="button" className="source-secondary" disabled={busy} onClick={() => closeModal(() => setDeleting(null))}>Batal</button><button type="button" className="upload-button" disabled={busy} onClick={remove}>{busy ? "Menghapus..." : "Ya, hapus materi"}</button></div></div></Modal>}
    {uploading && <UploadMaterial folders={folders} initialFolder={folderId} onClose={() => setUploading(false)} onSaved={material => { setMaterials(items => [material, ...items]); setStorageError(false); setArchive(false); openFolder(material.folderId || ""); setUploading(false); setNotice({ message: "Materi tersimpan", type: "success" }); }} />}
    {selected && <MaterialDetail material={selected} onClose={() => setSelected(null)} onSaved={updated => { setMaterials(items => items.map(item => item.id === updated.id ? updated : item)); setSelected(null); setNotice({ message: "Pilihan disimpan", type: "success" }); }} />}
  </>;
}
