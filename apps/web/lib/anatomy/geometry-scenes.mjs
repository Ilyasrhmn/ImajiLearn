import * as T from "three";
import { geometryCatalog, geometryEdges } from "../geometry-catalog.mjs";

const vector = point => new T.Vector3(...point);
const material = color => new T.MeshStandardMaterial({ color, roughness: .65, side: T.DoubleSide });
const colors = [0x83a876, 0xe3b56f, 0x7fa9ac, 0xc78365, 0xacc280, 0x88a4bf];

function line(parent, points, color = 0x37564c) {
  const object = new T.Line(new T.BufferGeometry().setFromPoints(points.map(vector)), new T.LineBasicMaterial({ color }));
  parent.add(object);
}

export function geometryObject(shape) {
  const spec = geometryCatalog[shape];
  const group = new T.Group();
  const motions = [];
  if (spec.vertices) {
    const faces = spec.faces ?? [spec.vertices.map((_, i) => i)];
    for (const [index, face] of faces.entries()) {
      const faceGroup = new T.Group();
      const points = face.map(i => vector(spec.vertices[i]));
      const center = points.reduce((sum, p) => sum.add(p), new T.Vector3()).divideScalar(points.length);
      const positions = [];
      for (let i = 1; i < points.length - 1; i++) for (const p of [points[0], points[i], points[i+1]]) positions.push(p.x, p.y, p.z);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const faceMesh = new T.Mesh(geometry, material(colors[index % colors.length]));
      faceMesh.userData.pin = 0;
      faceGroup.add(faceMesh);
      line(faceGroup, [...points, points[0]].map(p => p.toArray()));
      group.add(faceGroup);
      motions.push({ group: faceGroup, direction: center.normalize() });
    }
    for (const point of spec.vertices) {
      const dot = new T.Mesh(new T.SphereGeometry(.044, 12, 8), material(0xb44c33));
      dot.position.copy(vector(point));
      dot.userData.pin = spec.solid ? 2 : 1;
      group.add(dot);
      motions.push({ group: dot, direction: vector(point).normalize(), vertex: true });
    }
  } else {
    const geometry = shape === "circle" ? new T.CircleGeometry(1.25, 64)
      : shape === "sphere" ? new T.SphereGeometry(1.2, 48, 32)
      : new T.CylinderGeometry(shape === "cone" ? 0 : 1, 1, 2.2, 64, 1, true);
    const surface = new T.Mesh(geometry, material(colors[0]));
    surface.userData.pin = 0;
    group.add(surface);
    if (shape === "circle" || shape === "sphere") {
      const rim = Array.from({ length: 65 }, (_, i) => [1.25 * Math.cos(i * Math.PI / 32), 1.25 * Math.sin(i * Math.PI / 32), .006]);
      if (shape === "circle") line(group, rim);
    } else {
      for (const y of shape === "cone" ? [-1.1] : [-1.1, 1.1]) {
        const lid = new T.Group();
        const disk = new T.Mesh(new T.CircleGeometry(1, 64), material(colors[1]));
        disk.rotation.x = -Math.PI / 2;
        lid.position.y = y;
        lid.add(disk);
        disk.userData.pin = 1;
        group.add(lid);
        line(lid, Array.from({ length: 65 }, (_, i) => [Math.cos(i * Math.PI / 32), .005, Math.sin(i * Math.PI / 32)]));
        motions.push({ group: lid, origin: lid.position.clone(), direction: new T.Vector3(0, Math.sign(y), 0) });
      }
    }
  }
  return { group, setSpread(value) {
    for (const part of motions) {
      if (part.vertex) { part.group.visible = value < .03; continue; }
      part.group.position.copy(part.origin ?? new T.Vector3()).addScaledVector(part.direction, value * 1.05);
    }
  } };
}

function shapePins(shape) {
  const spec = geometryCatalog[shape];
  const vertices = spec.vertices;
  if (vertices) {
    const edges = geometryEdges(spec);
    if (!spec.solid) return [
      { label: "Sisi", info: `${spec.label} memiliki ${edges.length} sisi.`, point: vector(vertices[0]).add(vector(vertices[1])).multiplyScalar(.5) },
      { label: "Titik sudut", info: `${spec.label} memiliki ${vertices.length} titik sudut.`, point: vector(vertices[2]) },
    ];
    return [
      { label: "Sisi", info: `${spec.label} memiliki ${spec.faces.length} sisi datar.`, point: vector(vertices[spec.faces[0][0]]).multiplyScalar(.55) },
      { label: "Rusuk", info: `${spec.label} memiliki ${edges.length} rusuk, tempat dua sisi bertemu.`, point: vector(vertices[0]).add(vector(vertices[1])).multiplyScalar(.5) },
      { label: "Titik sudut", info: `${spec.label} memiliki ${vertices.length} titik sudut.`, point: vector(vertices[2]) },
    ];
  }
  if (shape === "circle") return [
    { label: "Pusat", info: "Titik pusat berjarak sama ke setiap titik pada keliling lingkaran.", point: new T.Vector3() },
    { label: "Keliling", info: "Batas lingkaran berbentuk lengkung, tanpa titik sudut.", point: new T.Vector3(1.25, 0, 0) },
  ];
  if (shape === "sphere") return [{ label: "Permukaan", info: "Bola memiliki satu sisi lengkung, tanpa rusuk dan tanpa titik sudut.", point: new T.Vector3(.5,.4,.95) }];
  return [
    { label: "Selimut", info: shape === "cone" ? "Selimut kerucut melengkung dari alas menuju puncak." : "Selimut tabung menghubungkan alas dan tutup berbentuk lingkaran.", point: new T.Vector3(1,0,0) },
    { label: "Alas", info: `${spec.label} memiliki alas berbentuk lingkaran.`, point: new T.Vector3(.4,-1.1,.4) },
    ...(shape === "cone" ? [{ label: "Puncak", info: "Kerucut memiliki satu titik puncak.", point: new T.Vector3(0,1.1,0) }]
      : [{ label: "Tutup", info: "Alas dan tutup tabung berbentuk lingkaran yang sama besar.", point: new T.Vector3(.3,1.1,.3) }]),
  ];
}

export function geometryScenes(visual) {
  const multiple = visual.shapes.length > 1;
  const scenes = visual.shapes.map(({ shape, detail }) => {
    const { group, setSpread } = geometryObject(shape);
    const spec = geometryCatalog[shape];
    return { name: spec.label, parent: multiple ? 0 : -1, group, target: new T.Vector3(), distance: 8,
      angle: spec.solid ? .5 : 0, pitch: spec.solid ? .36 : 0, detail,
      ...(spec.solid && shape !== "sphere" ? { slider: "Pisahkan sisi", setSpread } : {}),
      pins: shapePins(shape).map(({ label, info, point }, i) => ({ label, info, at: () => point.clone(), side: i % 2 ? "right" : "left", lift: i * 18 - 20 })),
    };
  });
  if (!multiple) return scenes;
  const group = new T.Group();
  const columns = Math.min(4, visual.shapes.length);
  const rows = Math.ceil(visual.shapes.length / columns);
  const pins = visual.shapes.map(({ shape }, index) => {
    const miniature = geometryObject(shape).group;
    miniature.scale.setScalar(.43);
    const row = Math.floor(index / columns);
    const x = (index % columns - (columns - 1) / 2) * 2.1;
    const y = ((rows - 1) / 2 - row) * 2.1;
    miniature.position.set(x, y, 0);
    miniature.rotation.set(.15, .35, 0);
    miniature.traverse(object => { object.userData.pin = index; });
    group.add(miniature);
    return { label: geometryCatalog[shape].label, go: index + 1, at: () => new T.Vector3(x,y,0),
      side: index % columns < columns / 2 ? "left" : "right", lift: row * 4 };
  });
  return [{ name: "Bangun", group, target: new T.Vector3(), distance: Math.max(5, columns * 1.8, rows * 2.7), mobileFit: 1.2, angle: 0, pitch: 0,
    detail: visual.title, pins }, ...scenes];
}
