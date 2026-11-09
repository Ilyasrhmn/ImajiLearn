"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Eye, EyeOff } from "lucide-react";
import { Mascot } from "./mascot";
import { navigateAfterSessionChange } from "./session-reload";
import GoogleAction, { useGoogleAuthorization } from "./google-action";
import "./auth-form.css";

export default function AuthForm({ register = false, googleEnabled = false, googleNotice = null }) {
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState(googleNotice?.message || "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const google = useGoogleAuthorization();
  const busy = pending || google.pending;
  const validPassword = password.length >= 8;
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || busy) return;
    const values = new FormData(event.currentTarget);
    const body = { email: values.get("email"), password: values.get("password") };
    if (register) body.name = values.get("name");
    submitting.current = true;
    setPending(true);
    setNotice("");
    let succeeded = false;
    const fallback = register ? "Akun belum dapat dibuat. Coba lagi." : "Belum dapat masuk. Coba lagi.";
    try {
      const response = await fetch(register ? "/api/v1/auth/register" : "/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setNotice(payload?.error?.message || fallback);
        return;
      }
      navigateAfterSessionChange("/dashboard");
      succeeded = true;
    } catch {
      setNotice(fallback);
    } finally {
      if (!succeeded) {
        submitting.current = false;
        setPending(false);
      }
    }
  }
  return <>
    <a className="skip-link" href="#main">Lewati ke isi</a>
    <header className="workspace-header"><div className="header-inner"><Link href="/" className="brand" aria-label="ImajiLearn, beranda"><Image src="/brand/imajilearn-mark.svg" alt="" width={52} height={52} priority /><Image src="/brand/imajilearn-wordmark.svg" alt="" width={153} height={33} className="brand-wordmark" priority /></Link></div></header>
    <main id="main" className="entry-page auth-page"><div className="entry-art" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div>
      <section className="entry-card auth-card" aria-labelledby="auth-title"><h1 id="auth-title">{register ? "Buat akun guru" : "Masuk ke ImajiLearn"}</h1>
        {googleEnabled && <div className="auth-google"><GoogleAction pending={google.pending} disabled={busy} onClick={() => { setNotice(""); google.start(); }} />{google.error && <p className="google-error" role="alert">{google.error}</p>}<p className="auth-divider">atau gunakan email</p></div>}
        <form method="post" onSubmit={submit} onChange={() => { setNotice(""); google.clearError(); }} aria-busy={busy}>
          {register && <div className="auth-field"><label htmlFor="teacher-name">Nama</label><input id="teacher-name" name="name" autoComplete="name" required maxLength={60} pattern={/.*\S.*/.source} /></div>}
          <div className="auth-field"><label htmlFor="teacher-email">Email</label><input id="teacher-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
          <div className="auth-field"><label htmlFor="teacher-password">Kata sandi</label><div className="auth-password"><input id="teacher-password" name="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required maxLength={128} minLength={register ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} aria-describedby={register ? "password-help" : undefined} /><button type="button" onClick={() => setVisible(!visible)} aria-controls="teacher-password" aria-pressed={visible} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>{visible ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}</button></div>
            {register && <p id="password-help" className={`auth-help${validPassword ? " is-valid" : ""}`} aria-live="polite" aria-atomic="true"><span className="password-requirement-icon" aria-hidden="true"><Check size={13} /></span>{validPassword ? "Minimal 8 karakter terpenuhi" : "Minimal 8 karakter"}</p>}
          </div>
          <button className="upload-button" type="submit" disabled={busy}>{pending ? "Memproses…" : register ? "Buat akun" : "Masuk"}</button>
          {notice && <p className="auth-notice" role="alert">{notice}</p>}
        </form>
        <p className="auth-switch">{register ? "Sudah punya akun? " : "Belum punya akun? "}<Link href={register ? "/masuk" : "/daftar"}>{register ? "Masuk" : "Daftar"}</Link></p>
      </section>
    </main>
  </>;
}
