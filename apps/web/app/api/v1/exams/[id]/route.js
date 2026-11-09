import { examRoute } from "@/server/exams/runtime.mjs";

export const runtime = "nodejs";
export const GET = examRoute("get");
export const PATCH = examRoute("patch");
export const DELETE = examRoute("remove");
