"use client";

import Image from "next/image";
import { BookOpenText, Box, ClipboardCheck, ExternalLink, Music2, PanelsTopLeft, Sparkles } from "lucide-react";
import TeacherWorkspace from "./teacher-workspace";
import MaterialLibrary from "./material-library";
import { Mascot } from "./mascot";
import { mediaStudio } from "../lib/media-studios.mjs";
import "./create-media.css";

const tools = [
  { id: "reading", label: "Bacaan bergambar", Icon: BookOpenText, tone: "blue" },
  { id: "slides", label: "Slide", Icon: PanelsTopLeft, tone: "sage" },
  { id: "song", label: "Lagu belajar", Icon: Music2, tone: "pink" },
  { id: "visual", label: "Visual interaktif", Icon: Box, tone: "yellow" },
  { id: "exam", label: "Soal & ujian", Icon: ClipboardCheck, tone: "lilac" },
];

export default function CreateMedia({ teacherId, name, account }) {
  return <TeacherWorkspace name={name} account={account} current="/buat-media">
    <main id="main" className="teacher-home create-media">
      <section className="create-media-welcome" aria-labelledby="create-media-title">
        <h1 id="create-media-title">Kelola materi dan buat media ajar bersama AI.</h1>
        <Image className="create-media-header-art" src="/illustrations/create-media-paper.webp" width={240} height={210} sizes="(max-width: 600px) 180px, (max-width: 1000px) 190px, 240px" alt="" />
      </section>
      <section className="create-media-toolkit" aria-labelledby="create-media-tools-title">
        <h2 id="create-media-tools-title">Buat media <Sparkles size={24} aria-hidden="true" /></h2>
        <div className="create-media-grid">{tools.map(({ id, label, Icon, tone }) => <a key={id} className={`create-media-card create-media-${tone}`} href={id === "exam" ? "/ujian" : `${mediaStudio(id === "visual" ? "mindmap" : id).route}?create=1`} target="_blank" rel="noopener noreferrer" aria-label={`${label}, buka di tab baru`}>
          <span className="create-media-icon"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="create-media-label">{label}</span><ExternalLink className="create-media-external" size={17} aria-hidden="true" />
        </a>)}<div className="create-media-friends" aria-hidden="true">{["book", "pencil", "pen", "eraser", "correction"].map(kind => <Mascot key={kind} kind={kind} />)}</div></div>
      </section>
      <MaterialLibrary teacherId={teacherId} />
    </main>
  </TeacherWorkspace>;
}
