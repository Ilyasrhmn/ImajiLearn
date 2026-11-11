import { useId, useRef, useState } from "react";
import { ChevronRight, Ellipsis, Layers3, RotateCcw, RotateCw, X } from "lucide-react";
import VisualDisclosure from "./visual-disclosure";
import { Chloroplast, FigurePin, LeafLayers } from "./visual-plant-anatomy";
import { SoilBlock } from "./visual-solids";

const leaves = [
  [351, 234, -147, .87, -1], [356, 218, 12, .83, 1],
  [351, 181, -153, 1.02, -1], [352, 168, -22, 1.14, 1],
  [350, 139, -133, .85, -1], [349, 119, -43, .71, 1],
  [346, 101, -79, .54, 1],
];
const leafBlade = "M0 0C19-4 23-17 43-25C67-36 106-34 142-21C135-16 131-4 120 3C91 27 57 31 31 14C21 8 12 4 0 0Z";
const leafVeins = "M15 1Q54 8 133-19M34 1Q47-7 52-17M51 0Q68 9 79 13M57-2Q70-11 77-22M78-6Q91 1 106 2M89-9Q102-16 111-24M106-13Q118-7 125-8";
const roots = [
  "M355 294C349 311 319 324 295 333S262 340 254 347",
  "M355 294C362 308 383 311 401 318S430 331 449 333",
  "M355 298C357 315 348 330 339 348S337 361 333 368",
  "M356 300C368 317 367 337 382 353",
  "M340 310C320 312 299 313 275 326",
  "M315 324C313 334 305 344 287 351M296 333Q275 330 263 336M389 314Q403 309 418 313M404 319Q407 328 415 338M345 338Q325 340 316 353M372 338Q388 343 400 351",
];
const routes = {
  light: { color: "#995b14", path: "M554 93C524 93 487 101 455 115", x: 577, y: 130, label: "Cahaya" },
  water: { color: "#176c9a", path: "M264 342C300 334 338 319 354 295C359 253 354 204 351 170Q397 154 443 123", x: 224, y: 323, label: "Air" },
  carbon: { color: "#5b4f92", path: "M586 173C544 176 501 153 453 122", x: 605, y: 156, label: "CO₂" },
  oxygen: { color: "#286782", path: "M453 120C498 116 548 100 586 101", x: 610, y: 87, label: "O₂" },
  sugar: { color: "#9b522f", path: "M445 121Q399 153 351 170C353 202 360 246 357 283Q359 306 397 322", x: 428, y: 299, label: "Gula" },
};

function Route({ route, id }) {
  if (!route) return null;
  return <g aria-hidden="true" pointerEvents="none" key={route.label}>
    <defs><marker id={id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M1 1L9 5L1 9Z" fill={route.color} />
    </marker></defs>
    <path d={route.path} fill="none" stroke="#fff8e7" strokeWidth="8" strokeLinecap="round" opacity=".86" />
    <path className="visual-route-active" d={route.path} fill="none" stroke={route.color} strokeWidth="4.5"
      strokeDasharray="11 7" strokeLinecap="round" markerEnd={`url(#${id})`} />
    <text x={route.x} y={route.y} textAnchor="middle" className="visual-figure-label" fill={route.color}>{route.label}</text>
  </g>;
}

function PlantArt({ focus, ids, selected, onSelect }) {
  return <>
    <defs>
      <linearGradient id={ids + "leaf"} x1="0%" y1="0%" x2="75%" y2="100%">
        <stop stopColor="#b5d381" /><stop offset=".5" stopColor="#70a355" /><stop offset="1" stopColor="#2c6546" />
      </linearGradient>
      <linearGradient id={ids + "focus"} x1="0%" y1="0%" x2="80%" y2="100%">
        <stop stopColor="#e3eaa3" /><stop offset=".49" stopColor="#9bc66d" /><stop offset="1" stopColor="#477d47" />
      </linearGradient>
      <linearGradient id={ids + "stem"}><stop stopColor="#3d6342" /><stop offset=".47" stopColor="#a0be6a" /><stop offset="1" stopColor="#4e7a4b" /></linearGradient>
      <radialGradient id={ids + "sun"}><stop stopColor="#f5d271" stopOpacity=".66" /><stop offset="1" stopColor="#f5d271" stopOpacity="0" /></radialGradient>
    </defs>
    {focus === "light" && <g aria-hidden="true">
      <circle cx="583" cy="82" r="64" fill={`url(#${ids}sun)`} />
      <circle cx="583" cy="82" r="22" fill="#f2cc6b" stroke="#c78a32" strokeWidth="1.3" />
      <path d="M583 51V44M583 113V120M552 82H545M614 82H621M561 60L556 55M605 104L610 109M561 104L556 109M605 60L610 55"
        fill="none" stroke="#c78a32" strokeWidth="2" strokeLinecap="round" />
    </g>}
    <SoilBlock />
    <path d="M251 320Q297 309 352 296Q407 293 458 323L426 349Q399 365 333 373Q283 366 250 349Z"
      fill="#624735" stroke="#78513a" strokeWidth="1" />
    {Array.from({ length: 28 }, (_, index) => {
      const x = 265 + index * 43 % 174;
      const y = 320 + index * 17 % 41 - Math.abs(x - 350) * .1;
      return <path key={index} d={`M${x} ${y}l${2 + index % 5} ${index % 3 - 1}`} stroke="#b48a5e" strokeOpacity=".45" strokeWidth="1.2" />;
    })}
    <g data-part="root" onClick={() => onSelect("root")}>
      {roots.map((d, index) => <path key={d} d={d} fill="none" stroke={index === 5 ? "#b29a67" : "#d7bb85"}
        strokeWidth={index === 5 ? 1.4 : 4 - index * .45} strokeLinecap="round" />)}
    </g>
    <path d="M349 299C357 259 348 224 347 190C346 156 344 120 345 96L350 88C350 122 357 156 358 186C359 227 368 264 361 299Q356 305 349 299Z"
      data-part="stem" onClick={() => onSelect("stem")}
      fill={`url(#${ids}stem)`} stroke="#406644" strokeWidth="1.2" />
    {leaves.map(([x, y, angle, scale, flip], index) => <g key={y}
      transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale} ${scale * flip})`}
      data-part="leaf" onClick={() => onSelect("leaf")}>
      <path d={leafBlade} fill={`url(#${ids}${index === 3 && focus !== "water" ? "focus" : "leaf"})`}
        stroke="#356341" strokeWidth={index === 3 ? 1.5 : 1.1} />
      <path d={leafVeins} fill="none" stroke="#d6e5a2" strokeWidth=".85" opacity=".7" />
      <path d="M24-4Q56-32 115-25" fill="none" stroke="#eff1c2" strokeWidth="1" opacity=".42" />
    </g>)}
    <Route route={routes[focus]} id={ids + "arrow"} />
    <FigurePin id="leaf" label="Daun" point={[272, 157]} x={123} y={121} left selected={selected} onSelect={onSelect} />
    <FigurePin id="stem" label="Batang" point={[353, 254]} x={121} y={236} left selected={selected} onSelect={onSelect} />
    <FigurePin id="root" label="Akar" point={[308, 329]} x={620} y={367} selected={selected} onSelect={onSelect} />
  </>;
}

function StomaArt({ focus, ids, selected, onSelect }) {
  const inward = focus === "carbon";
  return <>
    <path d="M177 249C150 182 189 105 263 88C378 62 482 97 537 173C572 224 514 283 450 307C336 350 209 316 177 249Z"
      fill="#b4ce87" stroke="#547853" strokeWidth="2" />
    {Array.from({ length: 14 }, (_, index) => {
      const x = 212 + index % 5 * 67, y = 129 + Math.floor(index / 5) * 72;
      return <path key={index} transform={`translate(${x} ${y}) rotate(${index * 33})`}
        d="M-26-7Q-27-20-6-23Q10-26 24-13Q36 1 24 14Q18 26-7 20Q-28 18-26-7Z"
        fill="none" stroke="#6f935c" strokeWidth="1.8" opacity=".7" />;
    })}
    <ellipse cx="360" cy="197" rx="61" ry="38" fill="#244f3c" transform="rotate(-28 360 197)"
      data-part="pore" onClick={() => onSelect("pore")} />
    <g data-part="guard" onClick={() => onSelect("guard")}>
      <path d="M303 221C266 193 337 128 381 137C409 143 410 165 384 173C355 175 322 192 318 218C316 225 310 225 303 221Z"
        fill="#719d62" stroke="#386447" strokeWidth="3" />
      <path d="M417 174C451 198 385 268 338 258C311 251 308 230 335 222C367 220 397 201 403 177C405 170 410 170 417 174Z"
        fill="#719d62" stroke="#386447" strokeWidth="3" />
    </g>
    <Route id={ids + "arrow"} route={{ ...routes[focus], x: 573, y: 103,
      path: inward ? "M560 118C498 133 452 172 372 196" : "M372 196C452 172 498 133 560 118" }} />
    <FigurePin id="pore" label="Stomata" point={[360, 196]} x={120} y={287} left selected={selected} onSelect={onSelect} />
    <FigurePin id="guard" label="Sel penjaga" point={[389, 221]} x={624} y={300} selected={selected} onSelect={onSelect} />
  </>;
}

const parts = {
  plant: {
    leaf: ["Daun", "Daun menangkap cahaya. Sebagian besar fotosintesis berlangsung di daun."],
    stem: ["Batang", "Batang menyalurkan air dari akar menuju daun."],
    root: ["Akar", "Akar menyerap air dari tanah."],
  },
  leaf: {
    upper: ["Epidermis atas", "Lapisan pelindung di permukaan atas daun."],
    palisade: ["Jaringan palisade", "Sel-sel rapat di bawah permukaan atas daun. Di dalamnya ada banyak kloroplas."],
    spongy: ["Jaringan spons", "Ruang di antara sel-selnya membantu gas bergerak di dalam daun."],
    lower: ["Epidermis bawah", "Lapisan pelindung di bagian bawah daun. Pada banyak tumbuhan, stomata ada di sini."],
  },
  chloroplast: {
    thylakoid: ["Tilakoid", "Cakram kecil tempat klorofil menangkap cahaya. Reaksi terang berlangsung di membran tilakoid."],
    stroma: ["Stroma", "Cairan yang mengelilingi tumpukan tilakoid. Di sini berlangsung siklus Calvin untuk membentuk bahan penyusun gula."],
    membrane: ["Membran", "Dua lapis membran membungkus kloroplas dan memisahkannya dari bagian lain sel."],
  },
  stoma: {
    pore: ["Stomata", "Pori pada permukaan daun tempat karbon dioksida masuk dan oksigen bisa keluar."],
    guard: ["Sel penjaga", "Dua sel di sisi pori mengatur bukaan stomata."],
  },
};
const views = { plant: "Tanaman", leaf: "Penampang daun", chloroplast: "Kloroplas", stoma: "Stomata" };
const defaults = { leaf: "palisade", chloroplast: "thylakoid", stoma: "pore" };

export default function PhotosynthesisFigure({ step, options }) {
  const ids = useId();
  const context = [step.label, step.detail, step.evidence].join(" ");
  const reactionPart = /stroma|calvin|reaksi gelap/i.test(step.label + " " + step.detail) ? "stroma"
    : /tilakoid|fotosistem|reaksi terang/i.test(step.label + " " + step.detail) ? "thylakoid" : null;
  const plantPart = step.focus === "water" ? "root" : step.focus === "sugar" ? "stem" : "leaf";
  const [view, setView] = useState(reactionPart ? "chloroplast" : step.focus === "leaf" ? "leaf" : "plant");
  const [selection, setSelection] = useState(null);
  const [separation, setSeparation] = useState(0);
  const [angle, setAngle] = useState(59);
  const drag = useRef(null);
  const stage = useRef(null);
  const stoma = /^(carbon|oxygen)$/.test(step.focus) && /stomat/i.test(context);
  const orbit = view === "leaf" || view === "chloroplast";
  const selected = selection ?? (view === "plant" ? plantPart : view === "chloroplast" ? reactionPart ?? defaults.chloroplast : defaults[view]);
  const [caption, detail] = selection ? parts[view][selection] : [step.label, step.detail];
  const path = view === "plant" ? ["plant"] : view === "leaf" ? ["plant", "leaf"] : ["plant", "leaf", view];
  const modelProps = { angle, selected, onSelect: setSelection };
  const nextView = view === "plant" && selection === "leaf" ? (stoma ? "stoma" : "leaf")
    : view === "leaf" && (selection === "palisade" || selection === "spongy") ? "chloroplast"
    : view === "leaf" && selection === "lower" && stoma ? "stoma" : null;

  function open(next, explore = false) {
    setSelection(explore ? defaults[next] ?? null : null);
    setAngle(59);
    setView(next);
    stage.current.focus({ preventScroll: true });
  }

  function closeDetail() {
    setSelection(null);
    stage.current.querySelector(`.visual-pin[data-part="${selection}"]`)?.focus({ preventScroll: true });
  }

  return <figure className="visual-specimen visual-photo-specimen" onKeyDown={event => {
    if (event.key === "Escape" && selection && !event.defaultPrevented) {
      event.preventDefault();
      closeDetail();
    }
  }}>
    <div className="visual-figure-bar">
      <nav className="visual-location" aria-label="Lokasi bagian tumbuhan">
        {path.map((level, index) => <div key={level}>
          {index > 0 && <ChevronRight size={15} aria-hidden="true" />}
          {level === view ? <span aria-current="location">{views[level]}</span>
            : <button type="button" className="visual-quiet-button" onClick={() => open(level)}>{views[level]}</button>}
        </div>)}
      </nav>
      {(orbit || options) && <VisualDisclosure className="visual-options" label={<>
        <Ellipsis size={22} aria-hidden="true" /><span className="visual-sr-only">Opsi visual</span>
      </>}>
        {orbit && <div className="visual-turn" role="group" aria-label="Putar model">
          <button className="visual-quiet-button" type="button" onClick={() => setAngle(value => value - 18)} aria-label="Putar kiri"><RotateCcw size={19} aria-hidden="true" /></button>
          <button className="visual-quiet-button" type="button" onClick={() => setAngle(value => value + 18)} aria-label="Putar kanan"><RotateCw size={19} aria-hidden="true" /></button>
          <button className="visual-quiet-button" type="button" onClick={() => setAngle(59)}>Setel ulang sudut</button>
        </div>}
        {view === "leaf" && <label className="visual-range"><Layers3 size={17} aria-hidden="true" />Pisahkan lapisan
          <input type="range" min="0" max="25" value={separation} onChange={event => setSeparation(Number(event.target.value))} />
        </label>}
        {options && <button className="visual-quiet-button visual-rebuild" type="button" onClick={options.regenerate} disabled={options.busy}>
          {options.busy ? "Membuat visual…" : "Buat ulang visual"}
        </button>}
      </VisualDisclosure>}
    </div>
    {options?.error && <p className="source-error" role="alert">{options.error}</p>}
    {options?.busy && <span className="visual-sr-only" role="status">Membuat ulang visual.</span>}
    <div className="visual-stage" ref={stage} tabIndex={-1} role="group" aria-label={views[view]}>
      <svg key={view} className={`visual-plate${orbit ? " visual-orbit" : ""}`} viewBox="105 0 535 424" role="group" aria-label="Bagian yang bisa dipilih"
        onPointerDown={event => {
          if (orbit && event.isPrimary && event.button === 0) drag.current = { id: event.pointerId, x: event.clientX, angle };
        }}
        onPointerMove={event => {
          if (drag.current?.id !== event.pointerId) return;
          const delta = event.clientX - drag.current.x;
          if (Math.abs(delta) < 5 && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setAngle(drag.current.angle + delta * .55);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) drag.current = null; }}>
        {view === "plant" && <PlantArt focus={step.focus} ids={ids} {...modelProps} />}
        {view === "leaf" && <LeafLayers separation={separation} {...modelProps} />}
        {view === "stoma" && <StomaArt focus={step.focus} ids={ids} {...modelProps} />}
        {view === "chloroplast" && <Chloroplast {...modelProps} />}
      </svg>
    </div>
    <figcaption className="visual-caption">
      <div className="visual-caption-copy" role="status" aria-atomic="true">
        <strong>{caption}</strong><p>{detail}</p>
      </div>
      {selection && <button type="button" className="visual-quiet-button visual-caption-close" onClick={closeDetail} aria-label="Tutup detail bagian">
        <X size={18} aria-hidden="true" />
      </button>}
      {nextView && <button className="visual-quiet-button visual-caption-next" type="button" onClick={() => open(nextView, true)}>
        {nextView === "leaf" ? "Buka penampang daun" : nextView === "stoma" ? "Lihat stomata" : "Lihat kloroplas"}
        <ChevronRight size={17} aria-hidden="true" />
      </button>}
    </figcaption>
  </figure>;
}
