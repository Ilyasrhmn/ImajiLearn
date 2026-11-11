"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import LogoutButton from "./logout-button";

export default function HomeAccountMenu({ name = "" }) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    function keyboard(event) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  return <div className="home-account" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} className="home-account-trigger" type="button" aria-expanded={open} aria-controls="home-account-options" aria-label={`Menu akun ${name}`} onClick={() => setOpen(value => !value)}>
      <span className="home-account-circle" aria-hidden="true">{name.trim().slice(0, 1).toLocaleUpperCase("id") || "?"}</span>
      <span className="home-account-name">{name}</span>
    </button>
    {open && <div id="home-account-options" className="home-account-options">
      <Link href="/akun"><UserRound size={20} aria-hidden="true" />Profil</Link>
      <LogoutButton label="Keluar" />
    </div>}
  </div>;
}
