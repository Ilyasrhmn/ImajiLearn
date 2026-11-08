import { digest } from "./crypto.mjs";
import { ApiError } from "./errors.mjs";

function rejectRateLimit(windowStart, windowMs) {
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000));
  throw new ApiError(429, "RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi nanti.", undefined, { "retry-after": String(retryAfter) });
}

export async function checkRateLimit(db, key, max, windowMs) {
  const row = await db.rateLimit.findUnique({ where: { key: digest(key) } });
  if (row && row.count >= max && row.windowStart.getTime() + windowMs > Date.now()) rejectRateLimit(row.windowStart, windowMs);
}

export async function consumeRateLimit(db, key, max, windowMs) {
  const hashed = digest(key), now = new Date();
  await db.rateLimit.updateMany({
    where: { key: hashed, windowStart: { lte: new Date(now.getTime() - windowMs) } },
    data: { count: 0, windowStart: now },
  });
  const row = await db.rateLimit.upsert({ where: { key: hashed },
    create: { key: hashed, count: 1, windowStart: now }, update: { count: { increment: 1 } },
  });
  if (row.count > max) rejectRateLimit(row.windowStart, windowMs);
}
