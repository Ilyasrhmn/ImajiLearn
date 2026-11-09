import { scheduleRoute } from "@/server/schedule/runtime.mjs";
export const runtime = "nodejs";
export const PATCH = scheduleRoute("update");
export const DELETE = scheduleRoute("remove");
