import test from "node:test";
import assert from "node:assert/strict";
import { currentTerm, todayLessons, recordMaterialOpen, recentMaterials } from "../apps/web/lib/home-dashboard.mjs";

test("today's lessons respect the weekday and academic semester", () => {
  assert.deepEqual(currentTerm(new Date(2026, 0, 2)), { year: "2025", semester: "2" });
  assert.deepEqual(currentTerm(new Date(2026, 6, 2)), { year: "2026", semester: "1" });
  const slots = [{ id: "late", day: 3, start: "10:00" }, { id: "tomorrow", day: 4, start: "07:00" }, { id: "early", day: 3, start: "07:00" }];
  assert.deepEqual(todayLessons(slots, new Date(2026, 10, 11)).map(slot => slot.id), ["early", "late"]);
  assert.deepEqual(todayLessons(slots, new Date(2026, 10, 15)), []);
});

test("recent materials track actual opens, isolate accounts and omit deleted or archived material", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const items = [{ id: "a" }, { id: "b" }, { id: "archived", archived: true }];
  recordMaterialOpen("teacher-a", "a", storage);
  recordMaterialOpen("teacher-a", "b", storage);
  recordMaterialOpen("teacher-a", "a", storage);
  recordMaterialOpen("teacher-a", "archived", storage);
  recordMaterialOpen("teacher-a", "deleted", storage);
  assert.deepEqual(recentMaterials("teacher-a", items, storage).map(item => item.id), ["a", "b"]);
  assert.deepEqual(recentMaterials("teacher-b", items, storage), []);
  assert.ok([...values.values()].every(value => !value.includes("title")));
  for (let index = 0; index < 30; index++) recordMaterialOpen("teacher-a", `item-${index}`, storage);
  assert.equal(JSON.parse([...values.values()][0]).length, 20);
});

test("blocked or malformed browser storage never prevents opening a lesson", () => {
  const broken = { getItem() { throw new Error("Blocked"); }, setItem() { throw new Error("Full"); } };
  assert.doesNotThrow(() => recordMaterialOpen("teacher", "material", broken));
  assert.deepEqual(recentMaterials("teacher", [{ id: "material" }], broken), []);
  for (const value of ["bad json", "null", "{}", '[null,{}, {"id": 5}]']) {
    assert.deepEqual(recentMaterials("teacher", [], { getItem: () => value }), []);
  }
});
