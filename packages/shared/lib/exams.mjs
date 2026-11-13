import { createId } from "./id.mjs";
export const EXAMS_KEY = "imajilearn-exams-v1";
export const EXAM_LIMIT = 20;
export function examOptionText(option, index) {
  return option.replace(new RegExp(`^\\s*${String.fromCharCode(65 + index)}[.)]\\s+`), "");
}
export const EXAM_TYPES = { daily: "Ulangan Harian", midterm: "PTS / UTS", final: "PAS / UAS", remedial: "Remedial" };
export const DIFFICULTIES = { easy: "Mudah", medium: "Sedang", hard: "Sulit", mixed: "Campuran" };
export const QUESTION_FORMS = { multipleChoice: "Pilihan ganda", shortAnswer: "Isian singkat", essay: "Uraian" };
export const COGNITIVE_LEVELS = { C1: "Mengingat", C2: "Memahami", C3: "Menerapkan", C4: "Menganalisis" };
export const initialExamConfig = () => ({ type: "daily", grade: "4", subject: "", semester: "1", minutes: 60, difficulty: "mixed", counts: { multipleChoice: 5, shortAnswer: 3, essay: 2 }, materialIds: [], summary: "" });

export function validateExamConfig(config) {
  if (config?.difficulty !== undefined && !Object.hasOwn(DIFFICULTIES, config.difficulty)) return "Pilih tingkat kesulitan.";
  if (!config || !Object.hasOwn(EXAM_TYPES, config.type)) return "Pilih jenis ujian.";
  if (!/^[1-6]$/.test(String(config.grade))) return "Pilih kelas 1–6.";
  if (!Array.isArray(config.materialIds) || config.materialIds.length > 30 || config.materialIds.some(id => !text(id, 100))) return "Pilih materi yang tersedia.";
  if (typeof config.summary !== "string" || config.summary.length > 20000) return "Ringkasan maksimal 20.000 karakter.";
  if (!config.materialIds.length && !config.summary.trim()) return "Pilih materi atau tulis ringkasan materi.";
  if (typeof config.subject !== "string" || !config.subject.trim() || config.subject.length > 100) return "Isi mata pelajaran.";
  if (!["1", "2"].includes(config.semester)) return "Pilih semester.";
  if (!Number.isInteger(config.minutes) || config.minutes < 10 || config.minutes > 240) return "Waktu ujian 10–240 menit.";
  if (!config.counts || Object.keys(config.counts).some(key => !Object.hasOwn(QUESTION_FORMS, key))) return "Periksa jumlah soal.";
  const counts = Object.keys(QUESTION_FORMS).map(key => config.counts?.[key]);
  if (counts.some(n => !Number.isInteger(n) || n < 0 || n > 50)) return "Jumlah tiap jenis soal harus 0–50.";
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total < 1 || total > 80) return "Siapkan 1–80 soal dalam satu naskah.";
  return "";
}

export function createExam(config, profile = {}) {
  const error = validateExamConfig(config);
  if (error) throw new Error(error);
  const total = Object.values(config.counts).reduce((sum, n) => sum + n, 0);
  const questions = [];
  const levels = difficultyPlan(total, config.difficulty || "mixed");
  for (const form of Object.keys(QUESTION_FORMS)) {
    for (let i = 0; i < config.counts[form]; i++) {
      const number = questions.length + 1;
      questions.push({ id: createId(), number, form, difficulty: levels[number - 1], prompt: "", options: form === "multipleChoice" ? Array(Number(config.grade) <= 2 ? 3 : 4).fill("") : [], answer: "", explanation: "", rubric: "", topic: "", learningOutcome: "", indicator: "", cognitiveLevel: "C1", maxScore: Math.floor(100 / total) + (number <= 100 % total ? 1 : 0) });
    }
  }
  const now = new Date().toISOString();
  return { id: createId(), version: 1, createdAt: now, updatedAt: now, config: { ...structuredClone(config), difficulty: config.difficulty || "mixed" }, header: { school: profile.school || "", district: "", subject: config.subject || "", grade: String(config.grade), semester: config.semester, minutes: String(config.minutes) }, questions };
}

const text = (value, max = 12000) => typeof value === "string" && value.length <= max;
export function parseExams(raw) {
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    return saved.filter(exam => exam && exam.version === 1 && text(exam.id, 100) && text(exam.updatedAt, 50) && text(exam.createdAt, 50) && !validateExamConfig(exam.config)
      && (exam.title === undefined || text(exam.title, 120))
      && exam.header && ["school", "district", "subject", "grade", "semester", "minutes"].every(key => text(exam.header[key], 200))
      && Array.isArray(exam.questions) && exam.questions.length === Object.values(exam.config.counts).reduce((sum, n) => sum + n, 0)
      && exam.questions.every((q, i) => q && text(q.id, 100) && q.number === i + 1 && Object.hasOwn(QUESTION_FORMS, q.form)
        && ["prompt", "answer", "explanation", "rubric", "topic", "learningOutcome", "indicator"].every(key => text(q[key]))
        && (q.difficulty === undefined || ["easy", "medium", "hard"].includes(q.difficulty))
        && Object.hasOwn(COGNITIVE_LEVELS, q.cognitiveLevel) && Number.isFinite(q.maxScore) && q.maxScore >= 0 && q.maxScore <= 1000
        && Array.isArray(q.options) && q.options.length === (q.form === "multipleChoice" ? Number(exam.config.grade) <= 2 ? 3 : 4 : 0) && q.options.every(option => text(option)))).slice(0, EXAM_LIMIT).map(exam => ({...exam, config:{...exam.config,difficulty:exam.config.difficulty || "mixed"},questions:exam.questions.map(q=>({...q,difficulty:q.difficulty || "medium"}))}));
  } catch { return []; }
}

export function copyRemedial(exam) {
  const copied = structuredClone(exam);
  copied.id = createId();
  copied.config.type = "remedial";
  delete copied.title;
  copied.createdAt = copied.updatedAt = new Date().toISOString();
  return copied;
}

export function finalGrade(score, maximum) { return maximum > 0 ? Math.round(score / maximum * 100) : 0; }

export function isBlankExamQuestion(question) {
  return [question.prompt, question.answer, question.explanation, question.rubric, question.topic,
    question.learningOutcome, question.indicator, ...question.options].every(value => !value.trim());
}

export function examRequest(config, materials) {
  const error = validateExamConfig(config);
  if (error) throw new Error(error);
  return { type: config.type, difficulty: config.difficulty || "mixed", difficultyPlan: difficultyPlan(Object.values(config.counts).reduce((a,b)=>a+b,0), config.difficulty || "mixed"), grade: Number(config.grade), subject: config.subject, optionCount: Number(config.grade) <= 2 ? 3 : 4, counts: { ...config.counts }, summary: config.summary.trim(), sources: materials.filter(material => config.materialIds.includes(material.id)).map(({ id, title, text }) => ({ id, title, text })) };
}

export function examTitle(exam) {
  return exam.title?.trim() || `${EXAM_TYPES[exam.config.type]}${exam.header.subject ? ` · ${exam.header.subject}` : ""}`;
}

export function duplicateExam(exam) {
  const copy = structuredClone(exam);
  copy.id = createId();
  copy.title = `${examTitle(exam)} (salinan)`.slice(0, 120);
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  copy.questions.forEach(question => { question.id = createId(); });
  return copy;
}

export function filterExams(exams, { query = "", grade = "", subject = "", sort = "newest" } = {}) {
  const needle = query.trim().toLocaleLowerCase("id");
  return exams.filter(exam => (!grade || String(exam.config.grade) === grade)
    && (!subject || exam.header.subject === subject)
    && (!needle || `${examTitle(exam)} ${exam.header.school} ${exam.header.subject}`.toLocaleLowerCase("id").includes(needle)))
    .sort((a, b) => sort === "name" ? examTitle(a).localeCompare(examTitle(b), "id") : sort === "oldest" ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt));
}

export function difficultyPlan(total, difficulty = "mixed") {
  if (!Number.isInteger(total) || total < 1 || total > 80 || !Object.hasOwn(DIFFICULTIES, difficulty)) throw new Error("Periksa jumlah dan kesulitan soal.");
  if (difficulty !== "mixed") return Array(total).fill(difficulty);
  const parts = [0.3,0.5,0.2].map((ratio,index)=>({index,count:Math.floor(total*ratio),remainder:total*ratio-Math.floor(total*ratio)}));
  const remaining=total-parts.reduce((sum,part)=>sum+part.count,0);
  [...parts].sort((a,b)=>b.remainder-a.remainder || a.index-b.index).slice(0,remaining).forEach(part=>part.count++);
  return parts.flatMap(part=>Array(part.count).fill(["easy","medium","hard"][part.index]));
}
