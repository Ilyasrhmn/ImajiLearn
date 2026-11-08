"use client";
import { startTransition, useCallback, useEffect, useState, ViewTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, Check, ClipboardPenLine, Eye, EyeOff, LockKeyhole, LogOut, Scissors, UserRound } from "lucide-react";
import AccountAvatar from "./account-avatar";
import ThemedSelect from "./themed-select";
import Notice from "./notice";
import { Mascot } from "./mascot";
import { PROFILE_KEY, readProfile } from "../lib/teacher-profile.mjs";
import "./account-settings.css";

function PasswordField({ id, label, value, onChange, autoComplete, ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password"><input id={id} type={visible ? "text" : "password"} required autoComplete={autoComplete} value={value} onChange={onChange} {...props} /><button type="button" aria-label={`${visible ? "Sembunyikan" : "Tampilkan"} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}</button></div></div>;
}
function PasswordForm({ notify }) {
  const [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;
  return <form className="account-form" onSubmit={event => { event.preventDefault(); if (password === confirm && password.length >= 8) notify({ message: "Perubahan kata sandi belum tersedia.", type: "warning" }); }}>
    <PasswordField id="current-password" label="Kata sandi saat ini" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} />
    <div><PasswordField id="new-password" label="Kata sandi baru" autoComplete="new-password" minLength={8} aria-describedby="new-password-help" value={password} onChange={event => setPassword(event.target.value)} /><p id="new-password-help" className={`auth-help${password.length >= 8 ? " is-valid" : ""}`} aria-live="polite"><span className="password-requirement-icon" aria-hidden="true"><Check size={13} /></span>{password.length >= 8 ? "Minimal 8 karakter terpenuhi" : "Minimal 8 karakter"}</p></div>
    <div><PasswordField id="confirm-password" label="Ulangi kata sandi baru" autoComplete="new-password" value={confirm} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "confirm-password-help" : undefined} onChange={event => setConfirm(event.target.value)} />{mismatch && <p id="confirm-password-help" className="account-field-error" role="status">Kata sandi belum sama.</p>}</div>
    <button className="upload-button" disabled={password.length < 8 || confirm !== password}>Ubah kata sandi</button>
  </form>;
}
export default function AccountSettings() {
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false), [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(() => readProfile(null)), [notice, setNotice] = useState(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (!active) return; try { setProfile(readProfile(localStorage.getItem(PROFILE_KEY))); } catch { setLoadError(true); } setReady(true); });
    return () => { active = false; };
  }, []);
  function change(event) { const { name, value } = event.target; setProfile(current => ({ ...current, [name]: value })); }
  function save(event) {
    event.preventDefault();
    if (!profile.name.trim()) return;
    const cleaned = readProfile(JSON.stringify(profile));
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(cleaned)); setProfile(cleaned); window.dispatchEvent(new Event("profile-updated")); setNotice({ message: "Profil disimpan", type: "success" }); }
    catch { setNotice({ message: "Profil belum tersimpan. Coba lagi.", type: "error" }); }
  }
  const tabs = [{ id: "profile", label: "Profil", Icon: UserRound }, { id: "password", label: "Kata sandi", Icon: LockKeyhole }];
  return <><a className="skip-link" href="#main">Lewati ke isi</a><header className="workspace-header"><div className="header-inner"><Link className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></Link><div className="account-actions"><Link href="/dashboard" className="account-home" aria-label="Studio" title="Studio"><BookOpen size={20} aria-hidden="true" /><span>Studio</span></Link><AccountAvatar current /><button type="button" className="logout" disabled aria-label="Keluar belum tersedia"><LogOut size={20} /></button></div></div></header>
    <main id="main" className="workspace-shell account-main"><nav className="studio-sections" aria-label="Navigasi studio"><Link href="/dashboard"><BookOpen size={20} />Materi</Link><Link href="/lkpd"><Scissors size={20} />LKPD</Link><Link href="/ujian"><ClipboardPenLine size={20} />Soal &amp; ujian</Link><Link href="/jadwal"><CalendarDays size={20} />Jadwal</Link></nav>
      {!ready ? <div className="materials-skeleton" role="status" aria-label="Memuat akun"><span /><span /></div> : loadError ? <p role="alert">Profil tidak dapat dimuat. Periksa penyimpanan browser.</p> : <><div className="account-heading"><h1>Pengaturan akun</h1><div aria-hidden="true"><Mascot kind="pen" mood="calm" /></div></div>
        <div className="account-tabs" role="tablist" aria-label="Pengaturan akun">{tabs.map((item, index) => <button key={item.id} id={`account-tab-${item.id}`} role="tab" type="button" aria-selected={tab === item.id} aria-controls="account-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => startTransition(() => setTab(item.id))} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "profile" : event.key === "End" ? "password" : index === 0 ? "password" : "profile"; startTransition(() => setTab(next)); document.getElementById(`account-tab-${next}`)?.focus(); }}><item.Icon size={20} aria-hidden="true" />{item.label}</button>)}</div>
        <ViewTransition update="panel-swap" default="none"><section id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`} className="account-panel">{tab === "profile" ? <form className="account-form" onSubmit={save}>
          <div className="auth-field"><label htmlFor="profile-name">Nama</label><input id="profile-name" name="name" autoComplete="name" required pattern=".*\S.*" maxLength={60} value={profile.name} onChange={change} /></div>
          <div className="auth-field"><label htmlFor="profile-email">Email</label><input id="profile-email" name="email" type="email" autoComplete="email" maxLength={254} value={profile.email} onChange={change} /></div>
          <div className="auth-field"><label htmlFor="profile-school">Sekolah</label><input id="profile-school" name="school" autoComplete="organization" maxLength={100} value={profile.school} onChange={change} /></div>
          <div className="auth-field"><label htmlFor="profile-grade">Kelas yang diajar</label><ThemedSelect id="profile-grade" name="grade" value={profile.grade} onChange={change}><option value="">Pilih kelas</option>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>Kelas {grade}</option>)}</ThemedSelect></div>
          <button className="upload-button">Simpan perubahan</button>
        </form> : <PasswordForm notify={setNotice} />}</section></ViewTransition>
      </>}
    </main>{notice && <Notice notice={notice} onDismiss={dismissNotice} />}
  </>;
}
