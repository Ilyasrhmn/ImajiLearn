import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateImageProviders, selectImageBatch } from "../apps/web/server/materials/image-routing.mjs";

test("the thirteen Z-Image slots go to the highest-priority complex visuals, not the first slides", () => {
  const sections = Array.from({ length: 23 }, (_, index) => ({ index, complexity: "complex", priority: index }));
  const routes = allocateImageProviders(sections, 23);
  assert.equal(routes.filter(provider => provider === "z-image").length, 13);
  assert.ok(routes.slice(0, 10).every(provider => provider === "cloudflare"));
  assert.ok(routes.slice(10).every(provider => provider === "z-image"));
  assert.deepEqual(allocateImageProviders([{ index: 0, complexity: "simple", priority: 99 }], 1), ["cloudflare"]);
});

test("incomplete or duplicated routing plans cannot trigger image generation", () => {
  for (const sections of [[], [{ index: 0, complexity: "complex", priority: 3 }, { index: 0, complexity: "complex", priority: 5 }]]) {
    assert.throws(() => allocateImageProviders(sections, 2), { code: "INVALID_ILLUSTRATION_PLAN" });
  }
});

test("both providers start together with at most two images each", () => {
  const routes = [...Array(15).fill("z-image"), ...Array(8).fill("cloudflare")];
  assert.deepEqual(selectImageBatch(routes.map((_, index) => index), routes), [0, 1, 15, 16]);
});
