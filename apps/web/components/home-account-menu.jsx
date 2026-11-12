"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import LogoutButton from "./logout-button";
import AccountAvatar from "@imajilearn/shared/components/account-avatar.jsx";

export default function HomeAccountMenu({ name = "", email = "", avatarUrl }) {
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
      <AccountAvatar name={name} avatarUrl={avatarUrl} className="home-account-circle" />
      <span className="home-account-name">{name}</span>
    </button>
    <div id="home-account-options" className={`home-account-options${open ? " is-open" : ""}`} role="dialog" aria-label="Akun" aria-hidden={!open} inert={!open}>
      <div className="home-account-identity">
        <AccountAvatar name={name} avatarUrl={avatarUrl} size={44} className="home-account-circle" />
        <div><strong>{name}</strong><span>{email}</span></div>
      </div>
      <Link href="/akun"><UserRound size={20} aria-hidden="true" />Profil</Link>
      <LogoutButton label="Keluar" />
    </div>
  </div>;
}
