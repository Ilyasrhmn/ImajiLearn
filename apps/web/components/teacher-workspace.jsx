"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, House, Menu, Sparkles } from "lucide-react";
import HomeAccountMenu from "./home-account-menu";
import "./teacher-home.css";
const links = [
  { href: "/beranda", label: "Beranda", Icon: House },
  { href: "/buat-media", label: "Buat media", Icon: Sparkles },
  { href: "/jadwal", label: "Jadwal", Icon: CalendarDays },
];
export default function TeacherWorkspace({ name, current, children }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCollapsed(window.matchMedia("(max-width: 760px)").matches));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className={`home-workspace${collapsed ? " is-collapsed" : ""}`}>
    <a className="skip-link" href="#main">Lewati ke isi</a>
    <header className="home-app-header">
      <div className="home-app-brand">
        <button className="home-menu-toggle" type="button" aria-label={collapsed ? "Perluas menu" : "Lipat menu"} aria-expanded={!collapsed} aria-controls="home-sidebar" onClick={() => setCollapsed(value => !value)}><Menu size={24} aria-hidden="true" /></button>
        <Link className="brand" href="/beranda" aria-label="ImajiLearn, beranda"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></Link>
      </div>
      <HomeAccountMenu name={name} />
    </header>
    {!collapsed && <button type="button" className="home-sidebar-dismiss" aria-label="Tutup menu" onClick={() => setCollapsed(true)} />}
    <aside id="home-sidebar" className="home-sidebar"><nav aria-label="Navigasi studio">
      {links.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={href === current ? "page" : undefined} aria-label={label} title={collapsed ? label : undefined}><Icon size={23} aria-hidden="true" /><span>{label}</span></Link>)}
    </nav></aside>
    {children}
  </div>;
}
