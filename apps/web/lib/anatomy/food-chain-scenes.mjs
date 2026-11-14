import * as T from "three";
import { sceneTools } from "./learning-scenes.mjs";
const { v, solid, ball, pipe, box, shadow, view, tag } = sceneTools;

function organism(group, id, x) {
  const root = tag(new T.Group(), id); root.position.x = x; group.add(root);
  const soil = solid(root, new T.CylinderGeometry(.7, .74, .11, 32), 0x9c865f, [0, .02, 0]);
  if (id === "grass") {
    for (let i = 0; i < 13; i++) {
      const a = i * 2.399, r = (i % 3) * .15;
      const stem = new T.Shape(); stem.moveTo(-.045, 0); stem.quadraticCurveTo(-.3, .6, -.12, 1.05 + (i % 4) * .1); stem.quadraticCurveTo(.15, .5, .045, 0);
      const blade = solid(root, new T.ExtrudeGeometry(stem, { depth: .015, bevelEnabled: false, curveSegments: 8 }), i % 2 ? 0x6d924c : 0x91ab60, [Math.cos(a) * r, .08, Math.sin(a) * r]); blade.rotation.y = a;
    }
  } else if (id === "rabbit") {
    ball(root, 0xd5c6aa, [0, .55, 0], [.47, .4, .29]);
    ball(root, 0xd5c6aa, [.3, .91, .03], [.27, .27, .24]);
    for (const z of [-.09, .1]) {
      ball(root, 0xd5c6aa, [.29, 1.3, z], [.08, .4, .09]);
      ball(root, 0xba8e83, [.34, 1.33, z + .025], [.035, .26, .05]);
      ball(root, 0x35413c, [.48, 1, z > 0 ? .21 : -.17], [.025, .035, .025]);
      ball(root, 0xc5b697, [-.12, .25, z * 2.4], [.28, .14, .12]);
      ball(root, 0xc5b697, [.37, .23, z * 1.7], [.18, .1, .09]);
    }
    ball(root, 0xece3cf, [-.46, .63, 0], [.15, .16, .16]);
    ball(root, 0xab7e70, [.55, .89, .06], [.045, .035, .04]);
  } else if (id === "snake") {
    pipe(root, [[-.48, .2, .28], [-.2, .22, -.36], [.32, .25, -.22], [.1, .29, .28], [-.14, .5, .2], [.2, .71, .14]], .11, 0x6d8751);
    ball(root, 0x7b965b, [.27, .73, .14], [.2, .13, .14]);
    for (const z of [.02, .25]) ball(root, 0x2c3d32, [.34, .79, z], [.025, .025, .025]);
    pipe(root, [[.43, .71, .14], [.55, .7, .14]], .012, 0xb26657);
  } else if (id === "eagle") {
    box(root, 0x87623f, [.85, .09, .16], [0, .26, 0]);
    ball(root, 0x806749, [0, .83, 0], [.27, .43, .23]);
    ball(root, 0xe1d8bd, [.12, 1.24, .02], [.22, .21, .2]);
    const beak = solid(root, new T.ConeGeometry(.1, .22, 16), 0xc69b47, [.36, 1.19, .02]); beak.rotation.z = -Math.PI / 2;
    for (const z of [-.16, .18]) {
      ball(root, 0x514c3d, [-.04, .85, z], [.23, .35, .08]);
      ball(root, 0x273933, [.23, 1.3, z], [.025, .025, .025]);
      pipe(root, [[-.04, .53, z], [.05, .3, z], [.2, .3, z]], .025, 0xc69b47);
    }
    ball(root, 0x514c3d, [-.2, .5, 0], [.15, .31, .1]).rotation.z = -.35;
  }
  soil.userData.part = id;
  return root;
}

export function foodChainScenes(visual) {
  const group = new T.Group(), ids = new Set(visual.parts.map(p => p.id));
  let id = [...ids].find(id => !visual.links.some(link => link.to === id));
  const order = [];
  while (id) { order.push(id); id = visual.links.find(link => link.from === id)?.to; }
  const points = {};
  order.forEach((id, i) => {
    const x = (i - (order.length - 1) / 2) * 1.85;
    organism(group, id, x);
    points[id] = { at: () => v(x, .8, .18), side: i < order.length / 2 ? "left" : "right", lift: i % 2 ? 24 : -24 };
    if (i < order.length - 1) {
      pipe(group, [[x + .62, .15, .52], [x + 1, .15, .52], [x + 1.24, .15, .52]], .024, 0x927a4c);
      const arrow = solid(group, new T.ConeGeometry(.09, .18, 12), 0x927a4c, [x + 1.23, .15, .52]); arrow.rotation.z = -Math.PI / 2;
    }
  });
  shadow(group, order.length * .95, .9);
  return [view(visual, group, points, { target: v(0, .65, 0), distance: Math.max(7, order.length * 2.9), angle: 0, pitch: .25, mobileFit: 1.15 })];
}
