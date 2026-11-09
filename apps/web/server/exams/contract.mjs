import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";
import { COGNITIVE_LEVELS, DIFFICULTIES, QUESTION_FORMS, validateExamConfig } from "../../lib/exams.mjs";
import { canonicalMaterialId } from "../materials/readers.mjs";

const headerFields = { school: 200, district: 200, subject: 100, grade: 20, semester: 20, minutes: 3 };
const questionText = ["prompt", "answer", "explanation", "rubric", "topic", "learningOutcome", "indicator"];
const questionFields = ["id", "number", "form", "difficulty", "options", "cognitiveLevel", "maxScore", ...questionText];

function fieldText(value, field, max, options) {
  const result = text(value, field, max, options);
  if (result.includes("\0") || !result.isWellFormed()) {
    throw new ContractError("Isian naskah tidak valid.", { [field]: "Hapus karakter yang tidak valid." });
  }
  return result;
}

export function parseExamConfig(input, teacher) {
  object(input, ["type", "grade", "subject", "semester", "minutes", "difficulty", "counts", "materialIds", "summary"]);
  const { type, grade = teacher.grade || "4", semester = "1", minutes = 60, difficulty = "mixed",
    counts = { multipleChoice: 5, shortAnswer: 3, essay: 2 }, materialIds = [], summary = "" } = input;
  object(counts, Object.keys(QUESTION_FORMS));
  if (!Array.isArray(materialIds) || materialIds.length > 30) throw new ContractError("Pilih maksimal 30 materi.");
  const canonicalIds = materialIds.map(canonicalMaterialId);
  if (canonicalIds.includes(null) || new Set(canonicalIds).size !== canonicalIds.length) {
    throw new ContractError("ID materi tidak valid atau berulang.");
  }
  if (typeof grade !== "string") throw new ContractError("Pilih kelas 1–6.");
  if (typeof type !== "string" || typeof difficulty !== "string") throw new ContractError("Jenis atau tingkat naskah tidak valid.");
  const config = { type, grade, subject: fieldText(input.subject, "subject", 100), semester, minutes, difficulty,
    counts: Object.fromEntries(Object.keys(QUESTION_FORMS).map(form => [form, counts[form]])), materialIds: canonicalIds,
    summary: fieldText(summary, "summary", 20000, { min: 0 }) };
  const error = validateExamConfig(config);
  if (error) throw new ContractError(error);
  return config;
}

export function parseExamPatch(input, exam) {
  object(input, ["title", "header", "questions"]);
  if (!Object.keys(input).length) throw new ContractError("Tidak ada perubahan naskah.");
  const next = { ...exam };
  if (Object.hasOwn(input, "title")) next.title = fieldText(input.title, "title", 120);
  if (Object.hasOwn(input, "header")) {
    object(input.header, Object.keys(headerFields));
    next.header = { ...exam.header };
    for (const [field, max] of Object.entries(headerFields)) {
      if (!Object.hasOwn(input.header, field)) continue;
      const value = fieldText(input.header[field], `header.${field}`, max, { min: 0 });
      if (field === "minutes" && !/^\d{0,3}$/.test(value)) throw new ContractError("Isi waktu dengan maksimal tiga digit.");
      next.header[field] = value;
    }
  }
  if (Object.hasOwn(input, "questions")) {
    if (!Array.isArray(input.questions) || input.questions.length !== exam.questions.length) {
      throw new ContractError("Jumlah soal tidak dapat diubah.");
    }
    next.questions = input.questions.map((question, index) => {
      object(question, questionFields);
      const original = exam.questions[index];
      const field = `questions.${index}`;
      if (question.id !== original.id || question.number !== original.number || question.form !== original.form) {
        throw new ContractError("Identitas dan jenis soal tidak dapat diubah.", { [field]: "Muat ulang naskah." });
      }
      if (typeof question.difficulty !== "string" || question.difficulty === "mixed" || !Object.hasOwn(DIFFICULTIES, question.difficulty) ||
          typeof question.cognitiveLevel !== "string" || !Object.hasOwn(COGNITIVE_LEVELS, question.cognitiveLevel)) {
        throw new ContractError("Tingkat soal tidak valid.");
      }
      if (!Number.isFinite(question.maxScore) || question.maxScore < 0 || question.maxScore > 1000 ||
          !Number.isInteger(question.maxScore * 2)) throw new ContractError("Bobot soal harus kelipatan 0,5 dalam rentang 0–1000.");
      if (!Array.isArray(question.options) || question.options.length !== original.options.length) {
        throw new ContractError("Jumlah opsi soal tidak sesuai.");
      }
      const options = question.options.map(value => fieldText(value, `${field}.options`, 12000, { min: 0, trim: false }));
      const values = Object.fromEntries(questionText.map(key => [key,
        fieldText(question[key], `${field}.${key}`, 12000, { min: 0, trim: false })]));
      if (question.form === "multipleChoice" && values.answer && !"ABCD".slice(0, options.length).split("").includes(values.answer)) {
        throw new ContractError("Kunci jawaban pilihan ganda tidak valid.");
      }
      return { ...question, ...values, options };
    });
  }
  if (Buffer.byteLength(JSON.stringify(next), "utf8") > 4 * 1024 * 1024) throw new ContractError("Naskah melebihi batas penyimpanan.");
  return next;
}
