import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialVisual } from "../apps/web/server/materials/visual.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";

test("visual generation keeps Earth and flow outputs private, validated, and reusable", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const materials = createMaterialService(storage.db);
    const earth = await materials.create(owner.id, {
      title: "Lapisan Bumi", text: "Kerak berada di permukaan. Mantel berada di bawah kerak.",
    }, randomUUID());
    const flow = await materials.create(owner.id, {
      title: "Pertumbuhan", text: "Benih berkecambah, lalu tunas tumbuh.",
    }, randomUUID());
    const earthContent = {
      kind: "earth", title: "Lapisan Bumi", details: {
        crust: "Kerak berada di permukaan.", mantle: "Mantel ada di bawah kerak.", outer_core: null, inner_core: null,
      },
    };
    const flowContent = {
      kind: "flow", title: "Pertumbuhan",
      steps: [{ label: "Benih", detail: "Benih berkecambah." }, { label: "Tunas", detail: "Tunas tumbuh." }],
    };
    const started = Promise.withResolvers(), finish = Promise.withResolvers();
    let calls = 0;
    const visual = createMaterialVisual(storage.db, async (feature, { messages }) => {
      assert.equal(feature, "mindmap");
      calls++;
      if (JSON.parse(messages[1].content).title === "Pertumbuhan") return { content: flowContent };
      if (calls === 1) return { content: { ...earthContent, details: {} } };
      started.resolve();
      return finish.promise;
    });
    assert.equal(await visual.get(owner.id, earth.id), null);
    await assert.rejects(visual.get(other.id, earth.id), { status: 404 });
    await assert.rejects(visual.generate(other.id, earth.id), { status: 404 });
    await assert.rejects(visual.generate(owner.id, earth.id), { code: "INVALID_VISUAL" });
    const pending = visual.generate(owner.id, earth.id);
    try {
      await Promise.race([started.promise, pending]);
      await assert.rejects(visual.generate(owner.id, earth.id), { code: "VISUAL_IN_PROGRESS" });
    } finally { finish.resolve({ content: earthContent }); }
    assert.deepEqual(await pending, earthContent);
    assert.deepEqual(await visual.get(owner.id, earth.id), earthContent);
    assert.deepEqual(await visual.generate(owner.id, earth.id), earthContent);
    assert.deepEqual(await visual.generate(owner.id, flow.id), flowContent);
    assert.equal(calls, 3);
  } finally { await storage.close(); }
});
