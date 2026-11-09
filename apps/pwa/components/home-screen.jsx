"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardPenLine, Plus, Scissors } from "lucide-react";
import { materialAppearance } from "../lib/presentation.mjs";
import { Mascot } from "@imajilearn/shared/components/mascot.jsx";
import { listMaterials } from "@imajilearn/shared/lib/materials.mjs";
import { useSession } from "./session-gate";
import HomeAgenda from "./home-agenda";
import { Loading, ErrorState } from "./ui";

export default function HomeScreen() {
  const teacher = useSession();
  const [items, setItems] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; listMaterials(teacher.id).then(data => { if (active) setItems(data.filter(item => !item.archived).sort((a, b) => b.createdAt - a.createdAt)); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [teacher.id, attempt]);
  return <><div className="page-title"><h1>Beranda</h1></div><section className="home-feature"><div><h2>Bahan ajar</h2><p>PDF, TXT, atau teks</p></div><Mascot kind="book" /><Link className="primary" href="/materi?tambah=1"><Plus size={18} />Tambah materi<ArrowRight size={18} /></Link></section><section className="section"><h2>Buat baru</h2><div className="quick-actions"><Link href="/lkpd"><Scissors size={28} /><strong>LKPD</strong><ArrowRight size={17} /></Link><Link href="/ujian"><ClipboardPenLine size={28} /><strong>Soal & ujian</strong><ArrowRight size={17} /></Link></div></section><section className="section"><div className="section-heading"><h2>Materi terbaru</h2><Link href="/materi">Lihat semua<ArrowRight size={15} /></Link></div>{error ? <ErrorState message={error} onRetry={() => { setError(""); setAttempt(n => n + 1); }} /> : !items ? <Loading label="Memuat materi" /> : items.length ? <div className="home-materials">{items.slice(0, 4).map(item => <Link className="thumbnail-card" href={`/materi?buka=${encodeURIComponent(item.id)}`} key={item.id}><div className={`thumbnail ${materialAppearance(item.id).tone}`}><Mascot kind={materialAppearance(item.id).kind} /></div><div className="thumbnail-caption"><strong>{item.title}</strong><small>{item.file?.name || "Teks materi"}</small></div></Link>)}</div> : <div className="empty-inline"><BookOpen size={24} /><p>Belum ada materi.</p><Link href="/materi?tambah=1">Tambah materi<ArrowRight size={16} /></Link></div>}</section><HomeAgenda /></>;
}
