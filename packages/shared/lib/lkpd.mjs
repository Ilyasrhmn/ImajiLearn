import { createId } from "./id.mjs";
export const LKPD_KEY = "imajilearn-lkpd-v1";
export const LKPD_LIMIT = 20;
export const lkpdTemplates = [
  { id: "fold", label: "Buku lipat", action: "Buka jendela, temukan isinya.", capacities: [4] },
  { id: "match", label: "Potong & tempel", action: "Pasangkan bagian pada tempatnya.", capacities: [4, 5, 6] },
  { id: "cube", label: "Rakit bentuk", action: "Potong dan lipat menjadi kubus.", capacities: [6] },
  { id: "sequence", label: "Susun urutan", action: "Susun potongan menjadi rangkaian.", capacities: [4, 6] },
  { id: "group", label: "Kelompokkan kartu", action: "Temukan kelompok setiap kartu.", capacities: [6, 9] },
];
export const lkpdAssets = Object.fromEntries(["star", "chain", "banyan", "buffalo", "rice-cotton"].map((id, i) => [`pancasila-${i + 1}`, { src: `/lkpd/pancasila/${id}.svg`, inkSrc: `/lkpd/pancasila/${id}-ink.svg`, label: ["Bintang", "Rantai", "Pohon beringin", "Kepala banteng", "Padi dan kapas"][i] }]));
const string = (value, max, empty = false) => typeof value === "string" && value.length <= max && (empty || value.trim().length > 0);
const strings = (values, maxItems, length) => Array.isArray(values) && values.length > 0 && values.length <= maxItems && values.every(value => string(value, length));
const exactIds = (ids, expected) => Array.isArray(ids) && ids.length === expected.length && new Set(ids).size === expected.length && ids.every(id => expected.includes(id));

function revision(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function makeLkpdRequest(source, templateId, grade = "") {
  if (!source || !string(source.id, 100) || !string(source.title, 120)) throw new Error("Pilih materi terlebih dahulu.");
  if (!lkpdTemplates.some(template => template.id === templateId)) throw new Error("Pilih aktivitas yang tersedia.");
  const text = typeof source.text === "string" ? source.text.slice(0, 40000) : "";
  if (!text.trim()) throw new Error("Isi materi belum terbaca. Coba unggah ulang sumbernya.");
  const sourceRevision = revision(`${source.id}|${source.title}|${source.fileName || ""}|${text}`);
  return { version: 1, templateId, templateVersion: 1, assetVersion: 1, source: { id: source.id, title: source.title, fileName: source.fileName || "", text, revision: sourceRevision }, grade: /^[1-6]$/.test(String(grade)) ? String(grade) : "", mode: "individual", cacheKey: `${sourceRevision}:${templateId}:1:1:${grade}:id:v1` };
}

export function validateLkpdContent(value, templateId) {
  const template = lkpdTemplates.find(item => item.id === templateId);
  if (!template || !value || value.templateId !== templateId) return "Jenis aktivitas pada hasil tidak sesuai.";
  if (!string(value.title, 90) || !strings(value.instructions, 3, 140)) return "Judul atau petunjuk hasil belum lengkap.";
  if (!Array.isArray(value.items) || !template.capacities.includes(value.items.length)) return "Jumlah bagian pada hasil tidak sesuai pola.";
  const ids = value.items.map(item => item?.id);
  if (new Set(ids).size !== ids.length || value.items.some(item => !item || !string(item.id, 60) || !string(item.front, 64, templateId === "cube") || !string(item.back, 180, templateId !== "fold") || (item.assetId !== null && !Object.hasOwn(lkpdAssets, item.assetId)))) return "Isi atau gambar pada hasil belum sesuai.";
  if (!Array.isArray(value.pairs) || !Array.isArray(value.order) || !Array.isArray(value.groups)) return "Susunan jawaban hasil belum lengkap.";
  if (templateId === "match") {
    if (!exactIds(value.pairs.map(pair => pair?.itemId), ids) || value.pairs.some(pair => !string(pair.target, 110))) return "Pasangan hasil tidak lengkap.";
  } else if (value.pairs.length) return "Pasangan tidak sesuai jenis aktivitas.";
  if (templateId === "sequence") { if (!exactIds(value.order, ids)) return "Urutan hasil tidak lengkap."; }
  else if (value.order.length) return "Urutan tidak sesuai jenis aktivitas.";
  if (templateId === "group") {
    if (value.groups.length !== ids.length / 3 || ![2, 3].includes(value.groups.length) || value.groups.some(group => !group || !string(group.id, 60) || !string(group.label, 48) || !Array.isArray(group.itemIds) || group.itemIds.length !== 3) || new Set(value.groups.map(group => group.id)).size !== value.groups.length || new Set(value.groups.map(group => group.label.trim().toLowerCase())).size !== value.groups.length || !exactIds(value.groups.flatMap(group => group.itemIds), ids)) return "Kelompok hasil tidak lengkap.";
  } else if (value.groups.length) return "Kelompok tidak sesuai jenis aktivitas.";
  if (!value.teacher || !strings(value.teacher.preparation, 5, 160) || !string(value.teacher.notes, 600, true)) return "Panduan guru hasil belum lengkap.";
  return "";
}

export function createLkpd(request, content) {
  const error = validateLkpdContent(content, request.templateId);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  const displayOrder = content.items.map(item => item.id);
  if (["match", "sequence", "group"].includes(request.templateId)) {
    for (let i = displayOrder.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [displayOrder[i], displayOrder[j]] = [displayOrder[j], displayOrder[i]];
    }
    if (displayOrder.every((id, i) => id === content.items[i].id)) displayOrder.push(displayOrder.shift());
  }
  return { version: 1, id: createId(), source: { id: request.source.id, title: request.source.title, revision: request.source.revision }, templateId: request.templateId, templateVersion: 1, grade: request.grade, theme: "ink", content: structuredClone(content), displayOrder, createdAt: now, updatedAt: now, cacheKey: request.cacheKey };
}
export function parseLkpds(raw) {
  try {
    if (typeof raw !== "string" || raw.length > 2000000) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(doc => doc && doc.version === 1 && doc.templateVersion === 1 && string(doc.id, 100) && string(doc.createdAt, 50) && string(doc.updatedAt, 50) && string(doc.cacheKey, 160) && doc.source && string(doc.source.id, 100) && string(doc.source.title, 120) && string(doc.source.revision, 30) && ["ink", "color"].includes(doc.theme) && (doc.grade === "" || /^[1-6]$/.test(doc.grade)) && !validateLkpdContent(doc.content, doc.templateId) && exactIds(doc.displayOrder, doc.content.items.map(item => item.id))).slice(0, LKPD_LIMIT);
  } catch { return []; }
}

const cells = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]];
const side = 32;
const faces = cells.map(([col, row], index) => ({ index, col, row, x: 12 + col * side, y: 10 + row * side, size: side }));
const edges = face => ({ top: [[face.x, face.y], [face.x + side, face.y]], right: [[face.x + side, face.y], [face.x + side, face.y + side]], bottom: [[face.x + side, face.y + side], [face.x, face.y + side]], left: [[face.x, face.y + side], [face.x, face.y]] });
const edgeKey = points => points.map(point => point.join(",")).sort().join("|");
const shared = new Map();
for (const face of faces) for (const points of Object.values(edges(face))) { const key = edgeKey(points); shared.set(key, [...(shared.get(key) || []), points]); }
const tabPositions = [[0, "top"], [0, "left"], [0, "right"], [1, "left"], [1, "bottom"], [3, "right"], [3, "bottom"]];
const tabs = tabPositions.map(([index, name]) => {
  const [a, b] = edges(faces[index])[name];
  const dx = (b[0] - a[0]) / side, dy = (b[1] - a[1]) / side;
  return { face: index, edge: name, base: [a, b], points: [a, [a[0] + dx * 3 + dy * 5, a[1] + dy * 3 - dx * 5], [b[0] - dx * 3 + dy * 5, b[1] - dy * 3 - dx * 5], b] };
});
const tabKeys = new Set(tabs.map(tab => edgeKey(tab.base)));
export const cubeNet = { faces, tabs, folds: [...shared.values()].filter(group => group.length === 2).map(group => group[0]), cuts: [...shared.entries()].filter(([key, group]) => group.length === 1 && !tabKeys.has(key)).map(([, group]) => group[0]) };
