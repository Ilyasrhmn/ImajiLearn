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

function SourceBlock({ block }) {
  if (block.kind === "heading") {
    const Heading = `h${block.level}`;
    return <Heading>{block.text}</Heading>;
  }
  if (block.kind === "list" || block.kind === "ordered-list") {
    const List = block.kind === "ordered-list" ? "ol" : "ul";
    return <List>{block.items.map((item, i) => <li key={i} value={item.value}><SourceRuns runs={item.runs} /></li>)}</List>;
  }
  return <p className={block.kind === "caption" ? "material-source-caption" : undefined}><SourceRuns runs={block.runs} /></p>;
}

export default function MaterialSource({ teacherId, sourcePath, material, firstPage = 1, lastPage, selectedPages, onVisiblePage }) {
  const pdf = material.file?.mime === "application/pdf";
  const [pages, setPages] = useState([]);
  const [requested, setRequested] = useState(firstPage);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const marker = useRef(null);
  const documentBody = useRef(null);
  const candidate = selectedPages?.length && pages.length ? selectedPages[pages.length] : pages.at(-1)?.next;
  const next = candidate && (!lastPage || candidate <= lastPage) ? candidate : null;

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

  useEffect(() => {
    if (!onVisiblePage || !pages.length || !documentBody.current) return;
    const elements = [...documentBody.current.querySelectorAll("[data-source-page]")];
    const navigation = document.querySelector(".material-navigation");
    let frame = 0;
    function updatePage() {
      frame = 0;
      const edge = Math.max(0, navigation?.getBoundingClientRect().bottom ?? 0) + 24;
      let active = elements[0];
      for (const element of elements) {
        if (element.getBoundingClientRect().top > edge) break;
        active = element;
      }
      onVisiblePage(Number(active.dataset.sourcePage));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(updatePage);
    }
    updatePage();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(documentBody.current);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [onVisiblePage, pages]);

  if (!pdf) {
    return material.text ? <div className="material-source-text">
      {formatSourceText(material.text).map((block, index) => <SourceBlock key={index} block={block} />)}
    </div>
      : <p role="status">Teks sumber tidak tersedia.</p>;
  }

  return <div className="material-source-text" ref={documentBody}>
    {pages.map(page => <div className="material-source-page" data-source-page={page.page} key={page.page}>
      <Image className="material-pdf-preview" src={page.preview} alt={`Halaman ${page.page} dari ${material.file.name}`}
        width={page.width} height={page.height} unoptimized />
    </div>)}
    {failed ? <button type="button" className="source-secondary" onClick={() => {
      setFailed(false);
      setAttempt(value => value + 1);
    }}>Muat ulang halaman</button>
      : (!pages.length || next === requested) ? <p role="status">Memuat sumber…</p> : null}
    {next && next > requested && <div ref={marker} />}
  </div>;
}
