import { cameraOf, cylinder, depthOf, extrude, fitProjection, iso, pathOf, slabOf } from "../lib/anatomy/iso-kit.mjs";

const colors = {
  clay: ["#e0a181", "#9f543d", "#b66a50", "#c98164", "#da9274"],
  sage: ["#b0c784", "#546a45", "#617c4e", "#749456", "#8ba768"],
  ochre: ["#efce83", "#9c6c39", "#b28649", "#cca15f", "#ddba72"],
  blue: ["#a1c4cd", "#3b6272", "#527b8c", "#6b93a3", "#81a7b4"],
  ink: ["#899a9e", "#3a4b54", "#4f636b", "#617983", "#788d93"],
};

export function Solid({ geometry, palette, selected = false }) {
  return <>
    <path d={geometry.fill} fill={palette[1]} />
    {geometry.shades.map((shade, index) => shade && <path key={index} d={shade} fill={palette[index + 1]} />)}
    <path d={geometry.top} fill={palette[0]} />
    <path d={geometry.outline} fill="none" stroke={selected ? "#803c26" : palette[1]} strokeWidth={selected ? 2.2 : 1} strokeLinejoin="round" />
    {geometry.bevel && <path d={geometry.bevel} fill="none" stroke="#fff9df" strokeOpacity=".65" strokeWidth="1.5" />}
  </>;
}

function surface(points, projection) {
  return pathOf(points.map(point => iso(point, projection)), true);
}

function wedge([x, y, z], [w, d, h], projection) {
  const left = x - w / 2, right = x + w / 2;
  const near = y + d / 2, far = y - d / 2;
  const a = [left, far, z], b = [x, far, z + h], c = [right, far, z];
  const e = [left, near, z], f = [x, near, z + h], g = [right, near, z];
  const { sinA, cosA, sinE, cosE } = cameraOf(projection);
  const panels = [
    { points: [a, b, c], visible: sinA < 0, tone: 0 },
    { points: [e, f, g], visible: sinA >= 0, tone: 1 },
    { points: [a, b, f, e], visible: -h * cosA * cosE + w / 2 * sinE >= 0, tone: 2 },
    { points: [b, c, g, f], visible: h * cosA * cosE + w / 2 * sinE >= 0, tone: 3 },
  ];
  const shades = panels.map(panel => panel.visible ? surface(panel.points, projection) : "");
  return { fill: shades.join(""), shades, top: "", outline: shades.join("") };
}

function ring([x, y, z], [w, , h], projection) {
  const outer = cylinder(x, y, w / 2, z, h, projection, 32);
  const bore = cylinder(x, y, w * .26, z, h, projection, 32);
  return { ...outer, top: outer.top + bore.top, bore };
}

function bounds(parts) {
  return parts.flatMap(({ at, size, spread }) => [0, 1].flatMap(state => {
    const [x, y, z] = at.map((value, axis) => value + spread[axis] * state);
    const [w, d, h] = size;
    return [x - w / 2, x + w / 2].flatMap(px =>
      [y - d / 2, y + d / 2].flatMap(py => [[px, py, z], [px, py, z + h]]));
  }));
}

export function AssemblyFigure({ parts, angle, spread, selected, onSelect }) {
  const projection = fitProjection(bounds(parts), 720, 380, { pad: 50, azimuth: angle, elevation: 29 });
  const frame = parts.map(part => {
    const at = part.at.map((value, axis) => value + part.spread[axis] * spread);
    const [x, y, z] = at;
    const [w, d, h] = part.size;
    let geometry;
    switch (part.shape) {
      case "wedge": geometry = wedge(at, part.size, projection); break;
      case "ring": geometry = ring(at, part.size, projection); break;
      case "cylinder": geometry = cylinder(x, y, w / 2, z, h, projection, 32, 1); break;
      default: geometry = slabOf({ x: x - w / 2, y: y - d / 2, w, d, r: Math.min(5, w / 5, d / 5) }, z, h, projection, 4, .8);
    }
    return { part, geometry, depth: depthOf([x, y, z + h / 2], projection) };
  }).sort((a, b) => a.depth - b.depth);

  return <>
    <ellipse cx="360" cy="312" rx="237" ry="28" fill="#5d4d3512" />
    {frame.map(({ part, geometry }) => <g key={part.id} data-part={part.id} onClick={onSelect ? () => onSelect(part.id) : undefined}>
      <Solid geometry={geometry.bore ? { ...geometry, top: "" } : geometry} palette={colors[part.tone]} selected={part.id === selected} />
      {geometry.bore && <>
        <path d={geometry.bore.top} fill={colors[part.tone][1]} />
        <path d={geometry.top} fill={colors[part.tone][0]} fillRule="evenodd" />
        <path d={geometry.bore.top} fill="none" stroke={colors[part.tone][2]} strokeWidth="1.5" />
      </>}
    </g>)}
  </>;
}

export function SoilBlock() {
  const projection = { origin: [360, 302], azimuth: 61, elevation: 23, scale: 1 };
  const plan = { x: -162, y: -53, w: 324, d: 106, r: 12 };
  const soil = slabOf(plan, -44, 44, projection, 6, 1);
  const edge = slabOf(plan, -7, 7, projection, 6, .7);
  const stones = Array.from({ length: 44 }, (_, index) => {
    const x = (index * 61 % 303) - 151;
    const y = (index * 37 % 90) - 45;
    return iso([x, y, .6], projection);
  });
  return <>
    <ellipse cx="362" cy="361" rx="214" ry="19" fill="#4a3e2619" />
    <Solid geometry={soil} palette={["#97754b", "#573d2c", "#79533a", "#8d6244", "#a47751"]} />
    <Solid geometry={edge} palette={["#9a7b50", "#55422e", "#6f5337", "#755a40", "#866545"]} />
    {stones.map(([x, y], index) => <ellipse key={index} cx={x} cy={y} rx={1.1 + index % 3 * .8} ry={.65 + index % 2 * .5}
      fill={index % 3 === 0 ? "#d2af78" : "#644932"} opacity=".7" />)}
  </>;
}
