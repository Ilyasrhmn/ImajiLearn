"use client";

import { useId, useRef, useState } from "react";
import { earthLayers } from "../lib/visual-templates.mjs";

const slices = 36;
const circle = Array.from({ length: slices }, (_, i) => 2 * Math.PI * i / slices);
const continents = [
  [-108, 48, 41, 25], [-82, 19, 16, 10], [-60, -15, 19, 32],
  [-42, 72, 16, 11], [15, 52, 24, 17], [20, 7, 25, 31],
  [79, 48, 58, 26], [110, 16, 27, 14], [135, -25, 19, 13],
];

function project([x, y, z], angle) {
  const horizontal = x * Math.cos(angle) + z * Math.sin(angle);
  const depth = z * Math.cos(angle) - x * Math.sin(angle);
  return [horizontal, y * .96 - depth * .28, y * .28 + depth * .96];
}

function Stage({ faces, angle, setAngle, onSelect, label, signal }) {
  const drag = useRef(null);
  const arrowId = useId();
  const frame = faces.map(face => {
    const points = face.points.map(point => project(point, angle));
    return { ...face, points, depth: points.reduce((sum, p) => sum + p[2], 0) / points.length };
  }).sort((a, b) => a.depth - b.depth);

  return <>
    <svg className="visual-earth visual-orbit" viewBox="-340 -170 680 340" role="img" aria-label={label}
      onPointerDown={event => { if (event.isPrimary && event.button === 0) drag.current = { id: event.pointerId, x: event.clientX, angle }; }}
      onPointerMove={event => {
        if (drag.current?.id !== event.pointerId) return;
        const dx = event.clientX - drag.current.x;
        if (Math.abs(dx) < 4 && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setAngle(drag.current.angle + dx * .012);
      }}
      onPointerUp={event => {
        if (drag.current?.id !== event.pointerId) return;
        const moved = event.currentTarget.hasPointerCapture(event.pointerId);
        const part = event.target.dataset.part;
        drag.current = null;
        if (!moved && part) onSelect?.(part);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) drag.current = null; }}>
      {frame.map(({ key, points, fill, part, edge, leaf, curve, width, veins }) => {
        const coordinates = points.map(([x, y]) => x.toFixed(2) + "," + y.toFixed(2));
        if (leaf) return <path key={key} d={`M${coordinates[0]} C${coordinates.slice(1,4).join(" ")} C${coordinates.slice(4).join(" ")} ${coordinates[0]}Z`}
          fill={fill} stroke={edge} strokeWidth="1.4" />;
        if (curve || veins) {
          const path = coordinates.length === 2 ? `M${coordinates[0]} L${coordinates[1]}` :
            `M${coordinates[0]} ${coordinates.length === 3 ? "Q" : "C"}${coordinates.slice(1).join(" ")}`;
          return <g key={key} fill="none" stroke={fill} strokeWidth={width ?? 1.2} strokeLinecap="round">
            <path d={path} />
            {veins?.map((line, index) => <polyline key={index} points={line.map(point => project(point, angle).slice(0,2).join(",")).join(" ")} />)}
          </g>;
        }
        return <polygon key={key}
        points={points.map(([x, y]) => x.toFixed(2) + "," + y.toFixed(2)).join(" ")}
        data-part={part} fill={fill} stroke={edge ?? fill} strokeWidth={edge ? 1.5 : .55} />;
      })}
      {signal && <>
        <defs><marker id={arrowId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0 0L5 2.5L0 5Z" fill={signal.color} />
        </marker></defs>
        <polyline className="visual-route-active" points={signal.points.map(point => project(point, angle).slice(0,2).join(",")).join(" ")}
          fill="none" stroke={signal.color} strokeWidth="4" strokeDasharray="7 5" strokeLinejoin="round"
          markerEnd={"url(#" + arrowId + ")"} />
      </>}
    </svg>
    <div className="visual-layer-buttons" role="group" aria-label="Putar model">
      <button type="button" className="source-secondary" onClick={() => setAngle(angle - Math.PI / 8)}>Putar kiri</button>
      <button type="button" className="source-secondary" onClick={() => setAngle(angle + Math.PI / 8)}>Putar kanan</button>
    </div>
  </>;
}

function shell(faces, key, radius, center, side, color, part) {
  const rings = Array.from({ length: 10 }, (_, i) => {
    const latitude = Math.PI * i / 18;
    return circle.map(t => [
      center + side * radius * Math.sin(latitude),
      radius * Math.cos(latitude) * Math.sin(t),
      radius * Math.cos(latitude) * Math.cos(t),
    ]);
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < slices; j++) {
      const next = (j + 1) % slices;
      faces.push({ key: key + i + ":" + j, part, fill: color(i, j),
        points: [rings[i][j], rings[i + 1][j], rings[i + 1][next], rings[i][next]] });
    }
  }
}

function globeColor(side, band, slice) {
  const t = (slice + .5) * 2 * Math.PI / slices;
  const arc = Math.PI * (band + .5) / 18;
  const x = side * Math.sin(arc);
  const y = Math.cos(arc) * Math.sin(t);
  const z = Math.cos(arc) * Math.cos(t);
  const longitude = Math.atan2(x, z) * 180 / Math.PI;
  const latitude = Math.asin(-y) * 180 / Math.PI;
  if (latitude < -70) return "#e3ece4";
  const land = continents.some(([lng, lat, width, height]) =>
    ((longitude - lng) / width) ** 2 + ((latitude - lat) / height) ** 2 < 1
  );
  return land ? "#87a973" : "#6595a6";
}
export function EarthModel({ details }) {
  const [spread, setSpread] = useState(0);
  const [angle, setAngle] = useState(-.75);
  const [selected, setSelected] = useState(null);
  const separated = Math.max(0, (spread - 50) / 50);
  const opened = Math.min(1, spread / 50);
  const base = -115 * opened;
  const faces = [];
  shell(faces, "back", 124, base, -1, (i, j) => globeColor(-1, i, j), "crust");
  if (opened < 1) shell(faces, "cover", 124, base + 220 * opened, 1, (i, j) => globeColor(1, i, j), "crust");
  if (spread > 0) {
    earthLayers.forEach(layer => {
      const radius = layer.radius * 124 / 172;
      const inner = layer.inner * 124 / 172;
      const center = base + layer.offset * .65 * separated;
      if (separated > 0 && layer.id !== "crust") {
        shell(faces, layer.id, radius, center, -1, () => layer.side, layer.id);
      }
      const point = (r, i) => [center, r * Math.sin(circle[i]), r * Math.cos(circle[i])];
      for (let i = 0; i < slices; i++) {
        const next = (i + 1) % slices;
        faces.push({ key: "cut-" + layer.id + i, part: layer.id,
          fill: selected === layer.id ? layer.side : layer.fill,
          points: [point(radius, i), point(radius, next), point(inner, next), point(inner, i)] });
      }
    });
  }
  const active = earthLayers.find(layer => layer.id === selected);
  function select(id) {
    setSelected(id);
    if (!spread) setSpread(50);
  }
  return <>
    <Stage faces={faces} angle={angle} setAngle={setAngle} onSelect={select} label="Model lapisan Bumi yang bisa diputar" />
    <label className="visual-spread">Buka lapisan
      <input type="range" min={0} max={100} value={spread}
        aria-valuetext={spread === 0 ? "Bumi utuh" : spread <= 50 ? "Penampang" : "Lapisan terurai"}
        onChange={event => setSpread(Number(event.target.value))} />
    </label>
    <small>Tidak sesuai skala</small>
    <div className="visual-layer-buttons" role="group" aria-label="Lapisan Bumi">
      {earthLayers.map(layer => <button key={layer.id} type="button" className="source-secondary"
        aria-pressed={selected === layer.id} onClick={() => select(layer.id)}>{layer.label}</button>)}
    </div>
    {active && <div className="visual-detail" role="status">
      <h3>{active.label}</h3>
      <p>{details[active.id] ?? "Bagian ini belum dijelaskan di materi."}</p>
    </div>}
  </>;
}

export function CubeModel({ detail }) {
  const [fold, setFold] = useState(0);
  const [angle, setAngle] = useState(.4);
  const a = fold * Math.PI / 200;
  const c = Math.cos(a), s = Math.sin(a);
  const l = -48, r = 48, n = 96;
  const top = y => [[l, y, 0], [r, y, 0]];
  const upper = [[l, l - n * c, n * s], [r, l - n * c, n * s]];
  const lid = upper.map(([x, y, z]) => [x, y - n * Math.cos(2 * a), z + n * Math.sin(2 * a)]);
  const lower = [[l, r + n * c, n * s], [r, r + n * c, n * s]];
  const panels = [
    [...top(l), ...top(r).toReversed()],
    [...top(l), ...upper.toReversed()],
    [...upper, ...lid.toReversed()],
    [...top(r), ...lower.toReversed()],
    [[l, l, 0], [l, r, 0], [l - n * c, r, n * s], [l - n * c, l, n * s]],
    [[r, l, 0], [r, r, 0], [r + n * c, r, n * s], [r + n * c, l, n * s]],
  ];
  const colors = ["#aec6a2", "#e2a183", "#eed395", "#8fb4bc", "#c6add3", "#e6aeaa"];
  const faces = panels.map((panel, i) => ({
    key: i, fill: colors[i], edge: "#34565a",
    points: panel.map(([x, y, z]) => [x, y + 34 * (1 - fold / 100), z - 48 * fold / 100]),
  }));
  return <>
    <Stage faces={faces} angle={angle} setAngle={setAngle} label="Enam sisi jaring-jaring kubus" />
    <label className="visual-spread">Lipat jaring-jaring
      <input type="range" min={0} max={100} value={fold}
        aria-valuetext={fold === 0 ? "Jaring-jaring terbuka" : fold === 100 ? "Kubus tertutup" : fold + "%"}
        onChange={event => setFold(Number(event.target.value))} />
    </label>
    <p>{detail}</p>
  </>;
}
