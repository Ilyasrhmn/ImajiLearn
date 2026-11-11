"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, FileText, Files, Folder, FolderClosed, FolderCog, FolderInput, Pin, PinOff, Search, Trash2, Upload } from "lucide-react";
import { Mascot } from "./mascot";
import UploadMaterial from "./upload-material";
import { formats } from "./material-formats.mjs";
import Notice from "./notice";
import Modal, { closeModal } from "./modal";
import FolderManager from "./folder-manager";
import ThemedSelect from "./themed-select";
import { NO_SUBJECT_LABEL, deleteMaterial, listFolders, listMaterials, updateMaterial } from "../lib/materials";
import ActionConfirmation from "@imajilearn/shared/components/action-confirmation.jsx";

export default function MaterialLibrary({ teacherId }) {
  const [archive, setArchive] = useState(false);
  const [page, setPage] = useState(1);
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const router = useRouter();
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    function syncLocation() {
      setFolderId(new URLSearchParams(window.location.search).get("folder") || "");
      setQuery("");
      setPage(1);
    }
    window.addEventListener("popstate", syncLocation);
    Promise.all([listMaterials(teacherId), listFolders(teacherId)]).then(([items, subjects]) => {
      if (!active) return;
      setMaterials(items);
      setFolders(subjects);
      const folder = new URLSearchParams(window.location.search).get("folder");
      if (folder && !subjects.some(subject => subject.id === folder)) {
        const url = new URL(window.location.href);
        url.searchParams.delete("folder");
        window.history.replaceState({}, "", url);
      }
      syncLocation();
    }).catch(() => { if (active) setStorageError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener("popstate", syncLocation); };
  }, [teacherId, loadAttempt]);
  const activeFolder = folders.find(folder => folder.id === folderId);
  const visible = materials.filter(item => Boolean(item.archived) === archive && (folderId ? item.folderId === folderId : archive || query.trim() || !item.folderId) && `${item.title} ${item.file?.name || ""}`.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt);
  const pageCount = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * 10, currentPage * 10);
  function onSaved(material) {
    setPage(1);
    setMaterials(items => [material, ...items.filter(item => item.id !== material.id)]);
    setUploading(false);
    setArchive(false);
    setQuery("");
    const destination = folders.find(folder => folder.id === material.folderId);
    const message = destination ? `Materi tersimpan di ${destination.name}`
      : folderId ? `Materi tersimpan di ${NO_SUBJECT_LABEL}` : "Materi tersimpan";
    setNotice({ message, type: "success" });
  }
  function retryLoad() {
    setStorageError(false);
    setLoading(true);
    setLoadAttempt(attempt => attempt + 1);
  }
  function openFolder(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("folder", id); else url.searchParams.delete("folder");
    window.history.pushState({}, "", url);
    setFolderId(id); setQuery(""); setPage(1);
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
  return <>
      <section id="materi" className="materials create-media-library" aria-labelledby="materials-title">
        <div className="create-media-library-heading">
        {folderId ? <nav className="material-location" aria-label="Lokasi materi">
          <h2 id="materials-title">
            <a href="/buat-media#materi" onClick={event => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              openFolder("");
            }}>Materi</a>
            <ChevronRight aria-hidden="true" />
            <span aria-current="page">{activeFolder?.name ?? "Folder tidak ditemukan"}</span>
          </h2>
        </nav> : <h2 id="materials-title">{archive ? "Arsip materi" : "Materi"}</h2>}
        </div>
        <div className="material-actions"><div className="filters" role="group" aria-label="Tampilan materi"><button type="button" aria-pressed={!archive} onClick={() => { setArchive(false); setPage(1); }}><Files size={18} />Aktif</button><button type="button" aria-pressed={archive} onClick={() => { setArchive(true); setPage(1); }}><Archive size={18} />Arsip</button></div><div className="material-library-tools"><button className="manage" type="button" onClick={() => setManaging(true)}><FolderCog size={20} aria-hidden="true" /><span>Kelola mapel</span></button><button className="manage library-upload" type="button" disabled={loading || storageError} onClick={() => setUploading(true)}><Upload size={20} aria-hidden="true" /><span>Unggah materi</span></button></div></div>
        <label className="search-box">
          <Search size={20} aria-hidden="true" />
          <input type="search" aria-label="Cari nama materi" placeholder="Cari nama materi" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        </label>
        {!archive && !folderId && !query.trim() && folders.length > 0 && <div className="subject-folder-grid">{folders.map(folder => <button className="subject-folder" type="button" key={folder.id} onClick={() => openFolder(folder.id)}><span className="subject-folder-icon" aria-hidden="true"><Folder size={48} strokeWidth={1.5} /><FolderClosed className="folder-flap" size={48} strokeWidth={1.5} /></span><span>{folder.name}</span></button>)}</div>}
        {!archive && !folderId && !query.trim() && folders.length > 0 && visible.length > 0 && <h3 className="unfiled-heading">{NO_SUBJECT_LABEL}</h3>}
        {loading ? <div className="materials-skeleton" role="status" aria-label="Memuat materi"><span /><span /></div> : storageError ? <div><p role="alert">Materi tidak dapat dimuat.</p><button className="source-secondary" type="button" onClick={retryLoad}>Coba lagi</button></div> : !archive && !folderId && !query.trim() && folders.length > 0 && !visible.length ? null : visible.length ? <div className="material-list">{pageItems.map(item => <article className="material-card" key={item.id}><button className="material-card-open" type="button" disabled={busy} onClick={() => router.push(`/materi/${encodeURIComponent(item.id)}`)}><span className="material-file-icon"><FileText size={30} /></span><span className="material-card-label"><strong>{item.title}</strong><small>{formats.filter(format => item.selectedMedia?.includes(format.id)).map(format => format.label).join(" · ") || item.file?.name || "Teks materi"}</small></span></button><div className="material-card-actions" role="group" aria-label={`Kelola ${item.title}`}><button type="button" disabled={busy} title={item.pinned ? "Lepas sematan" : "Sematkan"} aria-label={item.pinned ? "Lepas sematan" : "Sematkan"} aria-pressed={Boolean(item.pinned)} onClick={() => update(item, { pinned: !item.pinned }, item.pinned ? "Sematan dilepas" : "Materi disematkan")}>{item.pinned ? <PinOff size={20} /> : <Pin size={20} />}</button><button type="button" disabled={busy} title={item.archived ? "Pulihkan materi" : "Arsipkan"} aria-label={item.archived ? "Pulihkan materi" : "Arsipkan"} onClick={() => update(item, { archived: !item.archived }, item.archived ? "Materi dipulihkan" : "Materi diarsipkan")}>{item.archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}</button><button type="button" disabled={busy} title="Pindahkan materi" aria-label="Pindahkan materi" onClick={() => { setMoving(item); setDestination(item.folderId || ""); setMoveError(""); }}><FolderInput size={20} /></button><button className="material-delete" type="button" disabled={busy} title="Hapus materi" aria-label="Hapus materi" onClick={() => { setDeleteError(""); setDeleting(item); }}><Trash2 size={20} /></button></div></article>)}</div> : <div className="empty-library" role="status"><Mascot kind="correction" mood="calm" /><div><h3>{query ? "Materi tidak ditemukan" : archive ? "Belum ada materi di arsip" : folderId ? "Belum ada materi di folder ini" : "Materi pertama Anda dimulai di sini."}</h3>{!archive && !query && <button type="button" className="empty-upload" onClick={() => setUploading(true)}>Tambahkan bahan ajar <span aria-hidden="true">+</span></button>}</div></div>}
        {!loading && !storageError && visible.length > 10 && <nav className="material-pagination" aria-label="Halaman materi">
          <span aria-live="polite">{(currentPage - 1) * 10 + 1} - {Math.min(currentPage * 10, visible.length)} dari {visible.length} materi</span>
          <div><button className="source-secondary" type="button" disabled={currentPage === 1 || busy} onClick={() => setPage(currentPage - 1)} aria-label="Halaman materi sebelumnya"><ChevronLeft size={18} aria-hidden="true" /><span>Sebelumnya</span></button>
          <span>{currentPage} / {pageCount}</span>
          <button className="source-secondary" type="button" disabled={currentPage === pageCount || busy} onClick={() => setPage(currentPage + 1)} aria-label="Halaman materi berikutnya"><span>Berikutnya</span><ChevronRight size={18} aria-hidden="true" /></button></div>
        </nav>}
      </section>
    {managing && <FolderManager teacherId={teacherId} folders={folders} onClose={() => { setManaging(false); setNotice(null); }} onNotice={setNotice} onChange={next => { setFolders(next); if (folderId && !next.some(folder => folder.id === folderId)) openFolder(""); }} />}
    {moving && <Modal title="Pindahkan materi" onClose={() => setMoving(null)}><div className="move-material"><h2>Pindahkan materi</h2><label className="source-field" htmlFor="move-destination">Mapel</label><ThemedSelect id="move-destination" value={destination} onChange={e => setDestination(e.target.value)}><option value="">{NO_SUBJECT_LABEL}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</ThemedSelect>{moveError && <p className="source-error" role="alert">{moveError}</p>}<div className="source-actions"><button type="button" className="source-secondary" onClick={() => closeModal(() => setMoving(null))} disabled={busy}>Batal</button><button type="button" className="upload-button" disabled={busy} onClick={moveMaterial}>Pindahkan</button></div></div></Modal>}
    {notice && <Notice notice={notice} onDismiss={dismissNotice} insideDialog={managing} />}
    {deleting && <Modal title="Hapus materi" className="action-confirmation-dialog" dismissible={!busy} onClose={() => setDeleting(null)}>
      <ActionConfirmation title="Hapus materi ini?" confirmLabel="Hapus materi" busy={busy} error={deleteError}
        onCancel={() => closeModal(() => setDeleting(null))} onConfirm={remove}>
        <p><strong>{deleting.title}</strong> akan dihapus dari akun Anda.</p>
      </ActionConfirmation>
    </Modal>}
    {uploading && <UploadMaterial teacherId={teacherId} folders={folders} initialFolder={folderId} onClose={() => setUploading(false)} onSaved={onSaved} />}
  </>;
}
