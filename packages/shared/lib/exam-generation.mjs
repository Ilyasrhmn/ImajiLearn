import { isBlankExamQuestion } from "./exams.mjs";
import { studioRequest } from "./studio-api.mjs";
import { studioAIRequest } from "./ai-request.mjs";
import { isTemporaryAIError, waitForAI } from "./ai-wait.mjs";

export async function generateExamQuestions(teacherId, exam, { signal, onDocument, onProgress }) {
  const total = exam.questions.filter(isBlankExamQuestion).length;
  let current = exam, remaining = total;
  while (remaining && !signal.aborted) {
    let data;
    try {
      ({ data } = await studioAIRequest(teacherId, `/exams/${encodeURIComponent(exam.id)}/generate`, {
        method: "POST", version: current.resourceVersion, signal,
      }));
    } catch (error) {
      if (!isTemporaryAIError(error) && error.code !== "EXAM_GENERATION_IN_PROGRESS") throw error;
      await waitForAI(signal, error.retryAfterSeconds ?? (error.status === 429 ? 60 : 5));
      if (error.code === "EXAM_GENERATION_IN_PROGRESS" || [502, 504].includes(error.status)) {
        const latest = await studioRequest(teacherId, `/exams/${encodeURIComponent(exam.id)}`, { signal });
        current = latest.data;
        onDocument(current);
        remaining = current.questions.filter(isBlankExamQuestion).length;
        onProgress({ filled: total - remaining, total });
      }
      continue;
    }
    current = data;
    onDocument(data);
    const next = data.questions.filter(isBlankExamQuestion).length;
    if (next >= remaining) break;
    remaining = next;
    onProgress({ filled: total - remaining, total });
  }
  return current;
}
