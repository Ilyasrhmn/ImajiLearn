"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, createContext, useContext, useState } from "react";
import { BookOpen, CalendarDays, ClipboardPenLine, House, UserRound } from "lucide-react";
import PwaControls from "./pwa-controls";
import { Sheet } from "./ui";
import "./home-mobile.css";

const NavigationGuard = createContext(null);
export const useNavigationGuard = () => useContext(NavigationGuard);

export default function MobileShell({ children }) {
  const path = usePathname();
  const [blocked, setBlocked] = useState(false), [warning, setWarning] = useState(false);
  function guard(event) { if (blocked) { event.preventDefault(); setWarning(true); } }
  const links = [{ href: "/materi", label: "Materi", Icon: BookOpen }, { href: "/jadwal", label: "Jadwal", Icon: CalendarDays }, { href: "/beranda", label: "Beranda", Icon: House }, { href: "/ujian", label: "Ujian", Icon: ClipboardPenLine }, { href: "/akun", label: "Profil", Icon: UserRound }];
  return <NavigationGuard.Provider value={setBlocked}><div className="mobile-shell"><a className="skip-link" href="#main">Lewati ke isi</a><main id="main" className="mobile-content"><Fragment key={path}>{children}</Fragment><div className="section pwa-actions"><PwaControls blocked={blocked} /></div></main><nav className="bottom-nav" aria-label="Navigasi utama">{links.map(({ href, label, Icon }) => { const active = path === href || path.startsWith(`${href}/`); const content = <><span className="nav-icon"><Icon size={23} strokeWidth={active ? 2.1 : 1.7} /></span><span>{label}</span></>; return <Link key={href} className={href === "/beranda" ? "nav-home" : undefined} href={href} onClick={guard} aria-current={active ? "page" : undefined}>{content}</Link>; })}</nav>{warning && <Sheet title="Perubahan belum tersimpan" onClose={() => setWarning(false)}><p>Simpan atau batalkan edit sebelum berpindah halaman.</p><button className="primary full section" onClick={() => setWarning(false)}>Kembali ke dokumen</button></Sheet>}</div></NavigationGuard.Provider>;
}
