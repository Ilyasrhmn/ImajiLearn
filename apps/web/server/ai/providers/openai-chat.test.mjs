import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { readFeatureConfig } from "../config.mjs";
import { requestJson } from "./openai-chat.mjs";

const config = (overrides = {}) => readFeatureConfig("reading", {
  AI_READING_BASE_URL: "https://provider.example/v1",
  AI_READING_API_KEY: "synthetic-test-key", AI_READING_MODEL: "synthetic-model", ...overrides,
});
const request = () => ({ messages: [
  { role: "system", content: "Return a JSON object with a title." },
  { role: "user", content: "Tumbuhan memerlukan air." },
] });
const payload = (overrides = {}) => ({
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"title":"Fotosintesis"}', refusal: null } }],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }, ...overrides,
});
const response = (value = payload()) => Response.json(value);

test("sends the configured URL and bounded parameters, returning parsed JSON and actual usage", async () => {
  let calls = 0;
  const result = await requestJson(config(), request(), async (url, options) => {
    calls++;
    assert.equal(String(url), "https://provider.example/v1/chat/completions");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer synthetic-test-key");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { model: "synthetic-model", messages: request().messages, max_completion_tokens: 4096,
      response_format: { type: "json_object" }, stream: false });
    return response();
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.content, { title: "Fotosintesis" });
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20, providerReported: true });
  assert.equal(JSON.stringify(result).includes("synthetic-test-key"), false);
});

test("supports alternate token field, optional parameters and structured schema without fallback calls", async () => {
  const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false };
  let calls = 0;
  await requestJson(config({ AI_READING_TOKEN_LIMIT_FIELD: "max_tokens", AI_READING_TEMPERATURE: "0.4",
    AI_READING_REASONING_EFFORT: "low", AI_READING_RESPONSE_FORMAT: "json_schema" }), { ...request(), schema }, async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.temperature, 0.4);
    assert.equal(body.reasoning_effort, "low");
    assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "reading_result", strict: true, schema } });
    return response();
  });
  assert.equal(calls, 1);
});

test("rejects invalid requests, caller credentials and audio profiles before network", async () => {
  const transport = () => assert.fail("invalid input must not reach provider");
  const invalid = [null, {}, { ...request(), apiKey: "untrusted" }, { ...request(), model: "other-model" },
    { messages: [] }, { messages: Array(9).fill({ role: "user", content: "x" }) },
    { messages: [{ role: "tool", content: "x" }] }, { messages: [{ role: "user", content: [] }] },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "x", image_url: "https://untrusted.invalid" }] }];
  for (const value of invalid) await assert.rejects(requestJson(config(), value, transport), { code: "INVALID_AI_INPUT" });
  await assert.rejects(requestJson(config(), { messages: [{ role: "user", content: "x".repeat(262144) }] }, transport), { code: "INPUT_TOO_LARGE" });
  await assert.rejects(requestJson(config({ AI_READING_RESPONSE_FORMAT: "json_schema" }), request(), transport), { code: "INVALID_AI_INPUT" });
  const music = readFeatureConfig("music", { AI_MUSIC_BASE_URL: "https://music.example", AI_MUSIC_API_KEY: "music-key", AI_MUSIC_MODEL: "music-model" });
  await assert.rejects(requestJson(music, request(), transport), { code: "UNSUPPORTED_MODALITY" });
});

test("maps HTTP failures without echoing response bodies or retrying charged requests", async () => {
  for (const [status, code] of [[401, "PROVIDER_AUTH_ERROR"], [403, "PROVIDER_AUTH_ERROR"],
    [429, "RATE_LIMITED"], [500, "PROVIDER_UNAVAILABLE"], [503, "PROVIDER_UNAVAILABLE"],
    [400, "PROVIDER_REQUEST_REJECTED"], [404, "PROVIDER_REQUEST_REJECTED"]]) {
    let calls = 0;
    await assert.rejects(requestJson(config(), request(), async () => {
      calls++;
      return new Response("PRIVATE-PROVIDER-BODY", { status });
    }), error => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(String(error).includes("PRIVATE-PROVIDER-BODY"), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("network exceptions are source-free and never trigger implicit retry", async () => {
  let calls = 0;
  await assert.rejects(requestJson(config(), request(), async () => {
    calls++;
    throw new Error("PRIVATE-KEY in network exception");
  }), error => error.code === "PROVIDER_UNAVAILABLE" && !String(error).includes("PRIVATE-KEY") && error.cause === undefined);
  assert.equal(calls, 1);
});

test("refusal, tool calls, truncation and incomplete choices do not become successful JSON", async () => {
  for (const [choice, code] of [
    [{ finish_reason: "length", message: { content: '{"title":"partial"}' } }, "INCOMPLETE_OUTPUT"],
    [{ finish_reason: "content_filter", message: { content: null } }, "PROVIDER_REFUSAL"],
    [{ finish_reason: "stop", message: { refusal: "PRIVATE-REFUSAL", content: null } }, "PROVIDER_REFUSAL"],
    [{ finish_reason: "tool_calls", message: { tool_calls: [{}], content: "{}" } }, "INVALID_PROVIDER_RESPONSE"],
    [{ finish_reason: "stop", message: { tool_calls: [{}], content: "{}" } }, "INVALID_PROVIDER_RESPONSE"],
    [{ finish_reason: "stop", message: { content: "" } }, "INVALID_PROVIDER_RESPONSE"],
    [{ message: { content: "{}" } }, "INVALID_PROVIDER_RESPONSE"],
  ]) {
    await assert.rejects(requestJson(config(), request(), async () => response(payload({ choices: [choice] }))), error => {
      assert.equal(error.code, code);
      assert.equal(String(error).includes("PRIVATE-REFUSAL"), false);
      assert.equal(error.usage.totalTokens, 20);
      return true;
    });
  }
  for (const choices of [[], [{}, {}], null]) {
    await assert.rejects(requestJson(config(), request(), async () => response(payload({ choices }))), { code: "INVALID_PROVIDER_RESPONSE" });
  }
});

test("accepts only a complete JSON object, not markdown, trailing prose, arrays or primitives", async () => {
  for (const text of ["```json\n{}\n```", "{} trailing text", "[]", "null", "42", '"string"', '{"partial":']) {
    const value = payload();
    value.choices[0].message.content = text;
    await assert.rejects(requestJson(config(), request(), async () => response(value)), { code: "INVALID_PROVIDER_RESPONSE" });
  }
  await assert.rejects(requestJson(config(), request(), async () => new Response("<html>PRIVATE</html>")), { code: "INVALID_PROVIDER_RESPONSE" });
});

test("reports unknown usage as null and preserves valid partial usage", async () => {
  for (const usage of [undefined, null, { prompt_tokens: -1, completion_tokens: "8", total_tokens: Infinity }]) {
    const result = await requestJson(config(), request(), async () => response(payload({ usage })));
    assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null, totalTokens: null, providerReported: false });
  }
  const result = await requestJson(config(), request(), async () => response(payload({ usage: { prompt_tokens: 12 } })));
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: null, totalTokens: null, providerReported: true });
});

test("bounds streamed response bytes even without Content-Length", async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(262145)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(requestJson(config(), request(), async () => new Response(body)), { code: "RESPONSE_TOO_LARGE" });
  assert.equal(canceled, true);
});

test("cancels before sending and during a request without exposing abort reasons", async () => {
  const before = new AbortController();
  before.abort(new Error("PRIVATE-ABORT"));
  await assert.rejects(requestJson(config(), { ...request(), signal: before.signal }, () => assert.fail("must not send")), { code: "CANCELED" });
  const during = new AbortController();
  await assert.rejects(requestJson(config(), { ...request(), signal: during.signal }, async (url, options) => {
    during.abort(new Error("PRIVATE-ABORT"));
    options.signal.throwIfAborted();
  }), error => error.code === "CANCELED" && !String(error).includes("PRIVATE-ABORT"));
});

test("enforces configured timeout and does not retry on an uncertain outcome", async () => {
  let calls = 0;
  await assert.rejects(requestJson(config({ AI_READING_TIMEOUT_MS: "1000" }), request(), (url, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  }), { code: "PROVIDER_TIMEOUT" });
  assert.equal(calls, 1);
});

test("uses real HTTP transport on loopback and refuses redirects carrying credentials", async t => {
  let escaped = 0;
  let observed;
  const server = createServer(async (req, res) => {
    if (req.url === "/stolen") { escaped++; res.end("{}"); return; }
    if (req.url === "/redirect/chat/completions") { res.writeHead(307, { Location: "/stolen" }); res.end(); return; }
    let body = "";
    for await (const chunk of req) body += chunk;
    observed = { authorization: req.headers.authorization, body: JSON.parse(body), path: req.url };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload()));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const local = config({ AI_READING_BASE_URL: `${base}/v1`, NODE_ENV: "test" });
  assert.equal((await requestJson(local, request())).content.title, "Fotosintesis");
  assert.equal(observed.path, "/v1/chat/completions");
  assert.equal(observed.authorization, "Bearer synthetic-test-key");
  assert.equal(observed.body.model, "synthetic-model");
  await assert.rejects(requestJson(config({ AI_READING_BASE_URL: `${base}/redirect`, NODE_ENV: "test" }), request()), { code: "PROVIDER_UNAVAILABLE" });
  assert.equal(escaped, 0);
});
