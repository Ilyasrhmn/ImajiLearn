import * as T from "three";
import { learningModels } from "../learning-models.mjs";

const v = (x, y, z) => new T.Vector3(x, y, z);
const material = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .66, ...extra });
function solid(group, geometry, color, position = [0, 0, 0]) {
  const item = new T.Mesh(geometry, typeof color === "object" ? color : material(color));
  item.position.set(...position); group.add(item); return item;
}
function ball(group, color, position, scale) {
  const item = solid(group, new T.SphereGeometry(1, 24, 16), color, position);
  item.scale.set(...scale); return item;
}
function pipe(group, points, radius, color) {
  return solid(group, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => v(...p))), 32, radius, 12, false), color);
}
function box(group, color, size, position) { return solid(group, new T.BoxGeometry(...size), color, position); }
function shadow(group, width, depth, y = -.08) {
  const item = solid(group, new T.CircleGeometry(1, 64), new T.MeshBasicMaterial({ color: 0x53614e, transparent: true, opacity: .13 }), [0, y, 0]);
  item.rotation.x = -Math.PI / 2; item.scale.set(width, depth, 1);
}
function view(visual, group, points, extra = {}) {
  const pins = visual.parts.filter(part => points[part.id]).map(part => {
    const point = points[part.id];
    return { label: learningModels[visual.model].parts[part.id].label, info: part.detail,
      at: () => group.localToWorld(point.at().clone()), side: point.side ?? "right", lift: point.lift ?? 0,
      ...(point.go === undefined ? {} : { go: point.go }) };
  });
  group.traverse(item => {
    if (item.userData.part) item.userData.pin = visual.parts.filter(part => points[part.id]).findIndex(part => part.id === item.userData.part);
  });
  return { name: learningModels[visual.model].label, parent: -1, group, pins, target: v(0, 1.6, 0),
    distance: 8.5, angle: .2, pitch: .15, mobileFit: 1.2, detail: visual.parts[0].detail, ...extra };
}
function tag(item, id) { item.userData.part = id; return item; }

function lung(parent, side) {
  const group = new T.Group(); parent.add(group);
  const shape = new T.Shape();
  shape.moveTo(.2, .15); shape.bezierCurveTo(1.12, -.08, 1.53, .13, 1.47, .66);
  shape.bezierCurveTo(1.42, 1.59, .93, 2.49, .58, 2.58);
  shape.bezierCurveTo(.21, 2.65, .18, 1.83, .12, 1.27);
  shape.bezierCurveTo(.05, .65, .12, .33, .2, .15);
  const body = solid(group, new T.ExtrudeGeometry(shape, { depth: .48, bevelEnabled: true, bevelSize: .13, bevelThickness: .15, bevelSegments: 5, steps: 1, curveSegments: 24 }), 0xd88c86, [0, .38, -.24]);
  body.scale.x = side;
  // Fissures distinguish the three right lobes and two left lobes.
  pipe(group, [[side * .28, 2.25, .39], [side * .8, 1.52, .4], [side * 1.36, .99, .39]], .022, 0x985f60);
  if (side < 0) pipe(group, [[-.28, 1.66, .4], [-.8, 1.62, .41], [-1.25, 1.49, .4]], .018, 0x985f60);
  return tag(group, "lungs");
}

function respiratory(visual) {
  const group = new T.Group(), airway = new T.Group(); group.add(airway);
  const right = lung(group, -1), left = lung(group, 1);
  tag(pipe(airway, [[0, 4.1, 0], [0, 3.3, 0], [0, 2.48, .02]], .16, 0xd6b9a3), "trachea");
  for (let i = 0; i < 12; i++) {
    const ring = solid(airway, new T.TorusGeometry(.166, .035, 8, 28, Math.PI * 1.65), 0xf0d7bd, [0, 2.66 + i * .115, 0]);
    ring.rotation.x = Math.PI / 2; ring.rotation.z = -.32; tag(ring, "trachea");
  }
  for (const side of [-1, 1]) {
    tag(pipe(airway, [[0, 2.55, .16], [side * .35, 2.31, .53], [side * .78, 1.95, .55]], .105, 0xe4c0a0), "bronchi");
    for (let i = 0; i < 4; i++) {
      tag(pipe(airway, [[side * .51, 2.16, .55], [side * (.77 + i * .1), 2.3 - i * .4, .55], [side * (1 + i * .08), 2.51 - i * .51, .55]], .038, 0xe7c5ac), "bronchi");
    }
  }
  const diaphragm = tag(ball(group, 0xb96567, [0, .32, 0], [1.66, .28, .74]), "diaphragm");
  shadow(group, 1.95, .9);
  let spread = 0;
  const overview = view(visual, group, {
    trachea: { at: () => v(0, 3.55 + spread * .6, .19), side: "left" },
    bronchi: { at: () => v(-.48, 2.26 + spread * .6, .55), side: "left" },
    lungs: { at: () => v(1.1 + spread * .65, 1.5, .5) },
    diaphragm: { at: () => v(.8, .32 - spread * .35, .35) },
    alveoli: { at: () => v(-1.13 - spread * .65, 1.1, .5), side: "left", go: 1 },
  }, { target: v(0, 2, 0), distance: 8.7, slider: "Pisahkan organ", setSpread(value) {
    spread = value; right.position.x = -value * .65; left.position.x = value * .65;
    airway.position.y = value * .6; diaphragm.position.y = .32 - value * .35;
  } });
  if (!visual.parts.some(part => part.id === "alveoli")) return [overview];
  const detail = new T.Group();
  tag(pipe(detail, [[0, 3.7, 0], [0, 2.9, 0], [0, 2.4, 0]], .16, 0xe2bea3), "alveoli");
  for (let branch = 0; branch < 3; branch++) {
    const x = (branch - 1) * .75, y = 1.8 + (branch % 2) * .4;
    tag(pipe(detail, [[0, 2.8, 0], [x * .6, 2.3, 0], [x, y, 0]], .095, 0xe2bea3), "alveoli");
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399;
      tag(ball(detail, 0xe7a6a0, [x + Math.cos(a) * .36, y + Math.sin(a) * .35, Math.sin(i * 1.7) * .3], [.3, .29, .3]), "alveoli");
    }
    pipe(detail, [[x - .52, y - .4, .12], [x - .46, y + .4, .34], [x + .37, y + .48, .3], [x + .5, y - .2, .18]], .033, 0xb45253);
    pipe(detail, [[x - .46, y - .42, .16], [x + .3, y - .48, .32], [x + .51, y + .2, .3]], .03, 0x668aab);
  }
  const alveoli = visual.parts.find(part => part.id === "alveoli");
  const closeup = view(visual, detail, { alveoli: { at: () => v(.75, 2, .55) } },
    { name: "Alveolus", parent: 0, distance: 7.1, target: v(0, 2.35, 0), detail: alveoli.detail });
  return [overview, closeup];
}

function angklung(visual) {
  const group = new T.Group(), tubes = new T.Group(); group.add(tubes);
  const bamboo = 0xc9ac62, dark = 0x856b3b;
  box(group, dark, [2.6, .14, .4], [0, .2, 0]);
  for (const x of [-1.15, 1.15]) {
    tag(solid(group, new T.CylinderGeometry(.075, .085, 3.5, 20), bamboo, [x, 1.95, 0]), "frame");
    for (const y of [.65, 3.1]) tag(pipe(group, [[x - .12, y, .07], [x, y + .05, .1], [x + .12, y, .07]], .018, dark), "frame");
  }
  tag(box(group, dark, [2.5, .12, .12], [0, 3.35, 0]), "frame");
  for (const [index, x] of [-.55, .5].entries()) {
    const height = 2.1 - index * .52, radius = .21 - index * .025;
    tag(solid(tubes, new T.CylinderGeometry(radius, radius, height * .65, 40, 1, true), material(bamboo, { side: T.DoubleSide }), [x, .55 + height * .325, 0]), "bamboo");
    // The cut upper tongue distinguishes a tuned angklung tube from an uncut bamboo cylinder.
    tag(solid(tubes, new T.CylinderGeometry(radius, radius, height * .35, 24, 1, true, Math.PI / 2, Math.PI), material(bamboo, { side: T.DoubleSide }), [x, .55 + height * .825, 0]), "bamboo");
    tag(solid(tubes, new T.TorusGeometry(radius, .022, 8, 40), dark, [x, .55, 0]), "bamboo").rotation.x = Math.PI / 2;
    tag(solid(tubes, new T.TorusGeometry(radius, .022, 8, 24, Math.PI), dark, [x, .55 + height, 0]), "bamboo").rotation.x = Math.PI / 2;
    for (const y of [.8, 1.3]) {
      const ring = solid(tubes, new T.TorusGeometry(radius + .004, .012, 6, 40), dark, [x, y, 0]); ring.rotation.x = Math.PI / 2;
    }
    box(tubes, bamboo, [.18, .18, .55], [x, .38, .05]);
    pipe(group, [[x, .55 + height, 0], [x, 3.34, 0]], .017, dark);
  }
  shadow(group, 1.65, .6);
  return [view(visual, group, {
    bamboo: { at: () => tubes.localToWorld(v(-.55, 1.6, .21)), side: "left" },
    frame: { at: () => v(1.15, 2.9, .06) },
    shake: { at: () => tubes.localToWorld(v(0, .4, .2)), side: "left" },
    sound: { at: () => tubes.localToWorld(v(.5, 2.13, .2)) },
  }, { distance: 7.6, target: v(0, 1.9, 0), slider: "Pisahkan tabung", setSpread(value) { tubes.position.z = value * 1.15; } })];
}

function circuit(visual, closed) {
  const group = new T.Group();
  box(group, 0xcbb48b, [3.8, .14, 2.7], [0, 0, 0]); shadow(group, 2.4, 1.8, -.15);
  const battery = new T.Group(); group.add(battery);
  const cell = tag(solid(battery, new T.CylinderGeometry(.24, .24, 1.35, 32), 0x527885, [-1.1, .32, 0]), "battery"); cell.rotation.x = Math.PI / 2;
  for (const z of [-.72, .72]) tag(solid(battery, new T.SphereGeometry(.16, 16, 8), 0xd9bc71, [-1.1, .32, z]), "battery").scale.set(1, 1, .35);
  const lamp = new T.Group(); group.add(lamp);
  tag(solid(lamp, new T.CylinderGeometry(.29, .38, .2, 32), 0xd5cbb6, [1, .19, 0]), "bulb");
  tag(solid(lamp, new T.CylinderGeometry(.16, .16, .25, 32), 0x8b8e83, [1, .38, 0]), "bulb");
  tag(ball(lamp, material(closed ? 0xffda76 : 0xd5dfd9, { transparent: true, opacity: .85, emissive: closed ? 0xf3ac31 : 0, emissiveIntensity: .55 }), [1, .75, 0], [.31, .39, .31]), "bulb");
  const lever = tag(box(group, 0xb77957, [.65, .12, .2], [0, .22, -.9]), "switch");
  lever.rotation.z = closed ? 0 : .55;
  for (const x of [-.35, .35]) solid(group, new T.CylinderGeometry(.07, .07, .16, 16), 0xc0a45c, [x, .18, -.9]);
  tag(pipe(group, [[-1.1, .32, -.72], [-1.1, .13, -.9], [-.35, .13, -.9]], .035, 0xb8594d), "wire");
  tag(pipe(group, [[.35, .13, -.9], [1, .13, -.9], [1, .25, -.2]], .035, 0xb8594d), "wire");
  tag(pipe(group, [[1, .25, .2], [1, .13, .9], [-1.1, .13, .9], [-1.1, .32, .72]], .035, 0x4b7185), "wire");
  let spread = 0;
  return view(visual, group, {
    battery: { at: () => v(-1.1, .4 + spread * .7, .25), side: "left" },
    wire: { at: () => v(-.4, .14, .9), side: "left" },
    switch: { at: () => v(0, .26, -.9), go: closed ? 0 : 1 },
    bulb: { at: () => v(1, .8 + spread * .7, 0) },
  }, { name: closed ? "Sakelar tertutup" : "Sakelar terbuka", parent: closed ? 0 : -1,
    target: v(0, .3, 0), angle: .28, pitch: .65, distance: 7.9, slider: "Pisahkan komponen",
    setSpread(value) { spread = value; battery.position.y = value * .7; lamp.position.y = value * .7; } });
}

function deliberation(visual) {
  const group = new T.Group();
  const top = solid(group, new T.CylinderGeometry(1.15, 1.15, .12, 64), 0xbb986b, [0, 1.1, 0]);
  for (const x of [-.68, .68]) for (const z of [-.55, .55]) box(group, 0x81684b, [.09, 1, .09], [x, .55, z]);
  const colors = [0xb66d55, 0x628797, 0x72966c, 0xb99651];
  const ids = ["opinion", "listen", "agreement", "responsibility"];
  const points = {};
  ids.forEach((id, i) => {
    const angle = i * Math.PI / 2 + Math.PI / 4;
    const x = Math.cos(angle) * 1.65, z = Math.sin(angle) * 1.65;
    const person = tag(new T.Group(), id); person.position.set(x, 0, z); person.rotation.y = -angle + Math.PI / 2; group.add(person);
    box(person, 0x987a56, [.56, .08, .56], [0, .6, 0]); box(person, 0x987a56, [.56, .65, .08], [0, .9, -.3]);
    ball(person, 0xd8ae86, [0, 1.68, 0], [.2, .24, .2]);
    ball(person, 0x4b3c31, [0, 1.84, -.025], [.205, .1, .19]);
    box(person, colors[i], [.4, .55, .28], [0, 1.16, 0]);
    for (const side of [-1, 1]) {
      pipe(person, [[side * .22, 1.35, 0], [side * .32, 1.07, .14], [side * .2, 1.17, .45]], .065, colors[i]);
      box(person, 0x3e5961, [.13, .55, .14], [side * .13, .36, .1]);
    }
    points[id] = { at: () => v(x, 1.8, z), side: x < 0 ? "left" : "right", lift: i % 2 ? 22 : -22 };
  });
  // One shared sheet is the meeting's visible outcome, not four unrelated action cards.
  box(group, 0xfff4d6, [.48, .015, .64], [0, 1.18, 0]);
  for (let i = 0; i < 4; i++) box(group, 0x839081, [.32, .008, .012], [0, 1.19, -.2 + i * .1]);
  tag(top, "agreement"); shadow(group, 2.35, 2.35);
  return [view(visual, group, points, { distance: 9, target: v(0, .85, 0), angle: .3, pitch: .5 })];
}

export function learningScenes(visual) {
  switch (visual.model) {
    case "respiratory": return respiratory(visual);
    case "angklung": return angklung(visual);
    case "deliberation": return deliberation(visual);
    case "circuit": return [circuit(visual, false), circuit(visual, true)];
    default: throw new Error("Unknown learning model");
  }
}

export const sceneTools = { v, solid, ball, pipe, box, shadow, view, tag, material };
