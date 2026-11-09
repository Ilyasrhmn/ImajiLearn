"use client";
import { useRef, useState } from "react";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { changeFolder } from "@imajilearn/shared/lib/materials.mjs";
import { createId } from "@imajilearn/shared/lib/id.mjs";
import { Feedback, Sheet } from "./ui";

export default function FolderManager({ teacherId, folders, onChange, onClose }) {
  const [name, setName] = useState(""), [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false), retry = useRef(null);
  async function save(event) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    const signature = JSON.stringify([editing?.id, name.trim()]);
    const key = retry.current?.signature === signature ? retry.current.key : createId(); retry.current = { signature, key };
    try { const row = await changeFolder(teacherId, { id: editing?.id, name, resourceVersion: editing?.resourceVersion, key }); onChange(editing ? folders.map(folder => folder.id === row.id ? row : folder) : [...folders, row]); setName(""); setEditing(null); retry.current = null; setNotice("Mapel disimpan."); }
    catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
  }
  async function remove() {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await changeFolder(teacherId, { ...deleting, remove: true }); onChange(folders.filter(row => row.id !== deleting.id), deleting.id); if (editing?.id === deleting.id) { setEditing(null); setName(""); } setDeleting(null); setNotice("Mapel dihapus."); }
    catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
  }
  return <Sheet title={deleting ? "Hapus mapel?" : "Kelola mapel"} busy={busy} dirty={Boolean(name.trim())} onClose={onClose}>{deleting ? <><p>Hapus <strong>{deleting.name}</strong>? Materi tetap tersedia tanpa folder mapel.</p><div className="button-pair"><button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Batal</button><button className="danger-button" disabled={busy} onClick={remove}>Hapus mapel</button></div></> : <><form onSubmit={save} className="folder-form"><fieldset className="form-stack" disabled={busy}><label className="field">Nama mapel<input required maxLength={80} value={name} pattern=".*\S.*" onChange={event => setName(event.target.value)} /></label><div className="button-pair"><button className="primary" type="submit">{editing ? "Simpan nama" : <><Plus size={18} />Tambah mapel</>}</button>{editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setName(""); setError(""); }}>Batal</button>}</div></fieldset></form><div>{folders.map(folder => <div className="folder-row" key={folder.id}><strong>{folder.name}</strong><button className="icon-button" disabled={busy} aria-label={`Ubah ${folder.name}`} onClick={() => { setEditing(folder); setName(folder.name); setError(""); }}><PencilLine size={19} /></button><button className="icon-button danger-text" disabled={busy} aria-label={`Hapus ${folder.name}`} onClick={() => { setDeleting(folder); setError(""); }}><Trash2 size={19} /></button></div>)}</div></>}<Feedback error>{error}</Feedback><Feedback>{notice}</Feedback></Sheet>;
}
