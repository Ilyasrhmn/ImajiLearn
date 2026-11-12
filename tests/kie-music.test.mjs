import assert from "node:assert/strict";
import { test } from "node:test";
import { createKieMusic } from "../apps/web/server/ai/providers/kie-music.mjs";

const env = { KIE_API_KEY: "test-private-key" };
const id = "1234567890abcdef1234567890abcdef";
const track = { id: "audio-1", audio_url: "https://tempfile.aiquickdraw.com/music/song.mp3", model_name: "chirp-v6", tags: "children pop" };

test("Suno V6 submits supplied lyrics in custom mode with a bounded style", async () => {
  let calls = 0;
  const music = createKieMusic(env, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.kie.ai/api/v1/jobs/createTask");
    assert.equal(options.headers.Authorization, "Bearer test-private-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "ai-music-api/generate");
    assert.equal(body.input.model, "V6");
    assert.equal(body.input.custom_mode, true);
    assert.equal(body.input.instrumental, false);
    assert.equal(body.input.lyrics, "[verse]\nAyo belajar bersama");
    assert.equal(body.input.title, "Siklus Air");
    assert.ok(body.input.style.length <= 1000);
    assert.match(body.input.style, /Bahasa Indonesia/);
    assert.equal(body.input.vocal_gender, "f");
    assert.equal(body.input.prompt, undefined);
    return Response.json({ code: 200, data: { taskId: id } });
  });
  assert.equal(await music.create({ title: "Siklus Air", lyrics: "[verse]\nAyo belajar bersama" }), id);
  assert.equal(calls, 1);
  assert.equal(music.describe().provider, "kie-suno");
  assert.ok(!JSON.stringify(music.describe()).includes(env.KIE_API_KEY));
});

test("provider normalizes completed, queued and failed tasks", async () => {
  for (const [state, status] of [["waiting", "PENDING"], ["generating", "PENDING"], ["fail", "FAILURE"], ["success", "SUCCESS"]]) {
    const music = createKieMusic(env, async url => {
      assert.equal(url, `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${id}`);
      return Response.json({ code: 200, data: { taskId: id, state, resultJson: JSON.stringify({ data: [track] }) } });
    });
    const result = await music.retrieve(id);
    assert.equal(result.status, status);
    if (state === "success") { assert.equal(result.audioId, track.id); assert.deepEqual(result.song_paths, [track.audio_url]); }
  }
});

test("timestamped words use the selected audio and normalize seconds", async () => {
  const music = createKieMusic(env, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "ai-music-api/timeStamped-lyrics");
    assert.deepEqual(body.input, { task_id: id, audio_id: "audio-1" });
    return Response.json({ code: 200, data: { code: 200, data: { alignedWords: [{ word: "Ayo", startS: 1, endS: 2, success: true }] } } });
  });
  assert.deepEqual(await music.align(id, "audio-1"), [{ word: "Ayo", start: 1, end: 2 }]);
});

test("polling preserves the selected track and rejects incomplete successful responses", async () => {
  const music = createKieMusic(env, async () => Response.json({ code: 200, data: { taskId: id, state: "success", response: { data: [{ ...track, id: "audio-2" }, track] } } }));
  assert.equal((await music.retrieve(id, "audio-1")).audioId, "audio-1");
  for (const result of [{}, { data: {} }, { data: [] }, { data: [{ id: "audio-1" }] }]) {
    const invalid = createKieMusic(env, async () => Response.json({ code: 200, data: { taskId: id, state: "success", resultJson: JSON.stringify(result) } }));
    await assert.rejects(invalid.retrieve(id), { code: "INVALID_PROVIDER_RESPONSE" });
  }
});

test("ambiguous paid submissions are not retried and never expose secrets", async () => {
  for (const response of [() => { throw Error("test-private-key"); }, () => new Response("private", { status: 503 }), () => Response.json({ code: 200, data: {} })]) {
    let calls = 0;
    const music = createKieMusic(env, async () => { calls++; return response(); });
    await assert.rejects(music.create({ lyrics: "Ayo belajar bersama" }), error => error.code === "MUSIC_REQUEST_UNKNOWN" && !error.message.includes(env.KIE_API_KEY));
    assert.equal(calls, 1);
  }
});

test("HTTP 200 with an error envelope still rejects auth, quota and invalid requests", async () => {
  for (const [code, expected] of [[401, "PROVIDER_AUTH_ERROR"], [402, "MUSIC_CREDITS_REQUIRED"], [429, "RATE_LIMITED"], [422, "PROVIDER_REQUEST_REJECTED"]]) {
    const music = createKieMusic(env, async () => Response.json({ code, msg: "private provider detail" }));
    await assert.rejects(music.create({ lyrics: "Ayo belajar bersama" }), { code: expected });
  }
});

test("audio downloads never send the key or follow arbitrary URLs", async () => {
  let calls = 0;
  const music = createKieMusic(env, async (_url, options) => {
    calls++;
    assert.equal(options.headers?.Authorization, undefined);
    assert.equal(options.redirect, "error");
    return new Response(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(256)]), { headers: { "content-type": "audio/mpeg" } });
  });
  for (const url of ["http://tempfile.aiquickdraw.com/x", "https://localhost/x", "https://tempfile.aiquickdraw.com.evil.test/x", "https://user:pass@tempfile.aiquickdraw.com/x"]) await assert.rejects(music.download(url));
  assert.equal(calls, 0);
  assert.equal((await music.download(track.audio_url)).length, 259);
  for (const response of [new Response("html", { headers: { "content-type": "text/html" } }), new Response("x", { headers: { "content-length": "999999999" } }), new Response(null, { status: 302 })]) await assert.rejects(createKieMusic(env, async () => response).download(track.audio_url));
});

test("invalid config and task identifiers never send requests", async () => {
  let calls = 0;
  const transport = async () => { calls++; return Response.json({}); };
  assert.throws(() => createKieMusic({}, transport), { code: "AI_NOT_CONFIGURED" });
  assert.throws(() => createKieMusic({ ...env, AI_MUSIC_BASE_URL: "https://evil.test" }, transport));
  assert.throws(() => createKieMusic({ ...env, AI_MUSIC_MODEL: "melodia-v3" }, transport));
  await assert.rejects(createKieMusic(env, transport).retrieve("../api-key"));
  assert.equal(calls, 0);
});


test("all returned Suno versions are exposed without a second create request", async () => {
  const music = createKieMusic(env, async () => Response.json({ code: 200, data: { taskId: id, state: "success", resultJson: JSON.stringify({ data: [track, { ...track, id: "audio-2", audio_url: "https://tempfile.aiquickdraw.com/second.mp3" }] }) } }));
  const result = await music.retrieve(id);
  assert.deepEqual(result.tracks.map(item => item.audioId), ["audio-1", "audio-2"]);
  assert.equal(result.tracks[1].audioUrl, "https://tempfile.aiquickdraw.com/second.mp3");
});
