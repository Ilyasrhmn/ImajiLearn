export class ContractError extends Error {
  constructor(message, fields) {
    super(message);
    this.status = 422;
    this.code = "VALIDATION_ERROR";
    this.fields = fields;
  }
}

export function object(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ContractError("Isi permintaan harus berupa objek JSON.");
  }
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new ContractError("Permintaan memuat field yang tidak dikenal.");
  }
  return body;
}

export function text(value, field, max, { min = 1, trim = true } = {}) {
  const clean = typeof value === "string" && trim ? value.trim() : value;
  if (typeof clean !== "string" || clean.length < min || clean.length > max) {
    throw new ContractError("Periksa kembali isian Anda.", { [field]: `Panjang harus ${min}–${max} karakter.` });
  }
  return clean;
}

export const opaqueId = value => text(value, "materialId", 100);
