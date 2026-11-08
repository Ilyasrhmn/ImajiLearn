import { ApiError } from "./errors.mjs";
import { digest } from "./crypto.mjs";

export async function withIdempotency(db, { userId, route, key, payload }, operation) {
  if (typeof key !== "string" || !/^[\x21-\x7e]{1,100}$/.test(key)) {
    throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Kirim Idempotency-Key unik, maksimal 100 karakter.");
  }
  const requestHash = digest(JSON.stringify(payload));
  return db.$transaction(async tx => {
    const where = { userId_route_key: { userId, route, key } };
    await tx.idempotency.createMany({ data: [{ userId, route, key, requestHash, expiresAt: new Date(Date.now() + 86400000) }], skipDuplicates: true });
    // The reservation lock serializes retries of this key until the result commits.
    const record = await tx.idempotency.update({ where, data: { lockVersion: { increment: 1 } } });
    if (record.expiresAt.getTime() > Date.now()) {
      if (record.requestHash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Kunci permintaan sudah digunakan untuk data berbeda.");
      if (record.response !== null) return record.response;
    }
    const response = await operation(tx);
    await tx.idempotency.update({ where, data: { requestHash, response, expiresAt: new Date(Date.now() + 86400000) } });
    return response;
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
}
