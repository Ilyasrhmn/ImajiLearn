import { ContractError, object, opaqueId } from "./validation.mjs";

export const MEDIA_IDS = Object.freeze(["reading", "mindmap", "slides", "song"]);
export const SONG_TEMPLATE_IDS = Object.freeze(["balonku", "cicak_dinding", "potong_bebek"]);

export function parseMediaPreference(body) {
  object(body, ["selectedMedia", "songTemplateId"]);
  const { selectedMedia, songTemplateId = "balonku" } = body;
  if (!Array.isArray(selectedMedia) || selectedMedia.length > 4 ||
      selectedMedia.some(id => !MEDIA_IDS.includes(id)) || new Set(selectedMedia).size !== selectedMedia.length) {
    throw new ContractError("Pilihan media tidak valid.", { selectedMedia: "Pilih 0–4 media yang berbeda dari katalog." });
  }
  if (!SONG_TEMPLATE_IDS.includes(songTemplateId)) {
    throw new ContractError("Template lagu tidak valid.", { songTemplateId: "Pilih template lagu dari katalog." });
  }
  return { selectedMedia: MEDIA_IDS.filter(id => selectedMedia.includes(id)), songTemplateId };
}

export function parseMaterialIds(value) {
  if (typeof value !== "string" || !value || value.split(",").length > 100) {
    throw new ContractError("Isi materialIds dengan 1–100 ID materi.");
  }
  const ids = value.split(",").map(opaqueId);
  const canonical = ids.map(id => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? id.toLowerCase() : id);
  if (new Set(canonical).size !== canonical.length) throw new ContractError("ID materi tidak boleh berulang.");
  return canonical;
}
