"use client";
import ActionConfirmation from "@imajilearn/shared/components/action-confirmation.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowRight, FolderCog, FolderInput, MoreHorizontal, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { materialAppearance } from "../lib/presentation.mjs";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { NO_SUBJECT_LABEL, deleteMaterial, getMaterial, listFolders, listMaterials, updateMaterial } from "@imajilearn/shared/lib/materials.mjs";
import { useSession } from "./session-gate";
import { Empty, ErrorState, Feedback, Loading, PageTitle, Sheet } from "./ui";
import MaterialUpload from "./material-upload";
import MaterialDetail from "./material-detail";
import FolderManager from "./folder-manager";

export default function MaterialsScreen() {
  const { id: teacherId } = useSession();
  const [items, setItems] = useState([]), [folders, setFolders] = useState([]), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(""), [archive, setArchive] = useState(false), [folderId, setFolderId] = useState("all");
  const [sheet, setSheet] = useState(null), [busy, setBusy] = useState(false), [sheetError, setSheetError] = useState("");
  const lock = useRef(false), mounted = useRef(true), openedQuery = useRef(false);
  const updateList = useCallback(updated => setItems(previous => previous.map(item => item.id === updated.id ? updated : item)), []);
  useEffect(() => {
    mounted.current = true; let active = true;
    Promise.all([listMaterials(teacherId), listFolders(teacherId)]).then(async ([materials, subjects]) => {
      if (!active) return;
      setItems(materials); setFolders(subjects); setLoaded(true);
      if (!openedQuery.current) {
        const params = new URLSearchParams(window.location.search);
        const folder = params.get("folder"); if (subjects.some(item => item.id === folder)) setFolderId(folder);
        if (params.get("tambah") === "1") setSheet({ type: "upload" });
        else if (params.get("buka")) {
          const base = materials.find(item => item.id === params.get("buka"));
          if (!base) { setError("Materi tidak ditemukan."); return; }
          const detail = await getMaterial(teacherId, base.id);
          if (active) setSheet({ type: "detail", item: { ...base, ...detail } });
        }
        if (active) openedQuery.current = true;
      }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; mounted.current = false; };
  }, [teacherId, attempt]);
  function open(type, item) { setSheetError(""); setNotice(""); setSheet({ type, item }); }
  async function detail(item) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const result = await getMaterial(teacherId, item.id); if (mounted.current) open("detail", { ...item, ...result }); }
    catch (err) { if (mounted.current) setError(err.message); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function change(item, changes, message) {
    if (lock.current) return; lock.current = true; setBusy(true); setSheetError("");
    try { const result = await updateMaterial(teacherId, item, changes); if (mounted.current) { updateList(result); setSheet(null); setNotice(message); } }
    catch (err) { if (mounted.current) setSheetError(err.message); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function remove(item) {
    if (lock.current) return; lock.current = true; setBusy(true); setSheetError("");
    try { await deleteMaterial(teacherId, item); if (mounted.current) { setItems(previous => previous.filter(row => row.id !== item.id)); setSheet(null); setNotice("Materi dihapus."); } }
    catch (err) { if (mounted.current) setSheetError(err.message); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const visible = items.filter(item => Boolean(item.archived) === archive && (folderId === "all" || (folderId === "unfiled" ? !item.folderId : item.folderId === folderId)) && `${item.title} ${item.file?.name || ""}`.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt);
  const onClose = () => { setSheet(null); setSheetError(""); };
  return <><PageTitle title="Materi" action={<button className="icon-button add-button" aria-label="Tambah materi" disabled={!loaded || busy} onClick={() => open("upload")}><Plus size={25} /></button>} /><label className="search-input"><Search size={20} /><input type="search" aria-label="Cari materi" placeholder="Cari materi" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="filter-strip" aria-label="Tampilan materi"><button aria-pressed={!archive} onClick={() => setArchive(false)}>Aktif</button><button aria-pressed={archive} onClick={() => setArchive(true)}>Arsip</button></div><label className="field folder-select"><span className="sr-only">Filter mapel</span><select value={folderId} onChange={event => setFolderId(event.target.value)}><option value="all">Semua mapel</option><option value="unfiled">{NO_SUBJECT_LABEL}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><div className="material-tools"><span>{loaded ? `${visible.length} materi` : ""}</span><button disabled={!loaded || busy} onClick={() => open("folders")}><FolderCog size={18} />Kelola mapel</button></div><Feedback>{notice}</Feedback>{error && <ErrorState message={error} onRetry={() => { setError(""); setAttempt(n => n + 1); }} />}{!loaded && !error ? <Loading label="Memuat materi" /> : loaded && visible.length ? <div className="material-grid" aria-busy={busy}>{visible.map(item => <article className="thumbnail-card material-tile" key={item.id}><button className="open-material" disabled={busy} onClick={() => detail(item)} aria-label={`Buka ${item.title}`}><div className={`thumbnail material-thumbnail ${materialAppearance(item.id).tone}`}><Mascot kind={materialAppearance(item.id).kind} /></div><div className="thumbnail-caption"><strong>{item.title}</strong><small>{folders.find(folder => folder.id === item.folderId)?.name || item.file?.name || "Teks materi"}</small>{item.extractionStatus === "failed" && <span className="file-status">Teks belum terbaca</span>}</div></button>{item.pinned && <Pin size={16} className="pinned-marker" aria-label="Disematkan" />}<button className="icon-button tile-menu" disabled={busy} aria-label={`Kelola ${item.title}`} onClick={() => open("menu", item)}><MoreHorizontal size={20} /></button></article>)}</div> : loaded && <Empty title={query ? "Materi tidak ditemukan" : archive ? "Arsip masih kosong" : "Belum ada materi"}>{!archive && !query && <button className="primary" onClick={() => open("upload")}><Plus size={18} />Tambah materi</button>}</Empty>}
    {sheet?.type === "upload" && <MaterialUpload teacherId={teacherId} folders={folders} folderId={folders.some(folder => folder.id === folderId) ? folderId : ""} onClose={onClose} onSaved={item => { setItems(previous => [item, ...previous]); setArchive(false); setFolderId(item.folderId || "all"); setQuery(""); setSheet(null); setNotice("Materi disimpan."); }} />}
    {sheet?.type === "detail" && <MaterialDetail teacherId={teacherId} item={sheet.item} onClose={onClose} onSaved={updated => { updateList(updated); setSheet(null); setNotice("Pilihan media disimpan."); }} />}
    {sheet?.type === "folders" && <FolderManager teacherId={teacherId} folders={folders} onClose={onClose} onChange={(next, removed) => { setFolders(next); if (removed) { setItems(previous => previous.map(item => item.folderId === removed ? { ...item, folderId: null } : item)); if (folderId === removed) setFolderId("all"); setAttempt(n => n + 1); } }} />}
    {sheet?.type === "menu" && <Sheet title={sheet.item.title} busy={busy} onClose={onClose}><div className="material-menu"><button disabled={busy} onClick={() => change(sheet.item, { pinned: !sheet.item.pinned }, sheet.item.pinned ? "Sematan dilepas." : "Materi disematkan.")}>{sheet.item.pinned ? <PinOff size={20} /> : <Pin size={20} />}{sheet.item.pinned ? "Lepas sematan" : "Sematkan"}</button><button disabled={busy} onClick={() => change(sheet.item, { archived: !sheet.item.archived }, sheet.item.archived ? "Materi dipulihkan." : "Materi diarsipkan.")}>{sheet.item.archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}{sheet.item.archived ? "Pulihkan materi" : "Arsipkan"}</button><button disabled={busy} onClick={() => open("move", sheet.item)}><FolderInput size={20} />Pindahkan mapel</button><button className="danger-text" onClick={() => open("delete", sheet.item)}><Trash2 size={20} />Hapus materi</button></div><Feedback error>{sheetError}</Feedback></Sheet>}
    {sheet?.type === "move" && <Sheet title="Pindahkan materi" busy={busy} onClose={onClose}><form onSubmit={event => { event.preventDefault(); change(sheet.item, { folderId: new FormData(event.currentTarget).get("folderId") }, "Materi dipindahkan."); }}><label className="field">Mapel<select name="folderId" defaultValue={sheet.item.folderId || ""} disabled={busy}><option value="">{NO_SUBJECT_LABEL}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><Feedback error>{sheetError}</Feedback><button className="primary full section" disabled={busy}>Pindahkan<ArrowRight size={18} /></button></form></Sheet>}
    {sheet?.type === "delete" && <Sheet title="Hapus materi?" confirmation busy={busy} onClose={onClose}>
      <ActionConfirmation mobile title="Hapus materi ini?" confirmLabel="Hapus materi" busy={busy} error={sheetError}
        onCancel={onClose} onConfirm={() => remove(sheet.item)}>
        <p><strong>{sheet.item.title}</strong> akan dihapus dari akun Anda.</p>
      </ActionConfirmation>
    </Sheet>}
  </>;
}
