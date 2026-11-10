"use client";
import { startTransition, useCallback, useEffect, useRef, useState, ViewTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, Check, ClipboardPenLine, Eye, EyeOff, LockKeyhole, Scissors, UserRound } from "lucide-react";
import AccountAvatar from "./account-avatar";
import LogoutButton from "./logout-button";
import ThemedSelect from "./themed-select";
import Notice from "./notice";
import { Mascot } from "./mascot";
import { readProfile } from "../lib/teacher-profile.mjs";
import { requestAccount } from "../lib/account-client.mjs";
import { announceSessionChange } from "./session-reload";
import GoogleAction, { useGoogleAuthorization } from "./google-action";
import "./account-settings.css";

function PasswordField({ id, label, value, onChange, autoComplete, ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password"><input id={id} type={visible ? "text" : "password"} required autoComplete={autoComplete} value={value} onChange={onChange} {...props} /><button type="button" aria-label={`${visible ? "Sembunyikan" : "Tampilkan"} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}</button></div></div>;
}
function PasswordForm({ teacherId, notify }) {
  const [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const mismatch = confirm.length > 0 && confirm !== password;
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !current || password.length < 8 || password !== confirm) return;
    submitting.current = true;
    setPending(true);
    try {
      const result = await requestAccount(teacherId, {
        password: true,
        method: "POST",
        body: { currentPassword: current, newPassword: password, confirmPassword: confirm },
      });
      if (!result) return;
      setCurrent("");
      setPassword("");
      setConfirm("");
      announceSessionChange();
      notify({ message: "Kata sandi diperbarui.", type: "success" });
    } catch (error) {
      notify({ message: error.message, type: "error" });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return <form method="post" className="account-form" onSubmit={submit} aria-busy={pending}>
    <PasswordField id="current-password" readOnly={pending} maxLength={128} label="Kata sandi saat ini" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} />
    <div><PasswordField id="new-password" readOnly={pending} maxLength={128} label="Kata sandi baru" autoComplete="new-password" minLength={8} aria-describedby="new-password-help" value={password} onChange={event => setPassword(event.target.value)} /><p id="new-password-help" className={`auth-help${password.length >= 8 ? " is-valid" : ""}`} aria-live="polite"><span className="password-requirement-icon" aria-hidden="true"><Check size={13} /></span>{password.length >= 8 ? "Minimal 8 karakter terpenuhi" : "Minimal 8 karakter"}</p></div>
    <div><PasswordField id="confirm-password" readOnly={pending} maxLength={128} label="Ulangi kata sandi baru" autoComplete="new-password" value={confirm} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "confirm-password-help" : undefined} onChange={event => setConfirm(event.target.value)} />{mismatch && <p id="confirm-password-help" className="account-field-error" role="status">Kata sandi belum sama.</p>}</div>
    <button className="upload-button" disabled={pending || password.length < 8 || confirm !== password}>{pending ? "Memproses…" : "Ubah kata sandi"}</button>
  </form>;
}
function GoogleLinkForm({ teacherId, email }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const google = useGoogleAuthorization(teacherId);
  function submit(event) {
    event.preventDefault();
    if (!currentPassword || google.pending) return;
    google.start(currentPassword);
  }
  return <section className="account-google" aria-labelledby="google-link-title"><h2 id="google-link-title">Hubungkan Google</h2><p>Gunakan akun Google dengan email {email}. Masukkan kata sandi ImajiLearn Anda untuk melanjutkan.</p>
    <form method="post" className="account-form" onSubmit={submit} aria-busy={google.pending}>
      <PasswordField id="google-current-password" label="Kata sandi saat ini" autoComplete="current-password" maxLength={128} readOnly={google.pending} value={currentPassword} onChange={event => { setCurrentPassword(event.target.value); google.clearError(); }} />
      <GoogleAction type="submit" pending={google.pending} disabled={google.pending}>Hubungkan Google</GoogleAction>
      {google.error && <p className="google-error" role="alert">{google.error}</p>}
    </form>
  </section>;
}
function SignInSettings({ teacherId, profile, notify }) {
  const auth = profile.auth;
  return <div className="account-sign-in">
    {auth?.hasPassword === false ? <p className="account-sign-in-help">Akun ini belum memiliki kata sandi.</p> : <PasswordForm teacherId={teacherId} notify={notify} />}
    {auth?.googleLinked ? <section className="account-google" aria-labelledby="google-linked-title"><h2 id="google-linked-title">Google terhubung</h2></section> : auth?.googleEnabled && auth?.hasPassword ? <GoogleLinkForm teacherId={teacherId} email={profile.email} /> : null}
  </div>;
}
export default function AccountSettings({ teacherId, googleNotice = null }) {
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(""), [tab, setTab] = useState(googleNotice ? "password" : "profile");
  const [retry, setRetry] = useState(0), [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [profile, setProfile] = useState(() => readProfile(null)), [notice, setNotice] = useState(googleNotice);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    const controller = new AbortController();
    requestAccount(teacherId, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted || !data) return;
      setProfile(data);
      setReady(true);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setLoadError(error.message);
      setReady(true);
    });
    return () => controller.abort();
  }, [retry, teacherId]);
  function change(event) { const { name, value } = event.target; setProfile(current => ({ ...current, [name]: value })); }
  async function save(event) {
    event.preventDefault();
    if (submitting.current || !profile.name.trim()) return;
    submitting.current = true;
    setSaving(true);
    const { name, school, grade } = profile;
    try {
      const updated = await requestAccount(teacherId, { method: "PATCH", body: { name, school, grade } });
      if (!updated) return;
      setProfile(updated);
      setNotice({ message: "Profil disimpan.", type: "success" });
    } catch (error) {
      setNotice({ message: error.message, type: "error" });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  const tabs = [{ id: "profile", label: "Profil", Icon: UserRound }, { id: "password", label: profile.auth?.googleEnabled || profile.auth?.googleLinked ? "Metode masuk" : "Kata sandi", Icon: LockKeyhole }];
  return <><a className="skip-link" href="#main">Lewati ke isi</a><header className="workspace-header"><div className="header-inner"><Link className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></Link><div className="account-actions"><Link href="/dashboard" className="account-home" aria-label="Studio" title="Studio"><BookOpen size={20} aria-hidden="true" /><span>Studio</span></Link><AccountAvatar teacherId={teacherId} name={profile.name} current /><LogoutButton /></div></div></header>
    <main id="main" className="workspace-shell account-main"><nav className="studio-sections" aria-label="Navigasi studio"><Link href="/dashboard"><BookOpen size={20} />Materi</Link><Link href="/lkpd"><Scissors size={20} />LKPD</Link><Link href="/ujian"><ClipboardPenLine size={20} />Soal &amp; ujian</Link><Link href="/jadwal"><CalendarDays size={20} />Jadwal</Link></nav>
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat akun"><span /><span /></div> : loadError ? <div><p role="alert">{loadError}</p><button type="button" className="upload-button" onClick={() => { setReady(false); setLoadError(""); setRetry(attempt => attempt + 1); }}>Coba lagi</button></div> : <><div className="account-heading"><h1>Pengaturan akun</h1><div aria-hidden="true"><Mascot kind="pen" mood="calm" /></div></div>
        <div className="account-tabs" role="tablist" aria-label="Pengaturan akun">{tabs.map((item, index) => <button key={item.id} id={`account-tab-${item.id}`} role="tab" type="button" aria-selected={tab === item.id} aria-controls="account-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => startTransition(() => setTab(item.id))} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "profile" : event.key === "End" ? "password" : index === 0 ? "password" : "profile"; startTransition(() => setTab(next)); document.getElementById(`account-tab-${next}`)?.focus(); }}><item.Icon size={20} aria-hidden="true" />{item.label}</button>)}</div>
        <ViewTransition update="panel-swap" default="none"><section id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`} className="account-panel">{tab === "profile" ? <form method="post" className="account-form" onSubmit={save} aria-busy={saving}>
          <div className="auth-field"><label htmlFor="profile-name">Nama</label><input id="profile-name" name="name" autoComplete="name" readOnly={saving} required pattern={/.*\S.*/.source} maxLength={60} value={profile.name} onChange={change} /></div>
          <div className="auth-field"><label htmlFor="profile-email">Email</label><input id="profile-email" name="email" type="email" autoComplete="email" maxLength={254} value={profile.email} readOnly /></div>
          <div className="auth-field"><label htmlFor="profile-school">Sekolah</label><input id="profile-school" name="school" autoComplete="organization" maxLength={100} readOnly={saving} value={profile.school} onChange={change} /></div>
          <div className="auth-field"><label htmlFor="profile-grade">Kelas yang diajar</label><ThemedSelect id="profile-grade" name="grade" disabled={saving} value={profile.grade} onChange={change}><option value="">Pilih kelas</option>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>Kelas {grade}</option>)}</ThemedSelect></div>
          <button className="upload-button" disabled={saving}>{saving ? "Menyimpan…" : "Simpan perubahan"}</button>
        </form> : <SignInSettings teacherId={teacherId} profile={profile} notify={setNotice} />}</section></ViewTransition>
      </>}
    </main>{notice && <Notice notice={notice} onDismiss={dismissNotice} />}
  </>;
}
