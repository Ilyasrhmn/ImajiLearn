"use client";
import { useEffect, useRef } from "react";
import LkpdPages from "./lkpd-pages";

export function worksheetOverflows(root) {
  return [...root.querySelectorAll(".lkpd-paper, .lkpd-cut-card, .lkpd-match-target > p, .lkpd-fold-cover > div, .lkpd-fold-base > div, .lkpd-cube-label")].some(element => element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2);
}

export default function LkpdPreflight({ document: worksheet, signal, onChecked }) {
  const root = useRef(null);
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        await document.fonts.ready;
        if (!alive || signal.aborted || !root.current) return;
        await Promise.all([...root.current.querySelectorAll("img")].map(image => image.decode()));
        if (!alive || signal.aborted) return;
        onChecked(worksheetOverflows(root.current) ? "Hasil belum muat pada pola. Coba buat LKPD lagi." : "");
      } catch { if (alive && !signal.aborted) onChecked("Gambar aktivitas belum dapat dimuat. Coba lagi."); }
    }
    check();
    return () => { alive = false; };
  }, [worksheet, signal, onChecked]);
  return <div ref={root} className="lkpd-preflight" inert aria-hidden="true"><LkpdPages document={worksheet} /></div>;
}
