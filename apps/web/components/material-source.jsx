"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { formatSourceText } from "./material-source-text.mjs";
import { studioRequest } from "../lib/studio-api.mjs";

function SourceRuns({ runs }) {
  return runs.map(({ text, bold, italic, script }, index) => {
    const Script = script ?? "span";
    const content = italic ? <em>{text}</em> : text;
    return <Script key={index}>{bold ? <strong>{content}</strong> : content}</Script>;
  });
}

function SourceBlock({ block, page }) {
  if (block.kind === "heading") {
    const Heading = `h${block.level}`;
    return <Heading>{block.text}</Heading>;
  }
  if (block.kind === "list" || block.kind === "ordered-list") {
    const List = block.kind === "ordered-list" ? "ol" : "ul";
    return <List>{block.items.map((item, i) => <li key={i} value={item.value}><SourceRuns runs={item.runs} /></li>)}</List>;
  }
  if (block.kind === "formula" || block.kind === "image") {
    const image = <Image src={block.src} alt={block.kind === "formula" ? `Rumus asli dari halaman ${page}: ${block.lines.join(". ")}` : `Gambar asli dari halaman ${page}`}
      width={block.width} height={block.height} unoptimized />;
    return block.kind === "formula" ? <figure className="material-source-formula">{image}</figure> : image;
  }
  return <p className={block.kind === "caption" ? "material-source-caption" : undefined}><SourceRuns runs={block.runs} /></p>;
}

export default function MaterialSource({ teacherId, sourcePath, material }) {
  const pdf = material.file?.mime === "application/pdf";
  const [pages, setPages] = useState([]);
  const [requested, setRequested] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const marker = useRef(null);
  const next = pages.at(-1)?.next ?? null;

  useEffect(() => {
    if (!pdf) return;
    const controller = new AbortController();
    studioRequest(teacherId, `${sourcePath}/source?page=${requested}`, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setPages(current => [...current, data]);
      }).catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [pdf, teacherId, sourcePath, requested, attempt]);

  useEffect(() => {
    if (!next || next <= requested || !marker.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setRequested(next);
    }, { rootMargin: "360px" });
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, [next, requested]);

  if (!pdf || (failed && !pages.length)) {
    return material.text ? <div className="material-source-text">
      {formatSourceText(material.text, pdf).map((block, index) => <SourceBlock key={index} block={block} />)}
    </div>
      : <p role="status">Teks sumber tidak tersedia.</p>;
  }

  return <div className="material-source-text">
    {pages.map(page => <div className="material-source-page" key={page.page}>
      {page.blocks.map((block, index) => <SourceBlock key={index} block={block} page={page.page} />)}
    </div>)}
    {failed ? <button type="button" className="source-secondary" onClick={() => {
      setFailed(false);
      setAttempt(value => value + 1);
    }}>Muat ulang halaman</button>
      : (!pages.length || next === requested) ? <p role="status">Memuat sumber…</p> : null}
    {next && next > requested && <div ref={marker} />}
  </div>;
}
