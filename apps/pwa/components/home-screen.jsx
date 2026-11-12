"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, BookOpenText, Box, ClipboardCheck, Music2, PanelsTopLeft, Upload } from "lucide-react";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { listMaterials } from "@imajilearn/shared/lib/materials.mjs";
import { useSession } from "./session-gate";
import HomeAgenda from "./home-agenda";
import { Loading, ErrorState } from "./ui";
const shortcuts = [
  { label: "Bacaan bergambar", href: "/materi?jenis=reading", Icon: BookOpenText, tone: "blue" },
  { label: "Slide", href: "/materi?jenis=slides", Icon: PanelsTopLeft, tone: "sage" },
  { label: "Lagu belajar", href: "/materi?jenis=song", Icon: Music2, tone: "pink" },
  { label: "Visual interaktif", href: "/materi?jenis=mindmap", Icon: Box, tone: "yellow" },
  { label: "Soal & ujian", href: "/ujian", Icon: ClipboardCheck, tone: "lilac" },
  { label: "Unggah", href: "/materi?tambah=1", Icon: Upload, tone: "yellow" },
];
export default function HomeScreen() {
  const teacher = useSession();
  const [now, setNow] = useState(null), [items, setItems] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => { const update=()=>setNow(new Date()); update(); const timer=setInterval(update,60000); return()=>clearInterval(timer); }, []);
  useEffect(() => { let active=true; listMaterials(teacher.id).then(data=>{if(active)setItems(data.filter(item=>!item.archived&&!item.parentId).sort((a,b)=>b.createdAt-a.createdAt));}).catch(err=>{if(active)setError(err.message);}); return()=>{active=false;}; },[teacher.id,attempt]);
  const hour=now?.getHours();
  const greeting=now ? hour<11 ? "Selamat pagi" : hour<15 ? "Selamat siang" : hour<18 ? "Selamat sore" : "Selamat malam" : "Halo";
  return <div className="pwa-home">
    <section className="pwa-welcome" aria-labelledby="welcome-name"><div><p>{greeting},</p><h1 id="welcome-name">{teacher.name}</h1>{now&&<time>{now.toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</time>}</div><Mascot kind="book" /></section>
    <HomeAgenda />
    <nav className="pwa-shortcuts" aria-label="Pintasan">{shortcuts.map(({label,href,Icon,tone})=><Link href={href} key={label}><span className={"pwa-shortcut-icon "+tone}><Icon size={26} strokeWidth={1.8} aria-hidden="true" /></span><span>{label}</span></Link>)}</nav>
    <section className="pwa-latest" aria-labelledby="latest-title"><h2 id="latest-title">Materi terbaru</h2>{error?<ErrorState message={error} onRetry={()=>{setError("");setAttempt(n=>n+1);}}/>:!items?<Loading label="Memuat materi"/>:items.length?<ul>{items.slice(0,3).map(item=><li key={item.id}><Link href={"/materi?buka="+encodeURIComponent(item.id)}><span className="pwa-latest-icon"><BookOpen size={22} aria-hidden="true"/></span><strong>{item.title}</strong><ArrowUpRight size={19} aria-hidden="true"/></Link></li>)}</ul>:<div className="pwa-latest-empty"><Mascot kind="pencil" mood="think"/><p>Belum ada materi</p></div>}</section>
  </div>;
}
