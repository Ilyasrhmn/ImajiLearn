"use client";
import { teacherStorageKey } from "../lib/teacher-storage.mjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PROFILE_KEY } from "../lib/teacher-profile.mjs";
import { requestAccount } from "../lib/account-client.mjs";

export default function AccountAvatar({ teacherId, current = false, name }) {
  const [loadedName, setLoadedName] = useState("");
  useEffect(() => {
    if (name !== undefined) return;
    let controller;
    const key = teacherStorageKey(teacherId, PROFILE_KEY);
    function refresh(event) {
      if (event?.type === "storage" && event.key !== key) return;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      requestAccount(teacherId, { signal }).then(profile => {
        if (!signal.aborted && profile) setLoadedName(profile.name);
      }).catch(() => {
        if (!signal.aborted) setLoadedName("");
      });
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("profile-updated", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("profile-updated", refresh);
    };
  }, [name, teacherId]);
  const initial = (name ?? loadedName).trim().slice(0, 1).toLocaleUpperCase("id") || "G";
  return <Link href="/akun" className="avatar account-avatar" aria-label="Pengaturan akun" title="Pengaturan akun" aria-current={current ? "page" : undefined}>{initial}</Link>;
}
