"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { brandAssets } from "@imajilearn/shared/assets";
import { UserPlus } from "lucide-react";
import MaterialTabIcon from "./material-tab-icon";
import { Mascot } from "./mascot";
import "./landing-footer.css";

const wordmark = "ImajiLearn";
const crew = [
  { kind: "book", label: "Buku", left: "7%", bottom: "3%", tilt: "-10deg" },
  { kind: "pencil", label: "Pensil", left: "28%", bottom: "50%", tilt: "12deg" },
  { kind: "eraser", label: "Penghapus", left: "44%", bottom: "-5%", tilt: "-7deg" },
  { kind: "pen", label: "Pulpen", left: "67%", bottom: "45%", tilt: "-11deg" },
  { kind: "correction", label: "Tipe-X", left: "94%", bottom: "-3%", tilt: "8deg" },
];

const floaters = [
  ["source", "15%", "25%", "0ms"],
  ["reading", "45%", "-6%", "-1400ms"],
  ["slides", "57%", "28%", "-700ms"],
  ["song", "80%", "-6%", "-2400ms"],
  ["mindmap", "91%", "36%", "-1800ms"],
];

function hop(event) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const character = event.currentTarget.firstElementChild;
  character.getAnimations().forEach(animation => animation.cancel());
  character.animate([
    { transform: "translateY(0) scale(1)" },
    { transform: "translateY(-18%) scale(.95, 1.06)", offset: .43 },
    { transform: "translateY(0) scale(1.07, .94)", offset: .82 },
    { transform: "translateY(0) scale(1)" },
  ], { duration: 480, easing: "ease-out" });
}

export default function LandingFooter() {
  const stage = useRef(null);

  useEffect(() => {
    const element = stage.current;
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      element.toggleAttribute("data-in-view", entry.isIntersecting);
      if (entry.isIntersecting) element.dataset.arrived = "";
    }, { threshold: .15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <footer className="landing-footer" aria-label="ImajiLearn">
    <div className="landing-shell">
      <div className="landing-footer-links">
        <Link href="#awal" className="landing-brand">
          <Image src={brandAssets.mark} alt="" width={44} height={44} />
          <Image src={brandAssets.wordmark} alt="ImajiLearn" width={155} height={45} />
        </Link>
        <Link href="/daftar" className="landing-button"><UserPlus size={18} aria-hidden="true" />Daftar akun guru</Link>
      </div>
      <div className="landing-footer-stage" ref={stage}>
        <svg className="landing-footer-doodles" viewBox="0 0 960 320" preserveAspectRatio="none" aria-hidden="true">
          <path className="landing-footer-paper-line" pathLength="1" d="M26 273c254 21 611 24 908-5" />
          <path className="landing-footer-spark" d="M114 76q0 15 15 15-15 0-15 15 0-15-15-15 15 0 15-15Z" />
          <path className="landing-footer-spark" d="M790 53q0 11 11 11-11 0-11 11 0-11-11-11 11 0 11-11Z" />
          <path className="landing-footer-spark" d="m899 118 8-11m-1 19 13-4M387 71q10-18 22-10" />
        </svg>
        <div className="landing-footer-floaters" aria-hidden="true">
          {floaters.map(([kind, left, top, delay]) => (
            <span key={kind} style={{ left, top, "--float-delay": delay }}>
              <MaterialTabIcon kind={kind} pdf={kind === "source"} />
            </span>
          ))}
        </div>
        <div className="landing-footer-word" aria-hidden="true">
          {Array.from(wordmark, (letter, index) => <span key={index} style={{ "--letter": index }}>{letter}</span>)}
        </div>
        {crew.map(({ kind, label, left, bottom, tilt }, index) => (
          <button className="landing-footer-mascot" key={kind} type="button" aria-label={`Ajak ${label} melompat`}
            style={{ left, bottom, "--tilt": tilt, "--member": index }} onClick={hop}>
            <span aria-hidden="true"><Mascot kind={kind} /></span>
          </button>
        ))}
      </div>
    </div>
  </footer>;
}
