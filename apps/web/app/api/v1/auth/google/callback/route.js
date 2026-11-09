import { googleRoute } from "@/server/accounts/google/runtime.mjs";
export const runtime = "nodejs";
export const GET = googleRoute("callback");
