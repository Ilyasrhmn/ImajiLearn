import { AIError } from "../errors.mjs";

const byteLimit = 256 * 1024;
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

export async function requestJson(config, request, transport = fetch) {
  if (config.kind !== "text") throw new AIError("UNSUPPORTED_MODALITY");
  if (config.protocol !== "openai-chat") throw new AIError("INVALID_AI_CONFIG");
  const body = buildBody(config, request);
  if (request.signal?.aborted) throw new AIError("CANCELED");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs);
  try {
    const response = await transport(new URL("chat/completions", config.baseUrl), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body, signal: controller.signal, redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      const code = [401, 403].includes(response.status) ? "PROVIDER_AUTH_ERROR" : response.status === 429 ? "RATE_LIMITED" :
        response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REQUEST_REJECTED";
      throw new AIError(code, { status: response.status });
    }
    const payload = await readJson(response);
    controller.signal.throwIfAborted();
    return parseCompletion(payload, config);
  } catch (error) {
    if (request.signal?.aborted) throw new AIError("CANCELED");
    if (timedOut) throw new AIError("PROVIDER_TIMEOUT");
    if (error instanceof AIError) throw error;
    // An interrupted request may already have been billed; retry belongs to the job budget.
    throw new AIError("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancel);
  }
}
