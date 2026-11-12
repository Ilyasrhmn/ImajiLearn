import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialSongs } from "../apps/web/server/materials/songs.mjs";
import { songAudioResponse } from "../apps/web/server/materials/song-audio.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { AIError } from "../apps/web/server/ai/errors.mjs";
import { testDatabase } from "./support/database.mjs";

const plan = { title: "Siklus Air", learningPoints: ["Air menguap dan membentuk awan."], sections: [
  { type: "verse", lines: ["Air menguap naik ke atas", "Uap air membentuk awan"] },
  { type: "chorus", lines: ["Ayo ingat siklus air", "Air menguap membentuk awan"] },
  { type: "response", lines: ["Apa yang membentuk awan?", "Uap air jawab bersama"] },
] };
const bytes = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200)]);

test("song lifecycle persists and resumes paid tasks without duplicate generation", async t => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "owner", email: "song-owner@example.test" } });
    const other = await storage.db.teacher.create({ data: { name: "other", email: "song-other@example.test" } });
    const materials = createMaterialService(storage.db);
    t.beforeEach(() => storage.db.rateLimit.deleteMany());
    const source = () => materials.create(owner.id, { title: "Siklus air", text: "Air menguap dan membentuk awan." }, randomUUID());
    const writeLyrics = async (feature, request) => {
      assert.equal(feature, "song"); assert.match(request.messages[1].content, /Air menguap/);
      return { content: plan };
    };

    await t.test("owner, concurrency, process restart, caching and protected audio", async () => {
      const material = await source(); const gate = Promise.withResolvers();
      let submitted = 0, downloads = 0;
      const music = { create: async () => { submitted++; await gate.promise; return randomUUID(); }, retrieve: async () => ({ status: "SUCCESS", alignment_status: "FAILURE", song_paths: ["test.mp3"] }), download: async () => { downloads++; return bytes; } };
      const service = createMaterialSongs(storage.db, writeLyrics, music);
      assert.equal(await service.get(owner.id, material.id), null);
      await assert.rejects(service.start(other.id, material.id), { status: 404 });
      const pending = service.start(owner.id, material.id);
      while (!submitted) await new Promise(resolve => setTimeout(resolve, 5));
      const duplicate = await service.start(owner.id, material.id);
      assert.equal(duplicate.status, "submitting");
      gate.resolve(); assert.equal((await pending).status, "generating");
      const restarted = createMaterialSongs(storage.db, writeLyrics, music);
      await assert.rejects(restarted.get(other.id, material.id), { status: 404 });
      const ready = await restarted.get(owner.id, material.id);
      assert.equal(ready.status, "ready"); assert.deepEqual(ready.cues, []);
      assert.equal(JSON.stringify(ready).includes("taskId"), false);
      assert.deepEqual(await restarted.start(owner.id, material.id), ready);
      assert.deepEqual((await restarted.audio(owner.id, material.id, material.revision)).bytes, bytes);
      await assert.rejects(restarted.audio(other.id, material.id, material.revision), { status: 404 });
      await assert.rejects(restarted.audio(owner.id, material.id, "0".repeat(64)), { status: 409 });
      assert.equal(submitted, 1); assert.equal(downloads, 1);
    });
    await t.test("an ambiguous POST cannot silently consume credits a second time", async () => {
      const material = await source(); let submissions = 0;
      const service = createMaterialSongs(storage.db, writeLyrics, { create: async () => { submissions++; throw new AIError("MUSIC_REQUEST_UNKNOWN"); } });
      assert.equal((await service.start(owner.id, material.id)).status, "uncertain");
      assert.equal((await service.start(owner.id, material.id)).status, "uncertain");
      assert.equal(submissions, 1);
    });
    await t.test("a worker resuming after lease expiry preserves uncertainty or its returned task ID", async () => {
      for (const ambiguous of [true, false]) {
        const material = await source(), gate = Promise.withResolvers(); let calls = 0;
        const service = createMaterialSongs(storage.db, writeLyrics, { create: async () => { calls++; await gate.promise; if (ambiguous) throw new AIError("MUSIC_REQUEST_UNKNOWN"); return randomUUID(); } });
        const pending = service.start(owner.id, material.id);
        while (!calls) await new Promise(resolve => setTimeout(resolve, 5));
        await storage.db.materialSong.update({ where: { materialId_revision: { materialId: material.id, revision: material.revision } }, data: { leaseUntil: new Date(0) } });
        assert.equal((await service.get(owner.id, material.id)).status, "uncertain");
        gate.resolve();
        const resumed = await pending;
        assert.equal(resumed.status, ambiguous ? "uncertain" : "generating");
        assert.equal((await service.start(owner.id, material.id)).status, resumed.status);
        assert.equal(calls, 1);
      }
    });
    await t.test("a fresh retry of an old failed row waits for real alignment", async () => {
      const material = await source(), key = { materialId: material.id, revision: material.revision };
      await storage.db.materialSong.create({ data: { ...key, attemptId: randomUUID(), status: "failed", createdAt: new Date(0) } });
      let aligned = false, downloads = 0;
      const words = plan.sections.flatMap(s => s.lines).join(" ").split(/\s+/).map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 }));
      const service = createMaterialSongs(storage.db, writeLyrics, { create: async () => randomUUID(), retrieve: async () => ({ status: "SUCCESS", song_paths: ["test.mp3"], alignment_status: aligned ? "SUCCESS" : "ALIGNING", word_aligned_lyrics: aligned ? words : null }), download: async () => { downloads++; return bytes; } });
      await service.start(owner.id, material.id);
      assert.equal((await service.get(owner.id, material.id)).alignmentPending, true);
      aligned = true;
      await storage.db.materialSong.update({ where: { materialId_revision: key }, data: { leaseUntil: null } });
      const ready = await service.get(owner.id, material.id);
      assert.equal(ready.alignmentPending, false); assert.equal(ready.cues.length, 6); assert.equal(downloads, 1);
    });
    await t.test("expiry cannot downgrade a task ID persisted after its stale read", async () => {
      const material = await source(), key = { materialId: material.id, revision: material.revision }, taskId = randomUUID();
      await storage.db.materialSong.create({ data: { ...key, attemptId: randomUUID(), status: "submitting", leaseUntil: new Date(0) } });
      let interleaved = false;
      const wrapped = { material: storage.db.material, materialSong: storage.db.materialSong,
        $transaction: action => storage.db.$transaction(tx => action(new Proxy(tx, { get(target, property) {
          if (property !== "materialSong") return Reflect.get(target, property);
          return new Proxy(tx.materialSong, { get(delegate, method) {
            if (method !== "findUnique") return Reflect.get(delegate, method);
            return async args => {
              const row = await tx.materialSong.findUnique(args);
              if (!interleaved) {
                interleaved = true;
                await tx.materialSong.update({ where: { materialId_revision: key }, data: { status: "generating", taskId, leaseUntil: null } });
              }
              return row;
            };
          } });
        } }))),
      };
      const result = await createMaterialSongs(wrapped, writeLyrics, {}).start(owner.id, material.id);
      assert.equal(interleaved, true); assert.equal(result.status, "generating");
      assert.equal((await storage.db.materialSong.findUnique({ where: { materialId_revision: key } })).taskId, taskId);
    });
    await t.test("transient audio download failures resume the same remote task", async () => {
      const material = await source(); let submissions = 0, downloads = 0;
      const service = createMaterialSongs(storage.db, writeLyrics, {
        create: async () => { submissions++; return randomUUID(); },
        retrieve: async () => ({ status: "SUCCESS", alignment_status: "FAILURE", song_paths: ["test.mp3"] }),
        download: async () => { if (++downloads === 1) throw new AIError("PROVIDER_UNAVAILABLE"); return bytes; },
      });
      await service.start(owner.id, material.id);
      await assert.rejects(service.get(owner.id, material.id), { code: "PROVIDER_UNAVAILABLE" });
      assert.equal((await service.get(owner.id, material.id)).status, "ready");
      assert.equal(submissions, 1);
    });
    await t.test("an expired polling worker cannot overwrite newer aligned audio", async () => {
      const material = await source(), key = { materialId: material.id, revision: material.revision };
      const gate = Promise.withResolvers(); let polls = 0;
      const words = plan.sections.flatMap(s => s.lines).join(" ").split(/\s+/).map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 }));
      const service = createMaterialSongs(storage.db, writeLyrics, { create: async () => randomUUID(), download: async () => bytes,
        retrieve: async () => { if (++polls === 1) { await gate.promise; return { status: "SUCCESS", alignment_status: "FAILURE", song_paths: ["test.mp3"] }; } return { status: "SUCCESS", alignment_status: "SUCCESS", word_aligned_lyrics: words, song_paths: ["test.mp3"] }; },
      });
      await service.start(owner.id, material.id);
      const oldWorker = service.get(owner.id, material.id);
      while (!polls) await new Promise(resolve => setTimeout(resolve, 5));
      await storage.db.materialSong.update({ where: { materialId_revision: key }, data: { leaseUntil: new Date(0) } });
      assert.equal((await service.get(owner.id, material.id)).cues.length, 6);
      gate.resolve(); await oldWorker;
      assert.equal((await service.get(owner.id, material.id)).cues.length, 6);
    });
    await t.test("expired submitting reservations are uncertain, expired lyric writing is retryable", async () => {
      const material = await source(); let calls = 0;
      const key = { materialId: material.id, revision: material.revision };
      await storage.db.materialSong.create({ data: { ...key, status: "submitting", attemptId: randomUUID(), leaseUntil: new Date(0) } });
      const service = createMaterialSongs(storage.db, writeLyrics, { create: async () => { calls++; return randomUUID(); } });
      assert.equal((await service.start(owner.id, material.id)).status, "uncertain");
      assert.equal(calls, 0);
      await storage.db.materialSong.update({ where: { materialId_revision: key }, data: { status: "writing", leaseUntil: new Date(0) } });
      assert.equal((await service.start(owner.id, material.id)).status, "generating");
      assert.equal(calls, 1);
    });
    await t.test("archived and unavailable sources do not call music", async () => {
      const material = await source(); let calls = 0;
      const service = createMaterialSongs(storage.db, writeLyrics, { create: async () => { calls++; return randomUUID(); } });
      await storage.db.material.update({ where: { id: material.id }, data: { archived: true } });
      await assert.rejects(service.start(owner.id, material.id), { code: "MATERIAL_ARCHIVED" });
      await storage.db.material.update({ where: { id: material.id }, data: { archived: false, extractionStatus: "failed", extractionError: "EXTRACTION_FAILED" } });
      await assert.rejects(service.start(owner.id, material.id), { code: "MATERIAL_NOT_READY" });
      assert.equal(calls, 0);
    });
    await t.test("a revision change while lyrics are written prevents submission", async () => {
      const material = await source(); let calls = 0;
      const service = createMaterialSongs(storage.db, async () => {
        await storage.db.material.update({ where: { id: material.id }, data: { revision: "a".repeat(64) } });
        return { content: plan };
      }, { create: async () => { calls++; return randomUUID(); } });
      await assert.rejects(service.start(owner.id, material.id), { code: "SOURCE_CHANGED" });
      assert.equal(calls, 0);
    });
    await t.test("invalid music configuration fails before lyric inference or submission", async () => {
      const material = await source(); let textCalls = 0, musicCalls = 0;
      const service = createMaterialSongs(storage.db, async () => { textCalls++; return { content: plan }; }, {
        validate: () => { throw new AIError("INVALID_AI_CONFIG"); },
        create: async () => { musicCalls++; return randomUUID(); },
      });
      assert.equal((await service.start(owner.id, material.id)).status, "failed");
      assert.equal(textCalls, 0); assert.equal(musicCalls, 0);
    });
    await t.test("each paid task retains its requested and actual model without exposing configuration", async () => {
      const material = await source();
      const service = createMaterialSongs(storage.db, writeLyrics, {
        describe: () => ({ provider: "kie-suno", requestedModel: "V6", durationHint: null, musicPromptVersion: 2 }),
        create: async () => randomUUID(),
        retrieve: async () => ({ status: "SUCCESS", model_version: "chirp-v6", alignment_status: "FAILURE", song_paths: ["test.mp3"] }),
        download: async () => bytes,
      });
      await service.start(owner.id, material.id);
      const result = await service.get(owner.id, material.id);
      const row = await storage.db.materialSong.findUnique({ where: { materialId_revision: { materialId: material.id, revision: material.revision } } });
      assert.equal(row.content.generation.requestedModel, "V6");
      assert.equal(row.content.generation.actualModel, "chirp-v6");
      assert.equal(result.generation, undefined);
    });
    await t.test("requested and observed musical styles remain bounded private diagnostics", async () => {
      const material = await source();
      const service = createMaterialSongs(storage.db, writeLyrics, {
        describe: () => ({ provider: "kie-suno", requestedModel: "V6", durationHint: null, musicPromptVersion: 7,
          styleTags: ["children", "pop", "bass", "drums"], avoidedStyleTags: ["indian pop"] }),
        create: async () => randomUUID(),
        retrieve: async () => ({ status: "SUCCESS", model_version: "v3-preview", alignment_status: "FAILURE", song_paths: ["test.mp3"],
          tags: [" pop ", "indian pop", "pop", null, 42, "", "bad\u0000tag", "x".repeat(81), ...Array.from({ length: 40 }, (_, i) => "style-" + i)] }),
        download: async () => bytes,
      });
      const pending = await service.start(owner.id, material.id);
      const ready = await service.get(owner.id, material.id);
      const row = await storage.db.materialSong.findUnique({ where: { materialId_revision: { materialId: material.id, revision: material.revision } } });
      assert.deepEqual(row.content.generation.requestedStyleTags, ["children", "pop", "bass", "drums"]);
      assert.deepEqual(row.content.generation.avoidedStyleTags, ["indian pop"]);
      assert.equal(row.content.generation.actualStyleTags.length, 32);
      assert.deepEqual(row.content.generation.actualStyleTags.slice(0, 3), ["pop", "indian pop", "style-0"]);
      for (const output of [pending, ready, await service.start(owner.id, material.id)]) {
        assert.equal(output.generation, undefined);
        assert.equal(JSON.stringify(output).includes("indian pop"), false);
        assert.equal(JSON.stringify(output).includes("actualStyleTags"), false);
      }
    });
  } finally { await storage.close(); }
});

test("Suno alignment survives download retry without another paid alignment or generation", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "owner", email: "suno-owner@example.test" } });
    const other = await storage.db.teacher.create({ data: { name: "other", email: "suno-other@example.test" } });
    const material = await createMaterialService(storage.db).create(owner.id, { title: "Siklus air", text: "Air menguap dan membentuk awan." }, randomUUID());
    let submissions = 0, alignments = 0, downloads = 0;
    const words = plan.sections.flatMap(s => s.lines).flatMap(line => line.match(/[\p{L}\p{N}]+/gu));
    const provider = {
      describe: () => ({ provider: "kie-suno", requestedModel: "V6", musicPromptVersion: 8 }),
      create: async () => { submissions++; return "1234567890abcdef1234567890abcdef"; },
      retrieve: async (_id, audioId) => { assert.ok(audioId === undefined || audioId === "audio-1"); return { status: "SUCCESS", audioId: "audio-1", song_paths: ["test.mp3"] }; },
      align: async () => { alignments++; return words.map((word, i) => ({ word, start: i, end: i + 1 })); },
      download: async () => { if (++downloads === 1) throw new AIError("PROVIDER_UNAVAILABLE"); return bytes; },
    };
    const service = createMaterialSongs(storage.db, async () => ({ content: plan }), provider);
    await service.start(owner.id, material.id);
    await assert.rejects(service.get(other.id, material.id), { status: 404 });
    await assert.rejects(service.get(owner.id, material.id), { code: "PROVIDER_UNAVAILABLE" });
    const row = await storage.db.materialSong.findUnique({ where: { materialId_revision: { materialId: material.id, revision: material.revision } } });
    assert.equal(row.content.alignmentAttempted, true);
    assert.equal(row.content.cues.length, 6);
    assert.equal((await service.get(owner.id, material.id)).status, "ready");
    assert.equal((await service.start(owner.id, material.id)).status, "ready");
    assert.equal(alignments, 1); assert.equal(submissions, 1); assert.equal(downloads, 2);
    await assert.rejects(service.audio(other.id, material.id, material.revision), { status: 404 });
    await storage.db.materialSong.updateMany({ where: { materialId: material.id }, data: { status: "generating", content: { ...plan, generation: { provider: "retired-provider" } } } });
    assert.equal((await service.get(owner.id, material.id)).status, "failed");
    assert.equal(submissions, 1);
  } finally { await storage.close(); }
});

test("audio range responses allow seeking and reject invalid requests", async () => {
  const request = range => new Request("http://localhost/audio", { headers: range ? { range } : {} });
  const asset = { bytes, mime: "audio/mpeg" };
  const all = songAudioResponse(request(), asset);
  assert.equal(all.status, 200); assert.equal(all.headers.get("accept-ranges"), "bytes");
  const part = songAudioResponse(request("bytes=3-5"), asset);
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 3);
  assert.equal(songAudioResponse(request("bytes=-10"), asset).status, 206);
  for (const range of ["bytes=999-", "bytes=5-3", "bytes=1-2,4-5", "oops"]) assert.equal(songAudioResponse(request(range), asset).status, 416);
});


test("all Suno versions survive partial download failures with private independent audio and cues", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "owner", email: "versions-owner@example.test" } });
    const other = await storage.db.teacher.create({ data: { name: "other", email: "versions-other@example.test" } });
    const material = await createMaterialService(storage.db).create(owner.id, { title: "Siklus air", text: "Air menguap dan membentuk awan." }, randomUUID());
    const words = plan.sections.flatMap(s => s.lines).flatMap(line => line.match(/[\p{L}\p{N}]+/gu));
    const alignmentCalls = [], downloadCalls = []; let submits = 0, failSecond = true, polls = 0;
    const provider = {
      describe: () => ({ provider: "kie-suno", requestedModel: "V6" }),
      create: async () => { submits++; return "1234567890abcdef1234567890abcdef"; },
      retrieve: async () => { polls++; return { status: "SUCCESS", tracks: [{ audioId: "one", audioUrl: "one.mp3" }, { audioId: "two", audioUrl: "two.mp3" }] }; },
      align: async (_task, id) => { alignmentCalls.push(id); const shift = id === "one" ? 1 : 5; return words.map((word, i) => ({ word, start: i + shift, end: i + shift + 0.5 })); },
      download: async url => { downloadCalls.push(url); if (url === "two.mp3" && failSecond) { failSecond = false; throw new AIError("PROVIDER_UNAVAILABLE"); } return Buffer.concat([bytes, Buffer.from(url)]); },
    };
    const service = createMaterialSongs(storage.db, async () => ({ content: plan }), provider);
    await service.start(owner.id, material.id);
    await assert.rejects(service.get(owner.id, material.id), { code: "PROVIDER_UNAVAILABLE" });
    const resumed = createMaterialSongs(storage.db, async () => { throw Error("do not regenerate lyrics"); }, provider);
    const result = await resumed.get(owner.id, material.id);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.versions.map(version => version.id), ["one", "two"]);
    assert.equal(result.versions[0].cues[0].start, 1);
    assert.equal(result.versions[1].cues[0].start, 5);
    assert.deepEqual(alignmentCalls, ["one", "two"]);
    assert.deepEqual(downloadCalls, ["one.mp3", "two.mp3", "two.mp3"]);
    assert.equal(submits, 1);
    assert.deepEqual((await resumed.audio(owner.id, material.id, material.revision)).bytes, Buffer.concat([bytes, Buffer.from("one.mp3")]));
    assert.deepEqual((await resumed.audio(owner.id, material.id, material.revision, "two")).bytes, Buffer.concat([bytes, Buffer.from("two.mp3")]));
    await assert.rejects(resumed.audio(other.id, material.id, material.revision, "two"), { status: 404 });
    await assert.rejects(resumed.audio(owner.id, material.id, material.revision, "missing"), { status: 404 });
    await resumed.get(owner.id, material.id); await resumed.start(owner.id, material.id);
    assert.equal(submits, 1); assert.equal(polls, 2);
    assert.deepEqual(alignmentCalls, ["one", "two"]);
    const payload = JSON.stringify(result);
    assert.doesNotMatch(payload, /one.mp3|two.mp3|1234567890abcdef/);
  } finally { await storage.close(); }
});
