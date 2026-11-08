export const WORKSHEET_LIMIT = 20;
export const CONTENT_CHARACTER_LIMIT = 30_000;
export const TEMPLATE_CAPACITIES = Object.freeze({
  fold: Object.freeze([4]),
  match: Object.freeze([4, 5, 6]),
  cube: Object.freeze([6]),
  sequence: Object.freeze([4, 6]),
  group: Object.freeze([6, 9]),
});
const assets = new Set(Array.from({ length: 5 }, (_, i) => `pancasila-${i + 1}`));

export class WorksheetValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "WorksheetValidationError";
    this.code = "INVALID_WORKSHEET";
    this.fields = { [field]: message };
  }
}

function requireValue(condition, field, message = "Nilai LKPD tidak sesuai.") {
  if (!condition) throw new WorksheetValidationError(field, message);
}

function object(value, keys, field) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), field);
  requireValue(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), field,
    "Isian LKPD tidak lengkap atau memuat field yang tidak diizinkan.");
}

function string(value, max, field, empty = false) {
  requireValue(typeof value === "string" && value.length <= max && (empty || value.trim().length > 0), field);
}

function strings(value, maxItems, maxLength, field) {
  requireValue(Array.isArray(value) && value.length >= 1 && value.length <= maxItems, field);
  value.forEach((item, i) => string(item, maxLength, `${field}.${i}`));
}

export function validateDisplayOrder(order, ids) {
  requireValue(Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length &&
    order.every(id => ids.includes(id)), "displayOrder", "Urutan harus mencakup setiap kartu tepat sekali.");
}

export function validateWorksheetContent(content, templateId) {
  requireValue(Object.hasOwn(TEMPLATE_CAPACITIES, templateId), "templateId", "Jenis aktivitas tidak tersedia.");
  let serialized;
  try { serialized = JSON.stringify(content); } catch {
    throw new WorksheetValidationError("content", "Isi LKPD harus berupa JSON.");
  }
  requireValue(typeof serialized === "string" && serialized.length <= CONTENT_CHARACTER_LIMIT, "content",
    "Isi LKPD maksimal 30.000 karakter JSON.");
  object(content, ["templateId", "title", "instructions", "items", "pairs", "order", "groups", "teacher"], "content");
  requireValue(content.templateId === templateId, "content.templateId", "Jenis aktivitas pada hasil tidak sesuai.");
  string(content.title, 90, "content.title");
  strings(content.instructions, 3, 140, "content.instructions");
  requireValue(Array.isArray(content.items) && TEMPLATE_CAPACITIES[templateId].includes(content.items.length), "content.items");
  content.items.forEach((item, i) => {
    const path = `content.items.${i}`;
    object(item, ["id", "front", "back", "assetId"], path);
    string(item.id, 60, `${path}.id`);
    string(item.front, 64, `${path}.front`, templateId === "cube");
    string(item.back, 180, `${path}.back`, templateId !== "fold");
    requireValue(item.assetId === null || assets.has(item.assetId), `${path}.assetId`, "Gambar tidak tersedia.");
  });
  const ids = content.items.map(item => item.id);
  requireValue(new Set(ids).size === ids.length, "content.items", "ID kartu harus unik.");
  for (const field of ["pairs", "order", "groups"]) requireValue(Array.isArray(content[field]), `content.${field}`);
  if (templateId === "match") {
    content.pairs.forEach((pair, i) => {
      object(pair, ["itemId", "target"], `content.pairs.${i}`);
      string(pair.target, 110, `content.pairs.${i}.target`);
    });
    requireValue(isPermutation(content.pairs.map(pair => pair.itemId), ids), "content.pairs");
  } else requireValue(content.pairs.length === 0, "content.pairs");
  if (templateId === "sequence") requireValue(isPermutation(content.order, ids), "content.order");
  else requireValue(content.order.length === 0, "content.order");
  if (templateId === "group") {
    requireValue(content.groups.length === ids.length / 3, "content.groups");
    content.groups.forEach((group, i) => {
      const path = `content.groups.${i}`;
      object(group, ["id", "label", "itemIds"], path);
      string(group.id, 60, `${path}.id`);
      string(group.label, 48, `${path}.label`);
      requireValue(Array.isArray(group.itemIds) && group.itemIds.length === 3, `${path}.itemIds`);
    });
    requireValue(new Set(content.groups.map(group => group.id)).size === content.groups.length, "content.groups");
    requireValue(new Set(content.groups.map(group => group.label.trim().toLowerCase())).size === content.groups.length,
      "content.groups", "Nama kelompok harus unik.");
    requireValue(isPermutation(content.groups.flatMap(group => group.itemIds), ids), "content.groups");
  } else requireValue(content.groups.length === 0, "content.groups");
  object(content.teacher, ["preparation", "notes"], "content.teacher");
  strings(content.teacher.preparation, 5, 160, "content.teacher.preparation");
  string(content.teacher.notes, 600, "content.teacher.notes", true);
  return structuredClone(content);
}

function isPermutation(values, ids) {
  return values.length === ids.length && new Set(values).size === ids.length && values.every(id => ids.includes(id));
}

export function validateWorksheetPatch(patch, templateId) {
  requireValue(patch !== null && typeof patch === "object" && !Array.isArray(patch), "body");
  const keys = Object.keys(patch);
  requireValue(keys.length > 0 && keys.every(key => ["content", "theme"].includes(key)), "body",
    "Hanya isi dan tema LKPD yang dapat diubah.");
  const result = {};
  if (Object.hasOwn(patch, "content")) result.content = validateWorksheetContent(patch.content, templateId);
  if (Object.hasOwn(patch, "theme")) {
    requireValue(["ink", "color"].includes(patch.theme), "theme");
    result.theme = patch.theme;
  }
  return result;
}
