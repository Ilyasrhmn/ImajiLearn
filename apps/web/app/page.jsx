import Link from "next/link";
import Image from "next/image";
import { Compass, LogIn } from "lucide-react";
import { brandAssets } from "@imajilearn/shared/assets";
import { CharacterGroup, Mascot } from "../components/mascot";
import MaterialTabIcon from "../components/material-tab-icon";
import LandingFooter from "../components/landing-footer";
import LandingInstall from "../components/landing-install";
import LandingVideo from "../components/landing-video";
import "./landing.css";

export const metadata = {
  title: "ImajiLearn | Media ajar untuk guru SD",
  description: "Ubah bahan ajar menjadi bacaan bergambar, slide, lagu belajar, dan visual interaktif untuk kelas.",
};

const steps = [
  ["source", "book", "Unggah materi", "Gunakan PDF atau teks bahan ajar."],
  ["reading", "pencil", "Pilih media", "Buat bacaan bergambar, slide, lagu, atau visual interaktif."],
  ["slides", "pen", "Tampilkan di kelas", "Buka hasilnya di layar atau proyektor."],
];

const exampleFormats = [
  ["reading", "Bacaan bergambar", "Baca proses fotosintesis dan jawab kuis bersama."],
  ["slides", "Slide", "Jelaskan peran cahaya, air, dan daun di proyektor."],
  ["song", "Lagu belajar", "Nyanyikan kembali apa yang dibutuhkan tumbuhan."],
  ["mindmap", "Visual interaktif", "Klik bagian tanaman untuk melihat perannya."],
];

const pwaOrigin = process.env.PWA_PUBLIC_ORIGIN || (process.env.NODE_ENV === "development"
  ? "http://localhost:3002" : "https://pwa.imajilearn.ai.id");

export default function Home() {
  return <div className="landing" id="awal">
    <a className="skip-link" href="#main">Lewati ke isi</a>
    <header className="landing-header">
      <Link href="/" className="landing-brand">
        <Image src={brandAssets.mark} alt="" width={45} height={45} priority />
        <Image src={brandAssets.wordmark} alt="ImajiLearn" width={180} height={52} priority />
      </Link>
      <Link href="/masuk" className="landing-login"><LogIn size={18} aria-hidden="true" />Masuk</Link>
    </header>
    <main id="main">
      <section className="landing-hero landing-shell">
        <div>
          <h1>Bahan ajar siap dipakai di kelas.</h1>
          <p>ImajiLearn membantu guru SD mengolah PDF atau teks menjadi media ajar interaktif dengan AI.</p>
          <Link href="/demo" className="landing-button"><Compass size={21} aria-hidden="true" />Coba demo</Link>
        </div>
        <CharacterGroup />
      </section>
      <LandingVideo />
      <section className="landing-example" id="contoh-materi" aria-labelledby="landing-example-title">
        <div className="landing-shell">
          <div className="landing-example-art">
            <h2 id="landing-example-title">Empat cara mengajar fotosintesis</h2>
            <Image src="/demo/tumbuhan.svg" alt="" width={480} height={360} unoptimized />
          </div>
          <ul className="landing-example-formats" role="list">
            {exampleFormats.map(([kind, title, detail]) => (
              <li key={kind}>
                <MaterialTabIcon kind={kind} />
                <div><h3>{title}</h3><p>{detail}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="landing-workflow" id="cara-kerja" aria-labelledby="landing-workflow-title">
        <h2 className="landing-shell" id="landing-workflow-title">Dari bahan ajar ke kelas.</h2>
        <ol>
          {steps.map(([kind, mascot, title, detail]) => <li key={title}>
            <div className="landing-shell landing-step">
                <div className="landing-step-copy">
                  <MaterialTabIcon kind={kind} pdf={kind === "source"} />
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
                <div className="landing-step-art" aria-hidden="true">
                  <div className="landing-step-reveal">
                    <Mascot kind={mascot} />
                    {kind === "reading"
                      ? <div className="landing-step-media">
                          {["reading", "slides", "song", "mindmap"].map(media => <MaterialTabIcon key={media} kind={media} />)}
                        </div>
                      : <MaterialTabIcon kind={kind} pdf={kind === "source"} />}
                  </div>
                </div>
            </div>
          </li>)}
        </ol>
      </section>
    </main>
    <LandingFooter />
    <LandingInstall href={new URL("/app/instal", pwaOrigin).href} />
  </div>;
}
