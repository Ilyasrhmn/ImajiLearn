import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import * as T from "three";
import { learningModels } from "../apps/web/lib/learning-models.mjs";
import { resolveVisualModel } from "../apps/web/lib/visual-templates.mjs";
import { learningScenes } from "../apps/web/lib/anatomy/learning-scenes.mjs";
import { foodChainScenes } from "../apps/web/lib/anatomy/food-chain-scenes.mjs";
import { indonesiaScenes } from "../apps/web/lib/anatomy/indonesia-scenes.mjs";
import { createMaterialVisual } from "../apps/web/server/materials/visual.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";

const examples = {
  food_chain: ["Rantai makanan", ["Rumput adalah produsen.", "Kelinci memakan rumput.", "Ular memakan kelinci.", "Elang memangsa ular."]],
  indonesia: ["Peta Indonesia", ["Sumatra berada di Indonesia bagian barat.", "Jawa memiliki berbagai kegiatan ekonomi.", "Kalimantan memiliki hutan.", "Sulawesi memiliki empat semenanjung.", "Papua berada di Indonesia bagian timur."]],
  respiratory: ["Sistem pernapasan", ["Trakea menyalurkan udara menuju bronkus.", "Bronkus bercabang di paru-paru.", "Paru-paru merupakan organ pernapasan.", "Alveolus menjadi tempat pertukaran gas.", "Diafragma membantu gerakan pernapasan."]],
  deliberation: ["Musyawarah kelas", ["Setiap peserta boleh menyampaikan pendapat.", "Peserta mendengarkan pendapat orang lain.", "Keputusan bersama diambil melalui mufakat.", "Semua peserta melaksanakan keputusan."]],
  angklung: ["Angklung", ["Angklung dibuat dari tabung bambu.", "Tabung bambu dipasang pada rangka.", "Angklung dimainkan dengan digoyangkan.", "Getaran menghasilkan bunyi."]],
  circuit: ["Rangkaian listrik", ["Baterai menjadi sumber energi listrik.", "Kabel menghubungkan komponen rangkaian.", "Sakelar membuka dan menutup rangkaian.", "Lampu menyala pada rangkaian tertutup."]],
};

for (const [model, [title, evidence]] of Object.entries(examples)) {
  const content = { kind: "learning_model", title, model, parts: Object.keys(learningModels[model].parts).map((id, i) => ({ id, detail: evidence[i], evidence: evidence[i] })) };
  if (model === "food_chain") content.links = [{ from: "grass", to: "rabbit", evidence: evidence[1] }, { from: "rabbit", to: "snake", evidence: evidence[2] }, { from: "snake", to: "eagle", evidence: evidence[3] }];
  test(`${model}: owned source, exact evidence, cache, rejection and usable scenes`, async () => {
    const storage = await testDatabase();
    try {
      for (const migration of storage.migrations) await storage.migrate(migration);
      const owner = await storage.db.teacher.create({ data: { name: "Teacher", email: `${model}@example.test` } });
      const other = await storage.db.teacher.create({ data: { name: "Other", email: `${model}-other@example.test` } });
      const source = await createMaterialService(storage.db).create(owner.id, { title, text: evidence.join(" ") }, randomUUID());
      const service = createMaterialVisual(storage.db, async () => ({ content }));
      await assert.rejects(service.generate(other.id, source.id), { status: 404 });
      const result = await service.generate(owner.id, source.id);
      assert.equal(result.model, model);
      assert.deepEqual(await service.get(owner.id, source.id), result);
      assert.equal(resolveVisualModel(content, { title: "Puisi", text: "Ini materi puisi, bukan materi model." }), null);
      assert.equal(resolveVisualModel({ ...content, parts: content.parts.map(p => ({ ...p, evidence: "Kutipan palsu" })) }, source), null);
      if (model === "food_chain") {
        assert.equal(resolveVisualModel({ ...content, links: content.links.map(link => ({ ...link, from: link.to, to: link.from })) }, source), null);
        assert.equal(resolveVisualModel({ ...content, links: content.links.slice(1) }, source), null);
      }
      const views = model === "food_chain" ? foodChainScenes(result) : model === "indonesia" ? indonesiaScenes(result) : learningScenes(result);
      for (const scene of views) {
        for (const spread of [0, .5, 1]) {
          scene.setSpread?.(spread); scene.group.updateMatrixWorld(true);
          const size = new T.Box3().setFromObject(scene.group).getSize(new T.Vector3());
          assert.ok(size.toArray().every(n => Number.isFinite(n) && n > 0 && n < 12));
          assert.ok(scene.pins.length > 0);
          for (const pin of scene.pins) {
            assert.ok(pin.info && pin.at().toArray().every(Number.isFinite));
            if (pin.go !== undefined) assert.ok(views[pin.go]);
          }
        }
        scene.group.traverse(item => { item.geometry?.dispose(); if (item.material) item.material.dispose(); });
      }
    } finally { await storage.close(); }
  });
}
