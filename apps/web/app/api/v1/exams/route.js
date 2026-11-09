import { examRoute } from "@/server/exams/runtime.mjs";

export const runtime = "nodejs";
export const GET = examRoute("list");
export const POST = examRoute("create");
