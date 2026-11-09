import test from "node:test";
import assert from "node:assert/strict";

const contracts = () => import("../packages/contracts/media-preferences.mjs");

test("B1 accepts clearing all media and preserves the selected song", async () => {
  const { parseMediaPreference } = await contracts();
  assert.deepEqual(parseMediaPreference({ selectedMedia: [], songTemplateId: "cicak_dinding" }), {
    selectedMedia: [], songTemplateId: "cicak_dinding",
  });
  assert.equal(parseMediaPreference({ selectedMedia: ["reading"] }).songTemplateId, "balonku");
});

test("B1 accepts precisely the four media and three song templates", async () => {
  const { parseMediaPreference } = await contracts();
  for (const songTemplateId of ["balonku", "cicak_dinding", "potong_bebek"]) {
    assert.deepEqual(parseMediaPreference({ selectedMedia: ["song", "slides", "reading", "mindmap"], songTemplateId }), {
      selectedMedia: ["reading", "mindmap", "slides", "song"], songTemplateId,
    });
  }
});

test("B1 rejects duplicates, unknown fields, wrong types and invalid songs", async () => {
  const { parseMediaPreference } = await contracts();
  for (const body of [null, [], {}, { selectedMedia: "reading" }, { selectedMedia: ["reading", "reading"] },
    { selectedMedia: ["video"] }, { selectedMedia: [null] }, { selectedMedia: [], songTemplateId: "" },
    { selectedMedia: [], songTemplateId: null }, { selectedMedia: [], userId: "foreign" },
    { selectedMedia: ["reading", "mindmap", "slides", "song", "song"] }]) {
    assert.throws(() => parseMediaPreference(body), { status: 422 });
  }
});

test("batch accepts 100 opaque ids, rejects empty, duplicate and 101 ids", async () => {
  const { parseMaterialIds } = await contracts();
  const ids = Array.from({ length: 100 }, (_, i) => `material-${i}`);
  assert.deepEqual(parseMaterialIds(ids.join(",")), ids);
  for (const value of [null, "", "a,", "a,a", "a".repeat(101), [...ids, "overflow"].join(",")]) {
    assert.throws(() => parseMaterialIds(value), { status: 422 });
  }
});
