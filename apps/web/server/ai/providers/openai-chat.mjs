import { AIError } from "../errors.mjs";
import { setTimeout as delay } from "node:timers/promises";

const byteLimit = 256 * 1024;
const transientStatuses = new Set([500, 502, 503, 504]);
const connectionFailures = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function buildBody(config, request) {
  if (!isObject(request) || Object.keys(request).some(key => !["messages", "schema", "signal"].includes(key)) ||
    !Array.isArray(request.messages) || request.messages.length < 1 || request.messages.length > 8 ||
    request.messages.some(message => !isObject(message) || Object.keys(message).length !== 2 ||
      !["system", "developer", "user"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) ||
    (request.signal !== undefined && !(request.signal instanceof AbortSignal))) {
    throw new AIError("INVALID_AI_INPUT");
  }
  const body = {
    model: config.model, messages: request.messages,
    [config.tokenLimitField]: config.maxOutputTokens,
    response_format: { type: config.responseFormat }, stream: false,
  };
  if (config.temperature !== undefined) body.temperature = config.temperature;
  if (config.reasoningEffort !== undefined) body.reasoning_effort = config.reasoningEffort;
  if (config.responseFormat === "json_schema") {
    if (!isObject(request.schema)) throw new AIError("INVALID_AI_INPUT", { field: "schema" });
    body.response_format.json_schema = { name: `${config.feature}_result`, strict: true, schema: request.schema };
  }
  if (config.protocol === "openai-responses") {
    const format = config.responseFormat === "json_schema"
      ? { type: "json_schema", ...body.response_format.json_schema } : { type: "json_object" };
    for (const key of ["messages", "max_tokens", "max_completion_tokens", "response_format", "reasoning_effort"]) delete body[key];
    body.input = request.messages;
    body.text = { format };
    if (config.reasoningEffort !== undefined) body.reasoning = { effort: config.reasoningEffort };
    if (config.model === "deepseek-v4-1-flash") {
      delete body.temperature;
    } else body.max_output_tokens = config.maxOutputTokens;
  }
  let serialized;
  try { serialized = JSON.stringify(body); } catch { throw new AIError("INVALID_AI_INPUT"); }
  if (Buffer.byteLength(serialized, "utf8") > byteLimit) throw new AIError("INPUT_TOO_LARGE");
  return serialized;
}

function usageOf(value) {
  const tokenCount = number => Number.isSafeInteger(number) && number >= 0 ? number : null;
  const inputTokens = tokenCount(value?.prompt_tokens);
  const outputTokens = tokenCount(value?.completion_tokens);
  const totalTokens = tokenCount(value?.total_tokens);
  return { inputTokens, outputTokens, totalTokens, providerReported: [inputTokens, outputTokens, totalTokens].some(value => value !== null) };
}

async function readJson(response) {
  if (!response.body) throw new AIError("INVALID_PROVIDER_RESPONSE");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > byteLimit) {
        await reader.cancel();
        throw new AIError("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const bytes = Buffer.concat(chunks, size);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw new AIError("INVALID_PROVIDER_RESPONSE"); }
}

function parseCompletion(payload, config) {
  const usage = usageOf(payload?.usage);
  const fail = code => { throw new AIError(code, { usage }); };
  if (!Array.isArray(payload?.choices) || payload.choices.length !== 1) fail("INVALID_PROVIDER_RESPONSE");
  const choice = payload.choices[0];
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") fail("PROVIDER_REFUSAL");
  if (choice?.finish_reason === "length") fail("INCOMPLETE_OUTPUT");
  if (choice?.finish_reason !== "stop" || choice.message?.tool_calls?.length || choice.message?.function_call ||
    typeof choice.message?.content !== "string" || !choice.message.content.trim()) fail("INVALID_PROVIDER_RESPONSE");
  let content;
  try { content = JSON.parse(choice.message.content); } catch { fail("INVALID_PROVIDER_RESPONSE"); }
  if (!isObject(content)) fail("INVALID_PROVIDER_RESPONSE");
  return { content, usage, meta: { feature: config.feature, model: config.model, protocol: config.protocol, finishReason: "stop" } };
}

function parseResponse(payload, config) {
  const usage = {
    prompt_tokens: payload?.usage?.input_tokens, completion_tokens: payload?.usage?.output_tokens,
    total_tokens: payload?.usage?.total_tokens,
  };
  if (payload?.status === "incomplete") throw new AIError("INCOMPLETE_OUTPUT", { usage: usageOf(usage) });
  if (!Array.isArray(payload?.output)) throw new AIError("INVALID_PROVIDER_RESPONSE");
  const parts = payload.output.flatMap(item => item.content ?? []);
  if (parts.some(part => part.type === "refusal")) throw new AIError("PROVIDER_REFUSAL");
  if (payload.status !== "completed" || payload.output.some(item => !["message", "reasoning"].includes(item.type))) {
    throw new AIError("INVALID_PROVIDER_RESPONSE", { usage: usageOf(usage) });
  }
  const content = parts.filter(part => part.type === "output_text").map(part => part.text).join("");
  return parseCompletion({ usage, choices: [{ finish_reason: "stop", message: { content } }] }, config);
}

export async function requestJson(config, request, transport = fetch) {
  if (config.kind !== "text") throw new AIError("UNSUPPORTED_MODALITY");
  if (!["openai-chat", "openai-responses"].includes(config.protocol)) throw new AIError("INVALID_AI_CONFIG");
  const body = buildBody(config, request);
  if (request.signal?.aborted) throw new AIError("CANCELED");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs);
  try {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      controller.signal.throwIfAborted();
      let connectionCode;
      try {
        response = await transport(new URL(config.protocol === "openai-responses" ? "responses" : "chat/completions", config.baseUrl), {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
          body, signal: controller.signal, redirect: "error", cache: "no-store",
        });
      } catch (error) {
        // Retry only failures before connection; an interrupted response may already be billed.
        if (attempt || !connectionFailures.has(error.cause?.code)) throw error;
        connectionCode = error.cause.code;
      }
      if (response && (attempt || !transientStatuses.has(response.status))) break;
      console.warn("[ai-provider] Retrying transient failure", {
        feature: config.feature, status: response?.status ?? null, transport: connectionCode ?? null,
      });
      await response?.body?.cancel().catch(() => {});
      response = undefined;
      await delay(750 + Math.floor(Math.random() * 250), undefined, { signal: controller.signal });
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const code = [401, 403].includes(response.status) ? "PROVIDER_AUTH_ERROR" : response.status === 429 ? "RATE_LIMITED" :
        response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REQUEST_REJECTED";
      throw new AIError(code, { status: response.status });
    }
    const payload = await readJson(response);
    controller.signal.throwIfAborted();
    if (config.protocol === "openai-responses" && (payload?.error || Number(payload?.code) >= 400)) {
      const status = Number(payload.code ?? payload.error?.code);
      throw new AIError(status === 429 ? "RATE_LIMITED" : [401, 403].includes(status) ? "PROVIDER_AUTH_ERROR" : "PROVIDER_UNAVAILABLE");
    }
    return config.protocol === "openai-responses" ? parseResponse(payload, config) : parseCompletion(payload, config);
  } catch (error) {
    if (request.signal?.aborted) throw new AIError("CANCELED");
    if (timedOut) throw new AIError("PROVIDER_TIMEOUT");
    if (!(error instanceof AIError) || error.code === "PROVIDER_UNAVAILABLE") {
      const transportCode = error.cause?.code;
      console.warn("[ai-provider] Request failed", {
        feature: config.feature,
        status: error instanceof AIError ? error.status ?? null : null,
        transport: typeof transportCode === "string" && /^[A-Z0-9_]{1,40}$/.test(transportCode) ? transportCode : null,
      });
    }
    if (error instanceof AIError) throw error;
    // Do not retry uncertain outcomes, malformed output, or rejected requests.
    throw new AIError("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancel);
  }
}
