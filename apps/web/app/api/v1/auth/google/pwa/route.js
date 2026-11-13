import { googleRoute } from "@/server/accounts/google/runtime.mjs";
export const runtime = "nodejs";
export const POST = googleRoute("start", { pwa: true });
