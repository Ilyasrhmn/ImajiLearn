import { songRoute } from "@/server/materials/song-runtime.mjs";
export const runtime = "nodejs";
export const GET = songRoute("audio");
