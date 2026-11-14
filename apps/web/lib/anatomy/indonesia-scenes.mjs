import * as T from "three";
import { indonesiaCoast } from "./indonesia-coast.mjs";
import { sceneTools } from "./learning-scenes.mjs";
const { v, solid, box, view, tag } = sceneTools;
const anchors = { sumatra: [101, -.7], java: [110, -7.3], kalimantan: [114, -.6], sulawesi: [121, -2.5], papua: [137, -4.5] };
const projected = ([lng, lat]) => [(lng - 118) * .2, (lat + 2) * .2];
export function indonesiaScenes(visual) {
  const group = new T.Group();
  box(group, 0xb5ced1, [9.8, .045, 4.1], [0, -.06, 0]);
  const colors = [0x829d65, 0x9caa76, 0x78946e, 0x9ca46b, 0x6c8c67];
  const materials = colors.map(color => new T.MeshStandardMaterial({ color, roughness: .85 }));
  indonesiaCoast.forEach(ring => {
    const shape = new T.Shape();
    ring.forEach((coordinate, i) => { const [x, y] = projected(coordinate); if (i) shape.lineTo(x, y); else shape.moveTo(x, y); });
    const center = ring.reduce((p, c) => [p[0] + c[0] / ring.length, p[1] + c[1] / ring.length], [0, 0]);
    const nearest = Object.entries(anchors).sort(([, a], [, b]) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]))[0][0];
    const mesh = solid(group, new T.ExtrudeGeometry(shape, { depth: .075, bevelEnabled: false, curveSegments: 1 }), materials[Object.keys(anchors).indexOf(nearest)]);
    mesh.rotation.x = -Math.PI / 2; tag(mesh, nearest);
  });
  const points = Object.fromEntries(Object.entries(anchors).map(([id, coordinate]) => {
    const [x, y] = projected(coordinate);
    return [id, { at: () => v(x, .08, -y), side: x < 0 ? "left" : "right", lift: id === "java" ? 35 : -15 }];
  }));
  return [view(visual, group, points, { target: v(0, 0, 0), distance: 14.3, angle: 0, pitch: 1.35, mobileFit: 1.05 })];
}
