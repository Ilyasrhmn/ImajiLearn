import { scheduleRoute } from "@/server/schedule/runtime.mjs";
export const runtime = "nodejs";
export const POST = scheduleRoute("create");
