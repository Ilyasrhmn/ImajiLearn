import assert from "node:assert/strict";
import test from "node:test";
import { requestTextJson } from "../apps/web/server/ai/text-provider.mjs";

const env = {
  AI_SLIDES_BASE_URL: "https://api.kie.ai/openai/v1/", AI_SLIDES_API_KEY: "primary-test-key",
  AI_SLIDES_MODEL: "deepseek-v4-1-flash", AI_SLIDES_PROTOCOL: "openai-responses", AI_SLIDES_REASONING_EFFORT: "none",
  AI_TEXT_FALLBACK_BASE_URL: "https://google.example/v1/", AI_TEXT_FALLBACK_API_KEY: "fallback-test-key",
  AI_TEXT_FALLBACK_MODEL: "gemini-test", AI_TEXT_FALLBACK_PROTOCOL: "openai-chat",
};
const request = { messages: [{ role: "system", content: "Return JSON." }, { role: "user", content: "Tata Surya" }] };
const completed = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"title":"Tata Surya"}' }] }],
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } };
const chat = { choices: [{ finish_reason: "stop", message: { content: '{"title":"Google fallback"}' } }] };

test("DeepSeek Responses uses none reasoning and parses JSON without invoking fallback", async () => {
  let calls = 0;
  const result = await requestTextJson("slides", request, env, async (url, options) => {
    calls++;
    assert.equal(String(url), "https://api.kie.ai/openai/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deepseek-v4-1-flash");
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.deepEqual(body.input, request.messages);
    assert.deepEqual(body.text, { format: { type: "json_object" } });
    assert.equal(body.max_output_tokens, undefined);
    return Response.json(completed);
  });
  assert.equal(calls, 1);
  assert.equal(result.content.title, "Tata Surya");
  assert.equal(result.usage.outputTokens, 20);
});

for (const failure of [429, 401, 402, "invalid", "incomplete", "body-error"]) {
  test(`primary failure ${failure} uses Gemini with the original messages`, async () => {
    let calls = 0;
    const result = await requestTextJson("slides", request, env, async (url, options) => {
      calls++;
      if (calls === 1) {
        if (typeof failure === "number") return Response.json({}, { status: failure });
        if (failure === "body-error") return Response.json({ code: 429, msg: "Rate limited" });
        return Response.json(failure === "incomplete" ? { ...completed, status: "incomplete" } : { ...completed, output: [] });
      }
      assert.equal(String(url), "https://google.example/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer fallback-test-key");
      assert.deepEqual(JSON.parse(options.body).messages, request.messages);
      return Response.json(chat);
    });
    assert.equal(calls, 2);
    assert.equal(result.content.title, "Google fallback");
  });
}

test("refusals never switch provider", async () => {
  let calls = 0;
  await assert.rejects(requestTextJson("slides", request, env, async () => {
    calls++;
    return Response.json({ ...completed, output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] });
  }), { code: "PROVIDER_REFUSAL" });
  assert.equal(calls, 1);
});

test("cancellation never switches provider", async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(requestTextJson("slides", { ...request, signal: controller.signal }, env, async () => { calls++; }), { code: "CANCELED" });
  assert.equal(calls, 0);
});

test("missing fallback preserves the primary failure", async () => {
  const noFallback = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("AI_TEXT_FALLBACK_")));
  await assert.rejects(requestTextJson("slides", request, noFallback, async () => Response.json({}, { status: 429 })), { code: "RATE_LIMITED" });
});
