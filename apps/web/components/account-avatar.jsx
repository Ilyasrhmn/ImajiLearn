"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PROFILE_KEY, readProfile } from "../lib/teacher-profile.mjs";

function subscribe(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("profile-updated", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("profile-updated", callback); };
}
function snapshot() { try { return localStorage.getItem(PROFILE_KEY) || ""; } catch { return ""; } }
function serverSnapshot() { return ""; }
export default function AccountAvatar({ current = false }) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const initial = readProfile(raw).name.trim().slice(0, 1).toLocaleUpperCase("id") || "G";
  return <Link href="/akun" className="avatar account-avatar" aria-label="Pengaturan akun" title="Pengaturan akun" aria-current={current ? "page" : undefined}>{initial}</Link>;
}
