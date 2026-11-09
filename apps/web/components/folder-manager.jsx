"use client";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import Modal from "./modal";
import { changeFolder } from "../lib/materials";

export default function FolderManager({ teacherId, folders, onChange, onClose, onNotice }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const folder = await changeFolder(teacherId, { id: editing, name, resourceVersion: folders.find(item => item.id === editing)?.resourceVersion });
      onChange(editing ? folders.map(item => item.id === editing ? folder : item) : [...folders, folder]);
      onNotice({ message: editing ? "Nama mapel diubah" : "Mapel ditambahkan", type: "success" });
      setName(""); setEditing(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await changeFolder(teacherId, { id: confirm.id, remove: true, resourceVersion: confirm.resourceVersion });
      onChange(folders.filter(item => item.id !== confirm.id));
      if (editing === confirm.id) { setEditing(null); setName(""); }
      setConfirm(null);
      onNotice({ message: "Folder dihapus", type: "delete" });
    } catch (err) { setError(err.message); setConfirm(null); }
    finally { setBusy(false); }
  }
  return <Modal title="Kelola mapel" onClose={onClose}><div className="folder-manager">
    <h2>Kelola mapel</h2>
    {confirm ? <div className="folder-confirm"><p>Hapus folder <strong>{confirm.name}</strong>?</p><div className="source-actions"><button className="source-secondary" type="button" onClick={() => setConfirm(null)} disabled={busy}>Batal</button><button className="upload-button" type="button" disabled={busy} onClick={remove}>Hapus folder</button></div></div> : <>
      <form onSubmit={save}><label className="source-field">Nama mapel<input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Mis. Matematika" /></label><div className="folder-form-actions"><button className="upload-button" type="submit" disabled={busy}>{editing ? "Simpan" : "Tambah mapel"}</button>{editing && <button className="source-secondary" type="button" onClick={() => { setEditing(null); setName(""); setError(""); }}>Batal</button>}</div></form>
      {error && <p className="source-error" role="alert">{error}</p>}
      <ul className="folder-manage-list">{folders.map(folder => <li key={folder.id}><span>{folder.name}</span><button type="button" aria-label={`Ubah nama ${folder.name}`} title="Ubah nama" onClick={() => { setEditing(folder.id); setName(folder.name); setError(""); }}><Pencil size={19} /></button><button type="button" aria-label={`Hapus mapel ${folder.name}`} title="Hapus mapel" onClick={() => { setError(""); setConfirm(folder); }}><Trash2 size={19} /></button></li>)}</ul>
    </>}
  </div></Modal>;
}
