import { folderRoute } from "@/server/folders/runtime.mjs";
export const runtime = "nodejs";
export const PATCH = folderRoute("rename");
export const DELETE = folderRoute("remove");
