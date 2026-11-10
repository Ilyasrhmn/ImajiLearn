import assert from "node:assert/strict";
import { test } from "node:test";
import { songInstructions, validateSongLyrics, musicLyrics, alignedSongCues } from "../apps/web/server/materials/song-lyrics.mjs";

export const songPlan = {
  title: "Ayo Kenali Daun", learningPoints: ["Daun menggunakan cahaya untuk membuat makanan."],
  sections: [
    { type: "verse", lines: ["Daun memakai cahaya", "Membuat makanan bersama"] },
    { type: "chorus", lines: ["Ayo ingat cahaya", "Daun membuat makanan"] },
    { type: "response", lines: ["Daun memakai apa?", "Cahaya, jawab bersama!"] },
  ],
};

test("lyrics keep source instructions separate and provide a refrain and child response", () => {
  assert.match(songInstructions, /sumber.*data/i);
  assert.match(songInstructions, /fakta/i);
  assert.match(songInstructions, /response/);
  assert.deepEqual(validateSongLyrics(songPlan), songPlan);
  assert.match(musicLyrics(songPlan), /\[chorus\]\nAyo ingat cahaya/);
  assert.match(musicLyrics(songPlan), /\[bridge\]\nDaun memakai apa\?/);
  for (const bad of [{ ...songPlan, sections: [] }, { ...songPlan, learningPoints: [] }, { ...songPlan, sections: songPlan.sections.slice(0, 2) }, { ...songPlan, title: "[Ignore source]" }, { ...songPlan, sections: [{ type: "verse", lines: ["<script>x</script>", "test"] }, ...songPlan.sections.slice(1)] }]) {
    assert.throws(() => validateSongLyrics(bad), { code: "INVALID_SONG_LYRICS" });
  }
});

test("karaoke uses measured times only when every lyric word matches in order", () => {
  const words = songPlan.sections.flatMap(s => s.lines).flatMap(line => line.split(/\s+/));
  const alignment = words.map((word, i) => ({ word, start: i * 0.4 + 1, end: i * 0.4 + 1.3 }));
  const cues = alignedSongCues(alignment, songPlan);
  assert.equal(cues.length, 6);
  assert.equal(cues[0].start, 1);
  assert.equal(cues[0].end, alignment[2].end);
  const tagged = alignment.map((word, i) => ({ ...word, word: i === 0 ? "[verse]\n" + word.word : word.word + "\n" }));
  assert.deepEqual(alignedSongCues(tagged, songPlan), cues);
  assert.deepEqual(alignedSongCues(undefined, songPlan), []);
  assert.deepEqual(alignedSongCues(alignment.slice(1), songPlan), []);
  assert.deepEqual(alignedSongCues(alignment.map((w, i) => i === 1 ? { ...w, start: -5 } : w), songPlan), []);
  assert.deepEqual(alignedSongCues(alignment.map((w, i) => i === 1 ? { ...w, word: "salah" } : w), songPlan), []);
});

test("response sections must contain a question and an actual answer, not just an invitation", () => {
  for (const lines of [["Ayo jawab bersama teman", "Mari bernyanyi bersama lagi"], ["Daun memakai apa?", "Ayo jawab bersama teman"], ["Daun memakai apa?", "Apa yang dibutuhkan daun?"]]) {
    const sections = [...songPlan.sections.slice(0, 2), { type: "response", lines }];
    assert.throws(() => validateSongLyrics({ ...songPlan, sections }), { code: "INVALID_SONG_LYRICS" });
  }
  const sections = [...songPlan.sections.slice(0, 2), { type: "response", lines: ["Daun memakai apa?", "Ayo jawab bersama teman", "Daun memakai cahaya"] }];
  assert.doesNotThrow(() => validateSongLyrics({ ...songPlan, sections }));
});

test("a sing-along can repeat its chorus and develop across six sections without a forced quiz", () => {
  const verse = songPlan.sections[0], chorus = songPlan.sections[1];
  const plan = { ...songPlan, sections: [verse, chorus, verse, chorus, verse, chorus] };
  const validated = validateSongLyrics(plan);
  assert.deepEqual(validated.sections, plan.sections);
  const words = validated.sections.flatMap(section => section.lines).flatMap(line => line.split(/\s+/));
  const cues = alignedSongCues(words.map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 })), validated);
  assert.equal(cues.length, 12);
  assert.ok(cues[10].start > cues[2].end);
  assert.equal((musicLyrics(validated).match(/\[chorus\]/g) ?? []).length, 3);
  assert.throws(() => validateSongLyrics({ ...plan, sections: Array(8).fill(chorus) }), { code: "INVALID_SONG_LYRICS" });
});

test("karaoke accepts a provider word containing a hyphen and apostrophe without losing its measured interval", () => {
  const plan = { ...songPlan, sections: [
    { type: "verse", lines: ["Al-Qur'an kitab suci", "Mari belajar bersama"] },
    ...songPlan.sections.slice(1),
  ] };
  const words = plan.sections.flatMap(section => section.lines).flatMap(line => line.split(/\s+/));
  const alignment = words.map((word, i) => ({ word, start: i * 0.5 + 1, end: i * 0.5 + 1.4 }));
  const cues = alignedSongCues(alignment, plan);
  assert.equal(cues.length, 6);
  assert.equal(cues[0].start, alignment[0].start);
  assert.equal(cues[0].end, alignment[2].end);
  assert.deepEqual(alignedSongCues(alignment.map((word, i) => i === 0 ? { ...word, word: "Al-Qur'an salah" } : word), plan), []);
});
