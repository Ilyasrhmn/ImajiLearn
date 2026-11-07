"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, BookOpen, Upload } from "lucide-react";

function BookCharacter() {
  return (
    <svg viewBox="0 0 240 220" fill="none" aria-hidden="true">
      <g stroke="#243e43" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M85 175 76 199m67-24 12 24" />
        <ellipse cx="68" cy="201" rx="17" ry="8" fill="#243e43" />
        <ellipse cx="162" cy="201" rx="17" ry="8" fill="#243e43" />
        <path d="M56 121q-24 1-27 23m145-29q23-6 25-28m0 0-8-7m8 7 9-9" />
        <g transform="rotate(-8 119 101)">
          <rect x="57" y="25" width="119" height="151" rx="14" fill="#fff1cf" />
          <path d="M80 25H71q-14 0-14 14v123q0 14 14 14h9Z" fill="#6da798" />
          <path d="M137 26v32l10-7 12 7V26" fill="#e39574" />
          <ellipse cx="108" cy="94" rx="10" ry="14" fill="white" stroke="none" />
          <ellipse cx="144" cy="94" rx="10" ry="14" fill="white" stroke="none" />
          <ellipse cx="110" cy="97" rx="4.5" ry="7" fill="#243e43" stroke="none" />
          <ellipse cx="146" cy="97" rx="4.5" ry="7" fill="#243e43" stroke="none" />
          <circle cx="97" cy="115" r="5" fill="#ec928e" stroke="none" />
          <circle cx="155" cy="115" r="5" fill="#ec928e" stroke="none" />
          <path d="M117 116q10 17 21 0Z" fill="#243e43" />
          <path d="M95 150h54m-54 9h38" stroke="#b4a68a" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}

export default function Dashboard() {
  const [archive, setArchive] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main">Lewati ke isi</a>
      <header className="workspace-header">
        <div className="workspace-shell header-inner">
          <Link className="brand" href="/dashboard" aria-label="ImajiLearn, dashboard">
            <BookOpen aria-hidden="true" size={30} strokeWidth={2} />
            <span>Imaji<span>Learn</span></span>
          </Link>
          <span className="workspace-name">Studio guru</span>
        </div>
      </header>
      <main id="main" className="workspace-shell dashboard">
        <section className="welcome" aria-labelledby="welcome-title">
          <div><h1 id="welcome-title">Besok mengajar apa,<br />Guru?</h1></div>
          <div className="welcome-character"><BookCharacter /></div>
        </section>
        <section className="materials" aria-labelledby="materials-title">
          <div className="materials-heading">
            <h2 id="materials-title">{archive ? "Arsip" : "Materi"}</h2>
            <div className="material-actions">
              <button className="archive-toggle" type="button" aria-pressed={archive} onClick={() => setArchive(!archive)}>
                {archive ? <BookOpen size={19} aria-hidden="true" /> : <Archive size={19} aria-hidden="true" />}
                {archive ? "Materi" : "Arsip"}
              </button>
              <button className="upload-button" type="button" disabled title="Unggah materi belum tersedia">
                <Upload size={19} aria-hidden="true" />Unggah materi
              </button>
            </div>
          </div>
          <div className="empty-library" key={String(archive)}>
            <span className="empty-icon">{archive ? <Archive size={35} aria-hidden="true" /> : <BookOpen size={35} aria-hidden="true" />}</span>
            <p role="status">{archive ? "Belum ada materi di arsip." : "Belum ada materi."}</p>
          </div>
        </section>
      </main>
    </>
  );
}
