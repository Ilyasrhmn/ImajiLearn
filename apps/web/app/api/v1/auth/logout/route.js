import { sessionRoute } from "@/server/accounts/runtime.mjs";
export const runtime = "nodejs";
export const POST = sessionRoute("logout");
