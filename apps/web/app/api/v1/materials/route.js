import { materialRoute } from "@/server/materials/runtime.mjs";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = materialRoute("list");
export const POST = materialRoute("create");
