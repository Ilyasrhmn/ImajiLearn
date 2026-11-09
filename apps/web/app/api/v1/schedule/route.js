import { scheduleRoute } from "@/server/schedule/runtime.mjs";
export const runtime = "nodejs";
export const GET = scheduleRoute("get");
