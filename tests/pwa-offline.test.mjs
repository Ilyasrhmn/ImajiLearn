import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import manifest from "../apps/pwa/app/manifest.js";
import { currentTerm, nextLesson } from "../apps/pwa/lib/schedule.mjs";

test("manifest confines the installed app to /app with existing-brand PNG icons", () => {
  const value = manifest(); assert.equal(value.scope, "/app/"); assert.equal(value.start_url, "/app/beranda");
  assert.equal(value.display, "standalone"); assert.deepEqual(value.icons.map(icon => icon.sizes), ["192x192", "512x512"]);
});
test("offline worker never caches authenticated pages, API reads or writes", async () => {
  const listeners = {}, cached = [], fallback = new Response("offline");
  const self = { location: { origin: "https://school.example" }, addEventListener: (name, callback) => { listeners[name] = callback; } };
  const caches = { open: async () => ({ add: async url => cached.push(url), match: async () => fallback }), keys: async () => [] };
  vm.runInNewContext(await readFile(new URL("../apps/pwa/public/sw.js", import.meta.url), "utf8"), { self, caches, URL, fetch: async () => { throw new Error("offline"); } });
  await new Promise((resolve, reject) => listeners.install({ waitUntil: promise => promise.then(resolve, reject) }));
  assert.deepEqual(cached, ["/app/offline.html"]);
  for (const [path, mode, method] of [["/api/v1/me", "cors", "GET"], ["/api/v1/materials", "cors", "POST"], ["/dashboard", "navigate", "GET"], ["/app/_next/static/test.js", "cors", "GET"]]) {
    listeners.fetch({ request: { url: `https://school.example${path}`, mode, method }, respondWith: () => assert.fail("Must bypass this request") });
  }
  let response;
  listeners.fetch({ request: { url: "https://school.example/app/materi", mode: "navigate", method: "GET" }, respondWith: promise => { response = promise; } });
  assert.equal(await response, fallback); assert.deepEqual(cached, ["/app/offline.html"]);
});
test("agenda uses the current school term and excludes completed lessons", () => {
  assert.deepEqual(currentTerm(new Date(2026, 0, 10)), { year: 2025, semester: "2" });
  assert.deepEqual(currentTerm(new Date(2026, 6, 10)), { year: 2026, semester: "1" });
  const entries = [{ day: 1, start: "07:00", end: "08:00" }, { day: 2, start: "09:00", end: "10:00" }];
  assert.equal(nextLesson(entries, new Date(2026, 10, 9, 8, 0)), entries[1]);
  assert.equal(nextLesson(entries, new Date(2026, 10, 15)), null);
});
