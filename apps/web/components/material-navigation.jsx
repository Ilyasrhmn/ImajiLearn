"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import MaterialTabIcon from "./material-tab-icon";
import { formats } from "./material-formats.mjs";

const source = { id: "source", segment: "", label: "Sumber" };
const mobileLabels = { reading: "Bacaan", mindmap: "Visual", song: "Lagu" };
const media = ["reading", "slides", "song", "mindmap"].map(id => formats.find(format => format.id === id));

export default function MaterialNavigation({ materialId, folderId, pdf, activeSegment, libraryHref }) {
  const [routeSegment = ""] = useSelectedLayoutSegments();
  const segment = activeSegment ?? routeSegment;
  const href = `/materi/${encodeURIComponent(materialId)}`;
  const dashboardHref = folderId ? `/buat-media?folder=${encodeURIComponent(folderId)}#materi` : "/buat-media#materi";

  function tab(item) {
    return <Link key={item.id} href={item.segment ? `${href}/${item.segment}` : href}
      aria-label={item.label} aria-current={item.segment === segment ? "page" : undefined}>
      <MaterialTabIcon kind={item.id} pdf={pdf} />
      <span className="material-tab-label">{item.label}</span>
      <span className="material-tab-label-short">{mobileLabels[item.id] ?? item.label}</span>
    </Link>;
  }

  return <header className="material-navigation">
    <Link className="material-return material-library-link" href={libraryHref ?? dashboardHref}><ArrowLeft size={18} aria-hidden="true" />Materi</Link>
    <nav className="material-tabs" aria-label="Media materi">
      <div className="material-tab-group">{media.map(tab)}</div>
      <div className="material-tab-source">{tab(source)}</div>
    </nav>
  </header>;
}
