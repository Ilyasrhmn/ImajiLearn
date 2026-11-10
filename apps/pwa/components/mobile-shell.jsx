"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Fragment, createContext, useContext, useState } from "react";
import { BookOpen, CalendarDays, House, UserRound } from "lucide-react";
import { brandAssets } from "@imajilearn/shared/assets";
import { useSession } from "./session-gate";
import PwaControls from "./pwa-controls";
import { Sheet } from "./ui";

const NavigationGuard = createContext(null);
export const useNavigationGuard = () => useContext(NavigationGuard);

export default function MobileShell({ children }) {
  const path = usePathname(), user = useSession();
  const [blocked, setBlocked] = useState(false), [warning, setWarning] = useState(false);
  function guard(event) { if (blocked) { event.preventDefault(); setWarning(true); } }
  const links = [{ href: "/beranda", label: "Beranda", Icon: House }, { href: "/materi", label: "Materi", Icon: BookOpen }, { href: "/jadwal", label: "Jadwal", Icon: CalendarDays }, { href: "/akun", label: "Akun", Icon: UserRound }];
  return <NavigationGuard.Provider value={setBlocked}><div className="mobile-shell"><a className="skip-link" href="#main">Lewati ke isi</a><header className="mobile-header"><Link href="/beranda" onClick={guard} aria-label="ImajiLearn, Beranda"><Image src={brandAssets.wordmark} alt="ImajiLearn" width={139} height={30} priority unoptimized /></Link><Link href="/akun" onClick={guard} className="avatar" aria-label="Buka akun">{user.name.trim().slice(0, 1).toUpperCase()}</Link></header><main id="main" className="mobile-content"><Fragment key={path}>{children}</Fragment><div className="section pwa-actions"><PwaControls blocked={blocked} /></div></main><nav className="bottom-nav" aria-label="Navigasi utama">{links.map(({ href, label, Icon }) => { const active = path === href || path.startsWith(`${href}/`) || (href === "/beranda" && ["/lkpd", "/ujian"].includes(path)); const content = <><span className="nav-icon"><Icon size={23} strokeWidth={active ? 2.1 : 1.7} /></span><span>{label}</span></>; return <Link key={href} href={href} onClick={guard} aria-current={active ? "page" : undefined}>{content}</Link>; })}</nav>{warning && <Sheet title="Perubahan belum tersimpan" onClose={() => setWarning(false)}><p>Simpan atau batalkan edit sebelum berpindah halaman.</p><button className="primary full section" onClick={() => setWarning(false)}>Kembali ke dokumen</button></Sheet>}</div></NavigationGuard.Provider>;
}
