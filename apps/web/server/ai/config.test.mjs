import assert from "node:assert/strict";
import test from "node:test";
import { readFeatureConfig } from "./config.mjs";

const env = (feature = "READING", overrides = {}) => ({
  [`AI_${feature}_BASE_URL`]: "https://provider.example/v1",
  [`AI_${feature}_API_KEY`]: "synthetic-test-key",
  [`AI_${feature}_MODEL`]: "synthetic-model", ...overrides,
});

test("loads independent profiles for all MVP text features without leaking enumerable credentials", () => {
  for (const feature of ["reading", "mindmap", "slides", "song", "exam"]) {
    const config = readFeatureConfig(feature, env(feature.toUpperCase()));
    assert.equal(config.feature, feature);
    assert.equal(config.kind, "text");
    assert.equal(config.protocol, "openai-chat");
    assert.equal(config.baseUrl, "https://provider.example/v1/");
    assert.equal(config.apiKey, "synthetic-test-key");
    assert.equal(JSON.stringify(config).includes("synthetic-test-key"), false);
    assert.equal(config.temperature, undefined);
    assert.equal(config.reasoningEffort, undefined);
    assert.equal(config.timeoutMs, 45000);
    assert.equal(config.responseFormat, "json_object");
    assert.equal(config.tokenLimitField, "max_completion_tokens");
  }
});

test("profiles do not inherit API keys or models from another feature or global env", () => {
  const value = { ...env(), OPENAI_API_KEY: "global-key", AI_API_KEY: "global-key" };
  assert.throws(() => readFeatureConfig("slides", value), { code: "AI_NOT_CONFIGURED" });
  assert.throws(() => readFeatureConfig("reading", { AI_READING_MODEL: "model" }), { code: "AI_NOT_CONFIGURED" });
  assert.equal(readFeatureConfig("reading", { ...value, AI_SLIDES_TIMEOUT_MS: "bad" }).model, "synthetic-model");
});

test("keeps music audio config separate from lyric generation", () => {
  const config = readFeatureConfig("music", env("MUSIC"));
  assert.equal(config.kind, "audio");
  assert.equal(config.timeoutMs, 120000);
  assert.equal(config.maxOutputTokens, undefined);
  assert.equal(config.protocol, undefined);
  assert.throws(() => readFeatureConfig("music", env("SONG")), { code: "AI_NOT_CONFIGURED" });
});

test("supports a versioned compatibility base path and per-feature request parameters", () => {
  const config = readFeatureConfig("reading", env("READING", {
    AI_READING_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    AI_READING_TEMPERATURE: "0", AI_READING_MAX_OUTPUT_TOKENS: "2048",
    AI_READING_TIMEOUT_MS: "30000", AI_READING_TOKEN_LIMIT_FIELD: "max_tokens",
    AI_READING_RESPONSE_FORMAT: "json_schema", AI_READING_REASONING_EFFORT: "low",
  }));
  assert.equal(config.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai/");
  assert.equal(config.temperature, 0);
  assert.equal(config.maxOutputTokens, 2048);
  assert.equal(config.timeoutMs, 30000);
  assert.equal(config.tokenLimitField, "max_tokens");
  assert.equal(config.responseFormat, "json_schema");
  assert.equal(config.reasoningEffort, "low");
});

test("rejects unsupported features and protocols instead of silently using another provider", () => {
  for (const feature of ["unknown", "READING"]) {
    assert.throws(() => readFeatureConfig(feature, env()), { code: "INVALID_AI_FEATURE" });
  }
  assert.throws(() => readFeatureConfig("reading", env("READING", { AI_READING_PROTOCOL: "anthropic" })), { code: "INVALID_AI_CONFIG" });
});

test("rejects credential/query URLs, non-HTTPS remote endpoints and complete endpoint paths", () => {
  for (const url of [
    "invalid", "http://provider.example/v1", "https://user:password@provider.example/v1",
    "https://provider.example/v1?key=private", "https://provider.example/v1#fragment",
    "https://provider.example/v1/chat/completions", "file:///tmp/key", "https://provider.example/v1\\wrong",
  ]) assert.throws(() => readFeatureConfig("reading", env("READING", { AI_READING_BASE_URL: url })), { code: "INVALID_AI_CONFIG" });
});

test("allows loopback HTTP for development only", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const value = env("READING", { AI_READING_BASE_URL: `http://${host}:7777/v1`, NODE_ENV: "development" });
    assert.equal(readFeatureConfig("reading", value).baseUrl, `http://${host}:7777/v1/`);
    assert.throws(() => readFeatureConfig("reading", { ...value, NODE_ENV: "production" }), { code: "INVALID_AI_CONFIG" });
  }
});

test("validates all configured numeric and enumerated parameters", () => {
  const invalid = {
    TEMPERATURE: ["-1", "2.1", "NaN", "Infinity", "null"],
    MAX_OUTPUT_TOKENS: ["0", "8193", "1.5", "Infinity", "bad"],
    TIMEOUT_MS: ["999", "120001", "1.5", "bad"],
    RESPONSE_FORMAT: ["text", "json", "xml"],
    TOKEN_LIMIT_FIELD: ["max_output_tokens", "both"],
    REASONING_EFFORT: ["unlimited", "0"],
  };
  for (const [key, values] of Object.entries(invalid)) {
    for (const value of values) assert.throws(() => readFeatureConfig("reading", env("READING", { [`AI_READING_${key}`]: value })), { code: "INVALID_AI_CONFIG" });
  }
});

test("does not expose secret env values in configuration errors", () => {
  for (const [key, value] of [["API_KEY", "PRIVATE-KEY\r\nheader"], ["BASE_URL", "https://private:PRIVATE-KEY@provider.example"], ["MODEL", "invalid\nmodel"]]) {
    assert.throws(() => readFeatureConfig("reading", env("READING", { [`AI_READING_${key}`]: value })), error => {
      assert.equal(error.code, "INVALID_AI_CONFIG");
      assert.equal(JSON.stringify(error).includes("PRIVATE-KEY"), false);
      assert.equal(String(error).includes("PRIVATE-KEY"), false);
      return true;
    });
  }
});
