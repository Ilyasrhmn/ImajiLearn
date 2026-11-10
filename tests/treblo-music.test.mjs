import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createTrebloMusic } from "../apps/web/server/ai/providers/treblo.mjs";

const env = { AI_MUSIC_API_KEY: "test-private-key" };
const json = value => Response.json(value);

test("Treblo submits supplied lyrics once with alignment and MP3 output", async () => {
  const id = randomUUID(); let calls = 0;
  const music = createTrebloMusic(env, async (url, options) => {
    calls++;
    assert.equal(String(url), "https://api.treblo.com/v1/generations/v3");
    assert.equal(options.headers.Authorization, "Bearer test-private-key");
    const body = JSON.parse(options.body);
    assert.equal(body.lyrics, "[verse]\nDaun memakai cahaya");
    assert.equal(body.align_lyrics, true);
    assert.equal(body.output_format, "mp3");
    assert.equal(body.length_range, undefined);
    assert.equal(body.instrumental, false);
    assert.equal(body.tags, undefined);
    assert.deepEqual(body.negative_tags, ["indian pop"]);
    assert.equal(body.prompt_strength, undefined);
    assert.equal(body.style_scale, undefined);
    assert.equal(body.negative_tags_strength, undefined);
    assert.match(body.prompt, /two bars.*before.*answer/i);
    assert.equal(music.describe().musicPromptVersion, 7);
    return json({ task_id: id });
  });
  assert.equal(await music.create({ lyrics: "[verse]\nDaun memakai cahaya" }), id);
  assert.equal(calls, 1);
});

test("model configuration chooses the real endpoint and records a non-secret policy snapshot", async () => {
  const id = randomUUID();
  for (const [model, version] of [["melodia-v2", "v2"], ["v2", "v2"], ["melodia-v3", "v3"]]) {
    const music = createTrebloMusic({ ...env, AI_MUSIC_MODEL: model }, async (url, options) => {
      assert.equal(String(url), `https://api.treblo.com/v1/generations/${version}`);
      const body = JSON.parse(options.body);
      assert.equal(body.length_range, undefined);
      assert.equal(body.num_songs, version === "v2" ? 1 : undefined);
      assert.equal(body.negative_tags === undefined, version === "v2");
      assert.equal(body.tags, undefined);
      return json({ task_id: id });
    });
    assert.equal(await music.create({ lyrics: "Ayo bernyanyi bersama" }), id);
    assert.equal(music.describe().requestedModel, version);
    assert.equal(JSON.stringify(music.describe()).includes(env.AI_MUSIC_API_KEY), false);
  }
});

test("supplied lyrics and arrangement prompt omit mutually exclusive tags while avoidance metadata stays isolated", async () => {
  const music = createTrebloMusic(env, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.tags, undefined);
    assert.match(body.prompt, /bass line/);
    assert.match(body.prompt, /kick, snare/);
    assert.deepEqual(body.negative_tags, ["indian pop"]);
    return json({ task_id: randomUUID() });
  });
  const description = music.describe();
  description.styleTags.push("unwanted");
  description.avoidedStyleTags.push("pop");
  await music.create({ lyrics: "Ayo bernyanyi bersama" });
  assert.deepEqual(music.describe().styleTags, []);
  assert.deepEqual(music.describe().avoidedStyleTags, ["indian pop"]);
  const legacy = createTrebloMusic({ ...env, AI_MUSIC_MODEL: "v2" });
  assert.deepEqual(legacy.describe().styleTags, []);
  assert.deepEqual(legacy.describe().avoidedStyleTags, []);
});

test("duration hints are opt-in, validated and never silently ignored", async () => {
  const music = createTrebloMusic({ ...env, AI_MUSIC_MIN_SECONDS: "90", AI_MUSIC_MAX_SECONDS: "150" }, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).length_range, [90, 150]);
    return json({ task_id: randomUUID() });
  });
  await music.create({ lyrics: "Lagu belajar yang sederhana" });
  for (const invalid of [
    { AI_MUSIC_MIN_SECONDS: "90" }, { AI_MUSIC_MAX_SECONDS: "150" },
    { AI_MUSIC_MIN_SECONDS: "60", AI_MUSIC_MAX_SECONDS: "45" },
    { AI_MUSIC_MIN_SECONDS: "60", AI_MUSIC_MAX_SECONDS: "301" },
    { AI_MUSIC_MIN_SECONDS: "-30", AI_MUSIC_MAX_SECONDS: "90" },
    { AI_MUSIC_MIN_SECONDS: "1", AI_MUSIC_MAX_SECONDS: "90" },
    { AI_MUSIC_MODEL: "melodia-v2", AI_MUSIC_MIN_SECONDS: "60", AI_MUSIC_MAX_SECONDS: "90" },
  ]) assert.throws(() => createTrebloMusic({ ...env, ...invalid }), { code: "INVALID_AI_CONFIG" });
});

test("ambiguous submissions never automatically retry or reveal upstream details", async () => {
  for (const transport of [async () => { throw Error("secret-key"); }, async () => new Response("secret-key", { status: 503 }), async () => json({})]) {
    let calls = 0;
    const music = createTrebloMusic(env, (...args) => { calls++; return transport(...args); });
    await assert.rejects(music.create({ lyrics: "Ayo belajar bersama" }), error => error.code === "MUSIC_REQUEST_UNKNOWN" && !error.message.includes("secret-key"));
    assert.equal(calls, 1);
  }
});

test("known auth and credit failures remain safe to retry after configuration is fixed", async () => {
  for (const [status, code] of [[401, "PROVIDER_AUTH_ERROR"], [402, "MUSIC_CREDITS_REQUIRED"], [429, "RATE_LIMITED"]]) {
    const music = createTrebloMusic(env, async () => new Response("private", { status }));
    await assert.rejects(music.create({ lyrics: "Lagu belajar" }), { code });
  }
});

test("audio download rejects untrusted destinations, redirects, oversize and non-audio", async () => {
  let calls = 0;
  const music = createTrebloMusic(env, async (url, options) => {
    calls++; assert.equal(options.headers?.Authorization, undefined);
    assert.equal(options.redirect, "error");
    return new Response(new Uint8Array([73, 68, 51, ...Array(1024).fill(0)]), { headers: { "content-type": "audio/mpeg" } });
  });
  for (const url of ["http://cdn.treblo.com/x.mp3", "https://localhost/a", "https://cdn.treblo.com.evil.test/a", "https://user:pass@cdn.treblo.com/a"]) {
    await assert.rejects(music.download(url));
  }
  assert.equal(calls, 0);
  assert.equal((await music.download("https://cdn.treblo.com/pubapi/test.mp3")).length, 1027);
  for (const response of [new Response("html", { headers: { "content-type": "text/html" } }), new Response("x", { headers: { "content-length": "999999999" } }), new Response("x", { status: 302, headers: { location: "http://localhost" } })]) {
    await assert.rejects(createTrebloMusic(env, async () => response).download("https://cdn.treblo.com/pubapi/test.mp3"));
  }
});

test("invalid configuration and task IDs never send credentials", async () => {
  let calls = 0;
  const transport = async () => { calls++; return json({}); };
  assert.throws(() => createTrebloMusic({}, transport), { code: "AI_NOT_CONFIGURED" });
  assert.throws(() => createTrebloMusic({ ...env, AI_MUSIC_BASE_URL: "https://evil.test/" }, transport));
  await assert.rejects(createTrebloMusic(env, transport).retrieve("../credits/balance"));
  assert.equal(calls, 0);
});
