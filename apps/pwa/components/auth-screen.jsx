"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { brandAssets } from "@imajilearn/shared/assets";
import { navigateAfterSessionChange } from "@imajilearn/shared/lib/session.mjs";
import { Feedback, PasswordInput } from "./ui";

export default function AuthScreen({ register = false }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    const values = new FormData(event.currentTarget);
    pending.current = true; setBusy(true); setError("");
    const body = { email: values.get("email"), password: values.get("password") };
    if (register) body.name = values.get("name");
    try {
      const response = await fetch(register ? "/api/v1/auth/register" : "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.data?.user?.id) throw new Error(result?.error?.message || "Belum dapat masuk. Coba lagi.");
      navigateAfterSessionChange("/app/beranda");
    } catch (err) { setError(err instanceof TypeError ? "Layanan akun belum dapat dihubungi. Periksa koneksi dan coba lagi." : err.message); pending.current = false; setBusy(false); }
  }
  return <main className="auth-screen"><Image src={brandAssets.wordmark} width={155} height={34} alt="ImajiLearn" priority unoptimized /><div className="auth-characters" aria-hidden="true"><Mascot kind="book" /><Mascot kind="pencil" mood="think" /></div><h1>{register ? "Buat akun guru" : "Masuk"}</h1><form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy} className="form-stack">{register && <label className="field">Nama<input name="name" autoComplete="name" required maxLength={60} pattern=".*\S.*" /></label>}<label className="field">Email<input type="email" name="email" autoComplete="email" maxLength={254} required /></label><PasswordInput label="Kata sandi" name="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} maxLength={128} required />{register && <small>Minimal 8 karakter</small>}<Feedback error>{error}</Feedback><button className="primary full" type="submit">{busy ? "Memproses…" : register ? "Buat akun" : "Masuk"}</button></fieldset></form><p className="auth-switch">{register ? "Sudah punya akun?" : "Belum punya akun?"} <Link href={register ? "/masuk" : "/daftar"}>{register ? "Masuk" : "Daftar"}</Link></p></main>;
}
