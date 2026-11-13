import { studioRequest } from "./studio-api.mjs";
import { createId } from "./id.mjs";
import { aiCorrection } from "./ai-repair.mjs";

export async function studioAIRequest(teacherId, path, { onRepair, ...options } = {}) {
  const key = options.key ?? createId();
  let repairCode;
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return await studioRequest(teacherId, path, { ...options, key, repairCode });
    } catch (error) {
      if (options.method !== "POST" || !aiCorrection(error.code) || attempt >= 2) throw error;
      repairCode = error.code;
      onRepair?.({ waiting: true, repairing: true, attempt: attempt + 1 });
    }
  }
}
