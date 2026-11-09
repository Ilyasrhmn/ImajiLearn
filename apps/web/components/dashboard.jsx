"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Archive, ArchiveRestore, BookOpen, CalendarDays, ClipboardPenLine, FileText, Files, Folder, FolderClosed, FolderCog, FolderInput, ArrowLeft, Pin, PinOff, Scissors, Search, Trash2, Upload } from "lucide-react";
import { Mascot } from "./mascot";
import AccountAvatar from "./account-avatar";
import LogoutButton from "./logout-button";
import UploadMaterial from "./upload-material";
import MaterialDetail, { formats } from "./material-detail";
import Notice from "./notice";
import Modal, { closeModal } from "./modal";
import FolderManager from "./folder-manager";
import ThemedSelect from "./themed-select";
import { deleteMaterial, getMaterial, listFolders, listMaterials, updateMaterial } from "../lib/materials";

export default function Dashboard({ teacherId }) {
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
    Promise.all([listMaterials(teacherId), listFolders(teacherId)]).then(([items, subjects]) => { if (active) { setMaterials(items.sort((a, b) => b.createdAt - a.createdAt)); setFolders(subjects); setFolderId(new URLSearchParams(window.location.search).get("folder") || ""); } }).catch(() => { if (active) setStorageError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener("popstate", syncLocation); };
  }, [teacherId]);
  const activeFolder = folders.find(folder => folder.id === folderId);
  const visible = materials.filter(item => Boolean(item.archived) === archive && (folderId ? item.folderId === folderId : archive || query.trim() || !item.folderId) && `${item.title} ${item.file?.name || ""}`.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt);
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
      const updated = await updateMaterial(teacherId, moving, { folderId: destination });
      setMaterials(items => items.map(item => item.id === moving.id ? updated : item));
      setMoving(null); setNotice({ message: "Materi dipindahkan", type: "success" });
    } catch (error) { setMoveError(error.message); }
    finally { setBusy(false); }
  }
  async function update(item, changes, message) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updateMaterial(teacherId, item, changes);
      setMaterials(items => items.map(current => current.id === item.id ? updated : current));
      setNotice({ message, type: "success" });
    } catch (error) { setNotice({ message: error.message, type: "error" }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !deleting) return;
    setBusy(true);
    setDeleteError("");
    try {
      await deleteMaterial(teacherId, deleting);
      setMaterials(items => items.filter(item => item.id !== deleting.id));
      setDeleting(null);
      setNotice({ message: "Materi dihapus", type: "delete" });
    } catch (error) { setDeleteError(error.message); }
    finally { setBusy(false); }
  }
  async function openMaterial(item) {
    if (busy) return;
    setBusy(true);
    try {
      const detail = await getMaterial(teacherId, item.id);
      setSelected({ ...item, ...detail });
    } catch (error) {
      setNotice({ message: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  }
  return <>
    <a className="skip-link" href="#main">Lewati ke isi</a>
    <header className="workspace-header"><div className="header-inner">
      <a className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></a>
      <div className="account-actions"><AccountAvatar teacherId={teacherId} /><LogoutButton /></div>
    </div></header>
    <main id="main" className="workspace-shell dashboard">
      <nav className="studio-sections" aria-label="Navigasi studio">
        <a href="/dashboard" aria-current="page"><BookOpen size={20} />Materi</a>
        <a href="/lkpd"><Scissors size={20} />LKPD</a>
        <a href="/ujian"><ClipboardPenLine size={20} />Soal &amp; ujian</a>
        <a href="/jadwal"><CalendarDays size={20} />Jadwal</a>
      </nav>
      <section className="welcome" aria-labelledby="welcome-title">
        <div><h1 id="welcome-title">Besok mengajar apa,<br />Guru?</h1><button className="upload-button" type="button" onClick={() => setUploading(true)}><Upload size={20} />Unggah materi</button></div>
        <div className="welcome-character" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div>
      </section>
      <section className="materials" aria-labelledby="materials-title">
        {folderId && <button className="folder-back" type="button" onClick={() => openFolder("")}><ArrowLeft size={19} />Semua materi</button>}<h2 id="materials-title">{archive ? "Arsip materi" : activeFolder?.name || "Materi"}</h2>
        <div className="material-actions"><div className="filters" role="group" aria-label="Tampilan materi"><button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}><Files size={18} />Aktif</button><button type="button" aria-pressed={archive} onClick={() => setArchive(true)}><Archive size={18} />Arsip</button></div><button className="manage" type="button" onClick={() => setManaging(true)}><FolderCog size={20} />Kelola mapel</button></div>
        <label className="search-label">Cari materi<span className="search-box"><Search size={20} aria-hidden="true" /><input type="search" placeholder="Nama materi" value={query} onChange={e => setQuery(e.target.value)} /></span></label>
        {!archive && !folderId && !query.trim() && folders.length > 0 && <div className="subject-folder-grid">{folders.map(folder => <button className="subject-folder" type="button" key={folder.id} onClick={() => openFolder(folder.id)}><span className="subject-folder-icon" aria-hidden="true"><Folder size={48} strokeWidth={1.5} /><FolderClosed className="folder-flap" size={48} strokeWidth={1.5} /></span><span>{folder.name}</span></button>)}</div>}
        {!archive && !folderId && !query.trim() && folders.length > 0 && visible.length > 0 && <h3 className="unfiled-heading">Belum masuk folder</h3>}
        {loading ? <div className="materials-skeleton" role="status" aria-label="Memuat materi"><span /><span /></div> : storageError ? <p role="alert">Materi tidak dapat dimuat. Muat ulang untuk mencoba lagi.</p> : !archive && !folderId && !query.trim() && folders.length > 0 && !visible.length ? null : visible.length ? <div className="material-list">{visible.map(item => <article className="material-card" key={item.id}><button className="material-card-open" type="button" disabled={busy} onClick={() => openMaterial(item)}><span className="material-file-icon"><FileText size={30} /></span><span className="material-card-label"><strong>{item.title}</strong><small>{formats.filter(format => item.selectedMedia?.includes(format.id)).map(format => format.label).join(" · ") || item.file?.name || "Teks materi"}</small></span></button><div className="material-card-actions" role="group" aria-label={`Kelola ${item.title}`}><button type="button" disabled={busy} title={item.pinned ? "Lepas sematan" : "Sematkan"} aria-label={item.pinned ? "Lepas sematan" : "Sematkan"} aria-pressed={Boolean(item.pinned)} onClick={() => update(item, { pinned: !item.pinned }, item.pinned ? "Sematan dilepas" : "Materi disematkan")}>{item.pinned ? <PinOff size={20} /> : <Pin size={20} />}</button><button type="button" disabled={busy} title={item.archived ? "Pulihkan materi" : "Arsipkan"} aria-label={item.archived ? "Pulihkan materi" : "Arsipkan"} onClick={() => update(item, { archived: !item.archived }, item.archived ? "Materi dipulihkan" : "Materi diarsipkan")}>{item.archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}</button><button type="button" disabled={busy} title="Pindahkan materi" aria-label="Pindahkan materi" onClick={() => { setMoving(item); setDestination(item.folderId || ""); setMoveError(""); }}><FolderInput size={20} /></button><button className="material-delete" type="button" disabled={busy} title="Hapus materi" aria-label="Hapus materi" onClick={() => { setDeleteError(""); setDeleting(item); }}><Trash2 size={20} /></button></div></article>)}</div> : <div className="empty-library" role="status"><Mascot kind="correction" mood="calm" /><div><h3>{query ? "Materi tidak ditemukan" : archive ? "Belum ada materi di arsip" : folderId ? "Belum ada materi di folder ini" : "Materi pertama Anda dimulai di sini."}</h3>{!archive && !query && <button type="button" className="empty-upload" onClick={() => setUploading(true)}>Tambahkan bahan ajar <span aria-hidden="true">+</span></button>}</div></div>}
      </section>
    </main>
    {managing && <FolderManager teacherId={teacherId} folders={folders} onClose={() => { setManaging(false); setNotice(null); }} onNotice={setNotice} onChange={next => { setFolders(next); if (folderId && !next.some(folder => folder.id === folderId)) openFolder(""); }} />}
    {moving && <Modal title="Pindahkan materi" onClose={() => setMoving(null)}><div className="move-material"><h2>Pindahkan materi</h2><label className="source-field" htmlFor="move-destination">Mapel</label><ThemedSelect id="move-destination" value={destination} onChange={e => setDestination(e.target.value)}><option value="">Tanpa mata pelajaran</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</ThemedSelect>{moveError && <p className="source-error" role="alert">{moveError}</p>}<div className="source-actions"><button type="button" className="source-secondary" onClick={() => closeModal(() => setMoving(null))} disabled={busy}>Batal</button><button type="button" className="upload-button" disabled={busy} onClick={moveMaterial}>Pindahkan</button></div></div></Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} insideDialog={managing} />}
    {deleting && <Modal title="Hapus materi" onClose={() => !busy && setDeleting(null)}><div className="material-confirm"><Mascot kind="eraser" mood="think" /><h2>Hapus materi ini?</h2><p><strong>{deleting.title}</strong> akan dihapus dari akun Anda.</p>{deleteError && <p className="source-error" role="alert">{deleteError}</p>}<div className="source-actions"><button type="button" className="source-secondary" disabled={busy} onClick={() => closeModal(() => setDeleting(null))}>Batal</button><button type="button" className="upload-button" disabled={busy} onClick={remove}>{busy ? "Menghapus..." : "Ya, hapus materi"}</button></div></div></Modal>}
    {uploading && <UploadMaterial teacherId={teacherId} folders={folders} initialFolder={folderId} onClose={() => setUploading(false)} onSaved={material => { setMaterials(items => [material, ...items]); setStorageError(false); setArchive(false); openFolder(material.folderId || ""); setUploading(false); setNotice({ message: "Materi tersimpan", type: "success" }); }} />}
    {selected && <MaterialDetail teacherId={teacherId} material={selected} onClose={() => setSelected(null)} onSaved={updated => { setMaterials(items => items.map(item => item.id === updated.id ? updated : item)); setSelected(null); setNotice({ message: "Pilihan disimpan", type: "success" }); }} />}
  </>;
}
