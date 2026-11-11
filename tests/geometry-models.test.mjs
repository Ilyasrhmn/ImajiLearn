import assert from "node:assert/strict";
import { test } from "node:test";
import { geometryCatalog, geometryEdges } from "../apps/web/lib/geometry-catalog.mjs";
import { geometryScenes } from "../apps/web/lib/anatomy/geometry-scenes.mjs";
import { resolveVisualModel } from "../apps/web/lib/visual-templates.mjs";

test("geometry models have correct topology and usable scenes for every supported shape", () => {
  for (const [shape, spec] of Object.entries(geometryCatalog)) {
    const visual = { kind: "geometry", title: spec.label, shapes: [{ shape, detail: "Materi " + spec.label, evidence: spec.label }] };
    assert.ok(resolveVisualModel(visual), shape);
    const [scene] = geometryScenes(visual);
    assert.ok(scene.group.children.length, shape);
    assert.ok(scene.pins.length, shape);
    scene.setSpread?.(0);
    scene.setSpread?.(1);
    for (const pin of scene.pins) assert.ok(pin.at().toArray().every(Number.isFinite));
    scene.group.traverse(object => {
      for (const n of object.geometry?.attributes.position?.array ?? []) assert.ok(Number.isFinite(n), shape);
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }
  for (const [shape, faces, edges, vertices] of [["cube",6,12,8],["cuboid",6,12,8],["triangular_prism",5,9,6],["square_pyramid",5,8,5]]) {
    const spec = geometryCatalog[shape];
    assert.equal(spec.faces.length, faces);
    assert.equal(geometryEdges(spec).length, edges);
    assert.equal(spec.vertices.length, vertices);
    assert.equal(vertices - edges + faces, 2);
  }
});

test("geometry read contract rejects missing, unsupported and duplicate shapes", () => {
  const item = { shape: "cube", evidence: "Kubus", detail: "Enam sisi persegi." };
  const visual = { kind: "geometry", title: "Bangun ruang", shapes: [item] };
  assert.ok(resolveVisualModel(visual));
  for (const shapes of [[], [item, item], [{ ...item, shape: "invented" }], [{ ...item, evidence: "Lingkaran" }]]) {
    assert.equal(resolveVisualModel({ ...visual, shapes }), null);
  }
  const views = geometryScenes({ ...visual, shapes: [item, { shape: "sphere", evidence: "Bola", detail: "Sisi lengkung." }] });
  assert.deepEqual(views[0].pins.map(pin => pin.go), [1,2]);
  assert.deepEqual(views.slice(1).map(view => view.parent), [0,0]);
});
