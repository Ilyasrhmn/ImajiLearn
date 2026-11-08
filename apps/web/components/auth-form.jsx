"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Eye, EyeOff } from "lucide-react";
import { Mascot } from "./mascot";
import "./auth-form.css";

export default function AuthForm({ register = false }) {
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const validPassword = password.length >= 8;
  function submit(event) {
    event.preventDefault();
    setNotice(register ? "Pendaftaran belum tersedia. Akun belum dibuat." : "Layanan masuk belum tersedia.");
  }
  return <>
    <a className="skip-link" href="#main">Lewati ke isi</a>
    <header className="workspace-header"><div className="header-inner"><Link href="/" className="brand" aria-label="ImajiLearn, beranda"><Image src="/brand/imajilearn-mark.svg" alt="" width={52} height={52} priority /><Image src="/brand/imajilearn-wordmark.svg" alt="" width={153} height={33} className="brand-wordmark" priority /></Link></div></header>
    <main id="main" className="entry-page auth-page"><div className="entry-art" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div>
      <section className="entry-card auth-card" aria-labelledby="auth-title"><h1 id="auth-title">{register ? "Buat akun guru" : "Masuk ke ImajiLearn"}</h1>
        <form onSubmit={submit} onChange={() => setNotice("")}>
          {register && <div className="auth-field"><label htmlFor="teacher-name">Nama</label><input id="teacher-name" name="name" autoComplete="name" required maxLength={60} pattern=".*\S.*" /></div>}
          <div className="auth-field"><label htmlFor="teacher-email">Email</label><input id="teacher-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
          <div className="auth-field"><label htmlFor="teacher-password">Kata sandi</label><div className="auth-password"><input id="teacher-password" name="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} aria-describedby={register ? "password-help" : undefined} /><button type="button" onClick={() => setVisible(!visible)} aria-controls="teacher-password" aria-pressed={visible} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>{visible ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}</button></div>
            {register && <p id="password-help" className={`auth-help${validPassword ? " is-valid" : ""}`} aria-live="polite" aria-atomic="true"><span className="password-requirement-icon" aria-hidden="true"><Check size={13} /></span>{validPassword ? "Minimal 8 karakter terpenuhi" : "Minimal 8 karakter"}</p>}
          </div>
          <button className="upload-button" type="submit">{register ? "Buat akun" : "Masuk"}</button>
          {notice && <p className="auth-notice" role="alert">{notice}</p>}
        </form>
        <p className="auth-switch">{register ? "Sudah punya akun? " : "Belum punya akun? "}<Link href={register ? "/masuk" : "/daftar"}>{register ? "Masuk" : "Daftar"}</Link></p>
      </section>
    </main>
  </>;
}
