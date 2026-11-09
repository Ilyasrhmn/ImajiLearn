"use client";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardPenLine, Scissors } from "lucide-react";
import AccountAvatar from "./account-avatar";
import LogoutButton from "./logout-button";

function StudioFrame({ teacherId, children, type }) {
  const links = [{ href: "/dashboard", label: "Materi", Icon: BookOpen }, { href: "/lkpd", label: "LKPD", Icon: Scissors }, { href: "/ujian", label: "Soal & ujian", Icon: ClipboardPenLine }, { href: "/jadwal", label: "Jadwal", Icon: CalendarDays }];
  return <><a className="skip-link" href="#main">Lewati ke isi</a><header className="workspace-header"><div className="header-inner"><Link className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard"><Image src="/brand/imajilearn-mark.svg" width={52} height={52} alt="" /><Image src="/brand/imajilearn-wordmark.svg" width={153} height={33} alt="" className="brand-wordmark" /></Link><div className="account-actions"><AccountAvatar teacherId={teacherId} /><LogoutButton /></div></div></header><main id="main" className={`workspace-shell ${type === "lkpd" ? "lkpd" : "exam"}-main`}><nav className="studio-sections" aria-label="Navigasi studio">{links.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={href === (type === "lkpd" ? "/lkpd" : "/ujian") ? "page" : undefined}><Icon size={20} />{label}</Link>)}</nav>{children}</main></>;
}
export function LkpdWebFrame(props) { return <StudioFrame {...props} type="lkpd" />; }
export function ExamWebFrame(props) { return <StudioFrame {...props} type="exam" />; }
