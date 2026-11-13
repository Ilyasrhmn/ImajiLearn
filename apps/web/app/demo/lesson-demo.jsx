"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import MaterialReading from "../../components/material-reading";
import MaterialSlides from "../../components/material-slides";
import MaterialVisual from "../../components/material-visual";
import { Karaoke } from "../../components/material-song";
import MaterialProjector from "../../components/material-projector";
import MaterialTabIcon from "../../components/material-tab-icon";
import { formats } from "../../components/material-formats.mjs";
import { reading, deck, visual, song } from "./sample.mjs";
import "../../components/material-detail.css";
import "./lesson-demo.css";

const source = { id: "source", segment: "", label: "Sumber" };
const media = ["reading", "slides", "song", "mindmap"].map(id => formats.find(format => format.id === id));
const short = { reading: "Bacaan", song: "Lagu", mindmap: "Visual" };
const readingImages = [1, 2, 3].map(index => `/demo/bacaan-fotosintesis-${index}.webp`);
const slideImages = [1, 2, 3].map(index => `/demo/slide-fotosintesis-${index}.webp`);
const sourcePages = [1, 2, 3];

export default function LessonDemo() {
  const selected = useSearchParams().get("media");
  const active = media.find(item => item.segment === selected) ?? source;

  function tab(item) {
    return <Link key={item.id} href={item.segment ? `/demo?media=${item.segment}` : "/demo"}
      aria-label={item.label} aria-current={item.id === active.id ? "page" : undefined}>
      <MaterialTabIcon kind={item.id} pdf />
      <span className="material-tab-label">{item.label}</span>
      <span className="material-tab-label-short">{short[item.id] ?? item.label}</span>
    </Link>;
  }

  return <main id="main" className="material-page landing-lesson">
    <header className="material-navigation">
      <Link href="/" className="material-return material-library-link"><ArrowLeft size={18} aria-hidden="true" />Beranda</Link>
      <nav className="material-tabs" aria-label="Media demo">
        <div className="material-tab-group">{media.map(tab)}</div>
        <div className="material-tab-source">{tab(source)}</div>
      </nav>
    </header>
    <div className={`material-panel material-output-page demo-panel demo-${active.id}`} key={active.id}>
      {active.id === "source" && <div className="material-source-sections">
        <nav className="source-section-picker material-source-sidebar" aria-label="Halaman sumber">
          <ul>{sourcePages.map(page => <li key={page}>
            <a className="demo-source-link" href={`#halaman-${page}`}><FileText size={18} aria-hidden="true" />Halaman {page}</a>
          </li>)}</ul>
        </nav>
        <div className="material-source-inner">
          <h1>Bahan Ajar Fotosintesis</h1>
          <div className="material-source-text">
            {sourcePages.map(page => <div className="material-source-page" id={`halaman-${page}`} key={page}>
              <Image className="material-pdf-preview" src={`/demo/fotosintesis-${page}.jpg`} width={1273} height={1801}
                alt={`Halaman ${page} dari Bahan Ajar Fotosintesis`} unoptimized />
            </div>)}
          </div>
        </div>
      </div>}
      {active.id === "reading" && <MaterialReading reading={reading} sampleImages={readingImages} />}
      {active.id === "slides" && <MaterialSlides deck={deck} sampleImages={slideImages} />}
      {active.id === "mindmap" && <MaterialProjector><MaterialVisual visual={visual} /></MaterialProjector>}
      {active.id === "song" && <MaterialProjector><article className="format-detail material-song">
        <h2 data-output-heading>{song.title}</h2>
        <Karaoke song={song} audioUrl="/demo/rahasia-daun-hijau.mp3" />
      </article></MaterialProjector>}
    </div>
  </main>;
}
