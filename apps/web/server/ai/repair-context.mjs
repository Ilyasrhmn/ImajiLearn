import { AsyncLocalStorage } from "node:async_hooks";
import { aiCorrection, aiRepairHeader } from "@imajilearn/shared/lib/ai-repair.mjs";

const repairs = new AsyncLocalStorage();

export function runWithAIRepair(request, handler) {
  const code = request.method === "POST" ? request.headers.get(aiRepairHeader) : null;
  return repairs.run(aiCorrection(code) ? code : null, handler);
}

export function repairAIRequest(request) {
  const code = repairs.getStore(), correction = aiCorrection(code);
  if (!correction) return request;
  const index = request.messages.findIndex(message => message.role === "system");
  if (index < 0) return request;
  const messages = request.messages.map((message, position) => position === index
    ? { ...message, content: `${message.content}\n\nPerbaikan otomatis (${code}): ${correction}\nGunakan sumber dan kontrak asli. Jangan menambah fakta untuk sekadar meloloskan validasi.` }
    : message);
  return { ...request, messages };
}
