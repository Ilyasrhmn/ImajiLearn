"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { brandAssets } from "@imajilearn/shared/assets";
import { navigateAfterSessionChange } from "@imajilearn/shared/lib/session.mjs";
import { Feedback, PasswordInput } from "./ui";
import GoogleAction from "@imajilearn/shared/components/google-action.jsx";
import { requestGoogleAuthorization } from "@imajilearn/shared/lib/google-auth-client.mjs";
import "./auth-google.css";

export default function AuthScreen({ register = false, googleNotice }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    function restore(event) { if (event.persisted) { pending.current = false; setBusy(false); setGoogleBusy(false); } }
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  async function startGoogle() {
    if (pending.current) return;
    pending.current = true; setGoogleBusy(true); setError("");
    try {
      const result = await requestGoogleAuthorization({}, { loginEndpoint: "/app/api/v1/auth/google/pwa" });
      window.location.assign(result.url);
    } catch (failure) { setError(failure.message); pending.current = false; setGoogleBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    const values = new FormData(event.currentTarget);
    pending.current = true; setBusy(true); setError("");
    const body = { email: values.get("email"), password: values.get("password") };
    if (register) body.name = values.get("name");
    try {
      const response = await fetch(register ? "/app/api/v1/auth/register" : "/app/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.data?.user?.id) {
        const fields = result?.error?.fields;
        const field = fields && Object.keys(fields).find(key => ["name", "email", "password"].includes(key));
        const labels = { name: "Nama", email: "Email", password: "Kata sandi" };
        throw new Error(field ? `${labels[field]}: ${fields[field]}` : result?.error?.message || "Belum dapat masuk. Coba lagi.");
      }
      navigateAfterSessionChange("/app/beranda");
    } catch (err) { setError(err instanceof TypeError ? "Layanan akun belum dapat dihubungi. Periksa koneksi dan coba lagi." : err.message); pending.current = false; setBusy(false); }
  }
  return <main className="auth-screen"><Image src={brandAssets.wordmark} width={155} height={34} alt="ImajiLearn" priority unoptimized /><div className="auth-characters" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div><h1>{register ? "Buat akun guru" : "Masuk"}</h1><Feedback error={googleNotice?.type === "error"}>{googleNotice?.message}</Feedback><div className="auth-google"><GoogleAction pending={googleBusy} disabled={busy || googleBusy} onClick={startGoogle} /><div className="auth-google-divider">atau</div></div><form onSubmit={submit} aria-busy={busy || googleBusy}><fieldset disabled={busy || googleBusy} className="form-stack">{register && <label className="field">Nama<input name="name" autoComplete="name" required maxLength={60} pattern=".*\S.*" /></label>}<label className="field">Email<input type="email" name="email" autoComplete="email" maxLength={254} required /></label><PasswordInput label="Kata sandi" name="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} maxLength={128} required />{register && <small>Minimal 8 karakter</small>}<Feedback error>{error}</Feedback><button className="primary full" type="submit">{busy ? "Memproses…" : register ? "Buat akun" : "Masuk"}</button></fieldset></form><p className="auth-switch">{register ? "Sudah punya akun?" : "Belum punya akun?"} <Link href={register ? "/masuk" : "/daftar"}>{register ? "Masuk" : "Daftar"}</Link></p></main>;
}
