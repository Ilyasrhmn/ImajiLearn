import { studioRequest } from "./studio-api.mjs";
import { isTemporaryAIError, waitForAI } from "@imajilearn/shared/lib/ai-wait.mjs";

export async function waitForSong(teacherId, path, { signal, onProgress, onUpdate, immediate = false, includeAlignment = false } = {}) {
  while (true) {
    signal?.throwIfAborted();
    if (!immediate) await waitForAI(signal);
    immediate = false;
    let data;
    try {
      ({ data } = await studioRequest(teacherId, path, { signal }));
    } catch (error) {
      // Polling only reads the saved task; it never submits another paid song.
      if (!isTemporaryAIError(error)) throw error;
      onProgress?.({ waiting: true });
      continue;
    }
    if (!data) throw new Error("Status lagu belum tersedia. Buka ulang draf.");
    onUpdate?.(data);
    if (["failed", "uncertain"].includes(data.status) || (data.status === "ready" && !(includeAlignment && data.alignmentPending))) return data;
    onProgress?.({ waiting: true });
  }
}
