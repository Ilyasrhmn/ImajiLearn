import { sessionRoute } from "@/server/accounts/runtime.mjs";
export const runtime = "nodejs";
export const GET = sessionRoute("session");
