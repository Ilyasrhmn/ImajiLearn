import { ContractError } from "../../../../packages/contracts/validation.mjs";

export class ApiError extends Error {
  constructor(status, code, message, fields, headers) {
    super(message);
    Object.assign(this, { status, code, fields, headers });
  }
}

export function errorResponse(error, requestId) {
  const known = error instanceof ApiError || error instanceof ContractError;
  const unavailable = ["DATABASE_CONFIGURATION_ERROR", "P1001", "P1002", "P1017", "ECONNREFUSED"].includes(error?.code);
  if (!known) console.error(JSON.stringify({ requestId, code: unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR" }));
  return Response.json({ error: {
    code: known ? error.code : unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
    message: known ? error.message : "Layanan belum dapat memproses permintaan. Coba lagi.",
    ...(known && error.fields ? { fields: error.fields } : {}), requestId,
  } }, { status: known ? error.status : unavailable ? 503 : 500,
    headers: { "cache-control": "no-store", "x-request-id": requestId, ...(known ? error.headers : {}) } });
}
