import { folderRoute } from "@/server/folders/runtime.mjs";
export const runtime = "nodejs";
export const GET = folderRoute("list");
export const POST = folderRoute("create");
