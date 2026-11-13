import { isBlankExamQuestion } from "./exams.mjs";
import { studioRequest } from "./studio-api.mjs";

export async function generateExamQuestions(teacherId, exam, { signal, onDocument, onProgress }) {
  const total = exam.questions.filter(isBlankExamQuestion).length;
  let current = exam, remaining = total;
  while (remaining && !signal.aborted) {
    const { data } = await studioRequest(teacherId, `/exams/${encodeURIComponent(exam.id)}/generate`, {
      method: "POST", version: current.resourceVersion, signal,
    });
    current = data;
    onDocument(data);
    const next = data.questions.filter(isBlankExamQuestion).length;
    if (next >= remaining) break;
    remaining = next;
    onProgress({ filled: total - remaining, total });
  }
  return current;
}
