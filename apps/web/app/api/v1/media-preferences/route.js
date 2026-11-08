import { mediaPreferenceRoute } from "@/server/documents/media-preferences/runtime.mjs";
export const runtime = "nodejs";
export const GET = mediaPreferenceRoute("list");
