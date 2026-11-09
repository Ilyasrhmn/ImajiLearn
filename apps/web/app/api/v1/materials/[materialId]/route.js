import { materialRoute } from "@/server/materials/runtime.mjs";
export const runtime = "nodejs";
export const GET = materialRoute("get");
export const PATCH = materialRoute("patch");
export const DELETE = materialRoute("remove");
