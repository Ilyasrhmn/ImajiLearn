import { worksheetRoute } from "@/server/documents/worksheets/runtime.mjs";
export const runtime = "nodejs";
export const GET = worksheetRoute("detail");
export const PATCH = worksheetRoute("update");
export const DELETE = worksheetRoute("remove");
