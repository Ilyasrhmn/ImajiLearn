import test from "node:test";
import assert from "node:assert/strict";
import { generateLkpd } from "@imajilearn/shared/lib/lkpd-service.mjs";

test("LKPD provider errors are actionable and cancellation remains cancellation", async () => {
  const options = { endpoint: "https://provider.example.test/worksheets", transport: async () => { throw new TypeError("Failed to fetch"); } };
  await assert.rejects(generateLkpd({ templateId: "fold" }, options), /belum dapat dihubungi/);
  const controller = new AbortController();
  const transport = async () => { controller.abort(); throw new TypeError("Network"); };
  await assert.rejects(generateLkpd({ templateId: "fold" }, { ...options, signal: controller.signal, transport }), error => error.name === "AbortError");
  await assert.rejects(generateLkpd({}, { endpoint: "" }), /belum tersedia/);
});

test("LKPD provider output must match the chosen pattern before it reaches the editor", async () => {
  const valid = { templateId: "fold", title: "Tumbuhan", instructions: ["Buka kartu."],
    items: Array.from({ length: 4 }, (_, index) => ({ id: `card-${index}`, front: "Akar", back: "Menyerap air", assetId: null })),
    pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" } };
  const endpoint = "https://provider.example.test/worksheets";
  assert.deepEqual(await generateLkpd({ templateId: "fold" }, { endpoint, transport: async () => Response.json(valid) }), valid);
  await assert.rejects(generateLkpd({ templateId: "cube" }, { endpoint, transport: async () => Response.json(valid) }), /belum sesuai/);
});
