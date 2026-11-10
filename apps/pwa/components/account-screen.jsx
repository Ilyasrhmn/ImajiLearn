"use client";
import { useEffect, useRef, useState } from "react";
import { LogOut, PencilLine, LockKeyhole } from "lucide-react";
import { requestAccount } from "@imajilearn/shared/lib/account-client.mjs";
import { announceSessionChange, navigateAfterSessionChange } from "@imajilearn/shared/lib/session.mjs";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { useSession } from "./session-gate";
import { ErrorState, Feedback, Loading, PageTitle, PasswordInput, Sheet } from "./ui";

export default function AccountScreen() {
  const teacher = useSession();
  const [profile, setProfile] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0), [sheet, setSheet] = useState(null), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { const controller = new AbortController(); requestAccount(teacher.id, { signal: controller.signal }).then(data => { if (data && !controller.signal.aborted) setProfile(data); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }); return () => controller.abort(); }, [teacher.id, attempt]);
  async function logout() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const response = await fetch("/api/v1/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("Belum dapat keluar. Coba lagi."); navigateAfterSessionChange("/app/masuk"); }
    catch (err) { setError(err.message); lock.current = false; setBusy(false); }
  }
  return <><PageTitle title="Akun" />{!profile ? error ? <ErrorState message={error} onRetry={() => { setError(""); setAttempt(n => n + 1); }} /> : <Loading label="Memuat akun" /> : <><div className="profile-card"><div className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</div><h2>{profile.name}</h2><p>{profile.email}</p>{profile.school && <p>{profile.school}{profile.grade ? ` · Kelas ${profile.grade}` : ""}</p>}</div><div className="account-actions"><button onClick={() => { setNotice(""); setSheet("profile"); }}><PencilLine size={20} /><span>Edit profil</span></button>{profile.auth?.hasPassword !== false && <button onClick={() => { setNotice(""); setSheet("password"); }}><LockKeyhole size={20} /><span>Ubah kata sandi</span></button>}<button onClick={() => setSheet("logout")} className="danger-text"><LogOut size={20} /><span>Keluar</span></button></div><Feedback>{notice}</Feedback>{error && <Feedback error>{error}</Feedback>}<div className="account-mascot" aria-hidden="true"><Mascot kind="pen" mood="calm" /></div></>}{sheet === "logout" && <Sheet title="Keluar dari akun?" busy={busy} onClose={() => setSheet(null)}><div className="button-pair"><button className="secondary" disabled={busy} onClick={() => setSheet(null)}>Batal</button><button className="danger-button" disabled={busy} onClick={logout}>{busy ? "Memproses…" : "Keluar"}</button></div>{error && <Feedback error>{error}</Feedback>}</Sheet>}{(sheet === "profile" || sheet === "password") && <AccountForm type={sheet} profile={profile} teacherId={teacher.id} onClose={() => setSheet(null)} onSaved={data => { if (data) setProfile(data); setSheet(null); setNotice(data ? "Profil disimpan." : "Kata sandi diperbarui."); }} />}</>;
}

function AccountForm({ type, profile, teacherId, onClose, onSaved }) {
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), closeRef = useRef(null);
  async function submit(event) {
    event.preventDefault(); if (lock.current) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (type === "password" && body.newPassword !== body.confirmPassword) { setError("Kata sandi belum sama."); return; }
    lock.current = true; setBusy(true); setError("");
    try { const result = await requestAccount(teacherId, { method: type === "profile" ? "PATCH" : "POST", password: type === "password", body }); if (!result) return; if (type === "password") announceSessionChange(); closeRef.current.close(() => onSaved(type === "profile" ? result : null)); }
    catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
  }
  return <Sheet closeRef={closeRef} title={type === "profile" ? "Edit profil" : "Ubah kata sandi"} dirty={dirty} busy={busy} onClose={onClose}><form onSubmit={submit} onChange={() => setDirty(true)}><fieldset className="form-stack" disabled={busy}>{type === "profile" ? <><label className="field">Nama<input name="name" defaultValue={profile.name} maxLength={60} required pattern=".*\S.*" autoComplete="name" /></label><label className="field">Sekolah<input name="school" defaultValue={profile.school} maxLength={100} autoComplete="organization" /></label><label className="field">Kelas yang diajar<select name="grade" defaultValue={profile.grade}><option value="">Pilih kelas</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>Kelas {n}</option>)}</select></label></> : <><PasswordInput label="Kata sandi saat ini" name="currentPassword" autoComplete="current-password" maxLength={128} required /><PasswordInput label="Kata sandi baru" name="newPassword" autoComplete="new-password" minLength={8} maxLength={128} required /><PasswordInput label="Ulangi kata sandi baru" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={128} required /></>}<Feedback error>{error}</Feedback><button className="primary full" type="submit">{busy ? "Menyimpan…" : "Simpan perubahan"}</button></fieldset></form></Sheet>;
}
