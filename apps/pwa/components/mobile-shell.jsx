"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, House, UserRound } from "lucide-react";
import { brandAssets } from "@imajilearn/shared/assets";
import { useSession } from "./session-gate";

export default function MobileShell({ children }) {
  const path = usePathname(), user = useSession();
  const links = [{ href: "/beranda", label: "Beranda", Icon: House }, { href: "/materi", label: "Materi", Icon: BookOpen }, { href: "/jadwal", label: "Jadwal", Icon: CalendarDays, web: true }, { href: "/akun", label: "Akun", Icon: UserRound }];
  return <div className="mobile-shell"><a className="skip-link" href="#main">Lewati ke isi</a><header className="mobile-header"><Link href="/beranda" aria-label="ImajiLearn, Beranda"><Image src={brandAssets.wordmark} alt="ImajiLearn" width={139} height={30} priority unoptimized /></Link><Link href="/akun" className="avatar" aria-label="Buka akun">{user.name.trim().slice(0, 1).toUpperCase()}</Link></header><main id="main" className="mobile-content" key={path}>{children}</main><nav className="bottom-nav" aria-label="Navigasi utama">{links.map(({ href, label, Icon, web }) => { const active = path === href || path.startsWith(`${href}/`); const content = <><span className="nav-icon"><Icon size={23} strokeWidth={active ? 2.1 : 1.7} /></span><span>{label}</span></>; return web ? <a key={href} href={href}>{content}</a> : <Link key={href} href={href} aria-current={active ? "page" : undefined}>{content}</Link>; })}</nav></div>;
}
