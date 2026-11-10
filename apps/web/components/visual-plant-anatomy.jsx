import { cameraOf, circleRing, cylinder, depthOf, extrude, iso, pathOf } from "../lib/anatomy/iso-kit.mjs";
import { Solid } from "./visual-solids";

export function FigurePin({ id, label, point, x, y, left = false, selected, onSelect }) {
  const [px, py] = point;
  const width = Math.max(72, label.length * 10 + 24);
  return <g className={`visual-pin${selected === id ? " is-selected" : ""}`} data-part={id}
    role="button" tabIndex={0} aria-label={label} aria-pressed={selected === id}
    onClick={() => onSelect(id)} onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(id);
      }
    }}>
    <rect className="visual-pin-target" x={left ? x - 7 : x + 7 - width} y={y - 45} width={width} height="64" rx="9" />
    <path d={`M${px} ${py} L${left ? x + 82 : x - 86} ${y} H${x}`} />
    <circle cx={px} cy={py} r="4.6" />
    <text x={x} y={y - 7} textAnchor={left ? "start" : "end"} className="visual-figure-label">{label}</text>
  </g>;
}

const leafContour = [
  [-98, 46], [87, 46], [103, 35], [108, 20], [104, 0], [89, -18], [65, -36],
  [36, -48], [5, -55], [-25, -54], [-56, -44], [-81, -27], [-96, -8], [-104, 14], [-104, 32],
];

const leafTissues = [
  { id: "lower", label: "Epidermis bawah", height: 0, thickness: 8, palette: ["#9cc87b", "#3a694b", "#507e51", "#659456", "#7bac66"] },
  { id: "spongy", label: "Jaringan spons", height: 8, thickness: 23, palette: ["#cae2a1", "#6e8d57", "#80a45f", "#91b76e", "#a5c781"] },
  { id: "palisade", label: "Palisade", height: 31, thickness: 26, palette: ["#b2d390", "#507e52", "#608d54", "#73a25c", "#89b568"] },
  { id: "upper", label: "Epidermis atas", height: 57, thickness: 8, palette: ["#74ae65", "#326044", "#467849", "#598d50", "#659e5b"] },
];

export function LeafLayers({ separation, angle, selected, onSelect }) {
  const projection = { origin: [360, 247], azimuth: angle, elevation: 24, scale: 1 };
  const { cosA, sinA } = cameraOf(projection);
  const layers = leafTissues.map((layer, index) => ({
    ...layer,
    z: layer.height + (index - 1.5) * separation,
  }));
  const across = (x, y, z) => iso([x, y, z], projection);
  const front = leafContour.filter(([x, y]) => x * cosA + y * sinA > 0);
  return <>
    <g transform="translate(130 51) rotate(-17)" aria-hidden="true">
      <path d="M0 40C13 12 36-6 83 3C71 33 44 53 0 40Z" fill="#afc88e" stroke="#527451" strokeWidth="1.5" />
      <path d="M-5 45Q36 31 74 7" fill="none" stroke="#527451" strokeWidth="1.5" />
      <path d="M34 11L55 12L46 34L26 32Z" fill="#f0e2b288" stroke="#803c26" strokeWidth="1.5" strokeDasharray="4 3" />
    </g>
    <ellipse cx="360" cy="311" rx="151" ry="23" fill="#40523316" />
    {layers.map(({ id, z, thickness, palette }) => {
      const geometry = extrude(leafContour, z, thickness, projection, { convex: true, bevel: .9 });
      return <g key={id} data-part={id} onClick={() => onSelect(id)}>
        <Solid geometry={geometry} palette={palette} selected={selected === id} />
        {id === "upper" && <path d={pathOf([[-88, 14], [-42, 7], [0, 3], [45, -1], [92, 8]].map(([x, y]) => across(x, y, z + thickness)))}
          fill="none" stroke="#c1da99" strokeWidth="2.5" strokeLinecap="round" />}
        {sinA > 0 && (id === "spongy" || id === "palisade") && Array.from({ length: 11 }, (_, item) => {
          const tall = id === "palisade";
          const [cx, cy] = across(-88 + item * 16, 46.2, z + thickness * .49);
          return <ellipse key={item} cx={cx} cy={cy} rx={Math.max(1, sinA * (tall ? 4.6 : 6.5))} ry={tall ? 9.5 : 5}
            transform={`rotate(${tall ? -6 * cosA : 19 * cosA} ${cx} ${cy})`} fill={palette[0]} stroke={palette[1]} strokeWidth=".9" />;
        })}
      </g>;
    })}
    {layers.map(({ id, label, z, thickness }, index) => {
      const left = index % 2 === 0;
      const [x, y] = front.reduce((best, candidate) =>
        (left ? -1 : 1) * (across(...candidate, 0)[0] - across(...best, 0)[0]) > 0 ? candidate : best
      );
      return <FigurePin key={id} id={id} label={label} point={across(x * .97, y * .97, z + thickness * .65)}
        x={left ? 119 : 624} y={303 - index * 56} left={left} selected={selected} onSelect={onSelect} />;
    })}
  </>;
}

const granum = [[-84, -19, 15, 4], [-39, -45, 13, 4], [-33, 32, 16, 4], [12, 1, 17, 6], [57, -32, 14, 4], [83, 5, 15, 5], [37, 36, 13, 3]];
const envelope = circleRing(0, 0, 1, 48).map(([x, y]) => [x * 126, y * 80]);
const inside = envelope.map(([x, y]) => [x * .91, y * .88]);

export function Chloroplast({ angle, selected, onSelect }) {
  const projection = { origin: [360, 219], azimuth: angle, elevation: 34, scale: 1 };
  const at = point => iso(point, projection);
  const ordered = granum.toSorted(([x, y], [a, b]) => depthOf([x, y, 0], projection) - depthOf([a, b, 0], projection));
  const membranePoint = envelope.map(([x, y]) => at([x * .98, y * .98, 0]))
    .reduce((right, point) => point[0] + point[1] > right[0] + right[1] ? point : right);
  const stromaPoints = inside.map(([x, y]) => [x * .88, y * .88, 1])
    .filter(([x, y]) => granum.every(([gx, gy, radius]) => Math.hypot(x - gx, y - gy) > radius + 10));
  const stromaPoint = stromaPoints.map(point => ({ point: at(point), depth: depthOf(point, projection) }))
    .reduce((left, candidate) =>
      candidate.point[0] - candidate.depth * .7 < left.point[0] - left.depth * .7 ? candidate : left
    ).point;
  return <>
    <ellipse cx="360" cy="298" rx="163" ry="19" fill="#355c311a" />
    <g data-part="membrane" onClick={() => onSelect("membrane")}>
      <Solid geometry={extrude(envelope, -15, 15, projection, { convex: true, bevel: 1.1 })}
        palette={["#a5bc72", "#416546", "#598650", "#65935a", "#7aa467"]} selected={selected === "membrane"} />
    </g>
    <g data-part="stroma" onClick={() => onSelect("stroma")}>
      <path d={pathOf(inside.map(([x, y]) => at([x, y, .2])), true)}
        fill={selected === "stroma" ? "#e1eaaa" : "#c1d58d"} stroke={selected === "stroma" ? "#803c26" : "#749557"} strokeWidth="2" />
    </g>
    {[[0, 1, 3, 4], [2, 6, 5]].map(chain => <path key={chain.join()} d={pathOf(chain.map(index => at([...granum[index].slice(0, 2), 3])))}
      fill="none" stroke="#7ba467" strokeWidth="5" strokeLinejoin="round" pointerEvents="none" />)}
    <g data-part="thylakoid" onClick={() => onSelect("thylakoid")}>
      {ordered.map(([x, y, radius, count]) => <g key={x}>
        {Array.from({ length: count }, (_, index) => {
          const disk = cylinder(x, y, radius, index * 3.6, 3, projection, 20);
          return <Solid key={index} geometry={disk} selected={selected === "thylakoid" && x === 12}
            palette={["#8ab877", "#365f42", "#517b49", "#608e54", "#78a268"]} />;
        })}
      </g>)}
    </g>
    <FigurePin id="thylakoid" label="Tilakoid" point={at([12, 1, 22])} x={622} y={110} selected={selected} onSelect={onSelect} />
    <FigurePin id="stroma" label="Stroma" point={stromaPoint} x={119} y={272} left selected={selected} onSelect={onSelect} />
    <FigurePin id="membrane" label="Membran" point={membranePoint} x={623} y={316} selected={selected} onSelect={onSelect} />
  </>;
}
